import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHmac } from "node:crypto";
import { accessSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: ChildProcessWithoutNullStreams;
const port = 4291;
const baseUrl = `http://127.0.0.1:${port}`;
let nextCheckoutPort = 4292;

beforeAll(async () => {
  accessSync(new URL("../dist/index.html", import.meta.url));
  server = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      COINPAY_API_KEY: "",
      COINPAY_API_URL: "https://coinpayportal.example"
    }
  });

  await waitForServer(baseUrl);
});

afterAll(() => {
  server?.kill();
});

describe("LogicSRC web contracts", () => {
  it("serves SPA routes from the built app shell", async () => {
    for (const route of ["/", "/openspec", "/credential-sharing", "/docs", "/blog", "/hire-us", "/about", "/terms", "/privacy"]) {
      const response = await fetch(`${baseUrl}${route}`);
      const text = await response.text();

      expect(response.status, route).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(text).toContain('<div id="app"></div>');
    }
  });

  it("serves sitemap.xml as XML with canonical routes", async () => {
    const response = await fetch(`${baseUrl}/sitemap.xml`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).toContain("<loc>https://logicsrc.com/openspec</loc>");
    expect(text).toContain("<loc>https://logicsrc.com/credential-sharing</loc>");
    expect(text).toContain("<loc>https://logicsrc.com/hire-us</loc>");
    expect(text).toContain("<loc>https://logicsrc.com/blog</loc>");
  });

  it("serves blog/rss.xml as RSS XML", async () => {
    const response = await fetch(`${baseUrl}/blog/rss.xml`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).toContain("<rss version=\"2.0\"");
    expect(text).toContain("<title>LogicSRC OpenSpec Compatibility</title>");
    expect(text).toContain("<title>LogicSRC Credential Sharing OpenSpec</title>");
  });

  it("does not create CoinPay checkout without server credentials", async () => {
    const response = await fetch(`${baseUrl}/api/hire-us/coinpay-checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ success: false, error: "CoinPay checkout is not configured" });
  });

  it("creates CoinPay checkout with card and crypto when both rails are available", async () => {
    const { response, body, upstreamRequests } = await createCheckout({
      eligibility: { accepts_card: true, accepts_crypto: true, chains: ["USDC_POL"] },
      payment: { stripe_checkout_url: "https://checkout.stripe.test/session" }
    });
    const paymentRequest = upstreamRequests.find((request) => request.url === "/api/payments/create");

    expect(response.status).toBe(201);
    expect(body.payment.checkout_url).toBe("https://checkout.stripe.test/session");
    expect(paymentRequest?.method).toBe("POST");
    expect(paymentRequest?.authorization).toBe("Bearer cp_test_key");
    expect(paymentRequest?.body).toMatchObject({
      business_id: "business-123",
      amount_usd: 250,
      payment_method: "both",
      currency: "usdc_pol",
      blockchain: "USDC_POL",
      description: "LogicSRC Hire Us - $250/week",
      success_url: "https://logicsrc.test/hire-us?payment=success",
      cancel_url: "https://logicsrc.test/hire-us?payment=cancelled",
      redirect_url: "https://logicsrc.test/hire-us?payment=coinpay",
      webhook_url: "https://logicsrc.test/api/webhooks/coinpay",
      metadata: {
        product: "logicsrc-hire-us",
        interval: "week",
        source: "logicsrc.com/hire-us",
        buyer_email: "buyer@example.com"
      }
    });
  });

  it("uses card-only checkout when Stripe is available and configured crypto is not", async () => {
    const { response, body, upstreamRequests } = await createCheckout({
      eligibility: { accepts_card: true, accepts_crypto: false, chains: [] },
      payment: { stripe_checkout_url: "https://checkout.stripe.test/card-only" }
    });
    const paymentRequest = upstreamRequests.find((request) => request.url === "/api/payments/create");

    expect(response.status).toBe(201);
    expect(body.payment.checkout_url).toBe("https://checkout.stripe.test/card-only");
    expect(paymentRequest?.body).toMatchObject({
      payment_method: "card",
      currency: "card"
    });
    expect(paymentRequest?.body).not.toHaveProperty("blockchain");
  });

  it("uses crypto-only checkout when Stripe is not enabled", async () => {
    const { response, body, upstreamRequests } = await createCheckout({
      eligibility: { accepts_card: false, accepts_crypto: true, chains: ["USDC_POL"] },
      payment: {}
    });
    const paymentRequest = upstreamRequests.find((request) => request.url === "/api/payments/create");

    expect(response.status).toBe(201);
    expect(body.payment.checkout_url).toBeNull();
    expect(body.payment.address).toBe("0xabc");
    expect(paymentRequest?.body).toMatchObject({
      payment_method: "crypto",
      currency: "usdc_pol",
      blockchain: "USDC_POL"
    });
  });

  it("does not create CoinPay checkout when no payment rail is available", async () => {
    const { response, body, upstreamRequests } = await createCheckout({
      eligibility: { accepts_card: false, accepts_crypto: false, chains: [] },
      payment: {}
    });

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: "CoinPay checkout is not available for this merchant"
    });
    expect(upstreamRequests.some((request) => request.url === "/api/payments/create")).toBe(false);
  });

  it("accepts Hire Us project requests before creating a recurring invoice", async () => {
    const { appServer, appBaseUrl } = await startApp({});

    try {
      const response = await fetch(`${appBaseUrl}/api/hire-us/project-request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact: "buyer@example.com",
          project: "Build a LogicSRC plugin and API contract for a recurring agent workflow."
        })
      });
      const body = await response.json();

      expect(response.status).toBe(202);
      expect(body).toMatchObject({
        success: true,
        request: {
          status: "pending_acceptance",
          amount_usd: 250,
          interval: "week",
          invoice: "created_after_acceptance"
        }
      });
      expect(body.request.id).toMatch(/^hire_/);
    } finally {
      appServer.kill();
    }
  });

  it("accepts signed CoinPay payment webhooks", async () => {
    const secret = "whsec_test";
    const { appServer, appBaseUrl } = await startApp({
      COINPAY_API_KEY: "cp_test_key",
      COINPAY_MERCHANT_ID: "business-123",
      COINPAY_WEBHOOK_SECRET: secret
    });
    const payload = JSON.stringify({
      id: "evt_1",
      type: "payment.forwarded",
      data: { payment_id: "pay_123", status: "forwarded" }
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

    try {
      const response = await fetch(`${appBaseUrl}/api/webhooks/coinpay`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-coinpay-signature": `t=${timestamp},v1=${signature}`
        },
        body: payload
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ received: true, complete: true, payment_id: "pay_123" });
    } finally {
      appServer.kill();
    }
  });

  it("rejects unsigned CoinPay payment webhooks", async () => {
    const { appServer, appBaseUrl } = await startApp({
      COINPAY_API_KEY: "cp_test_key",
      COINPAY_MERCHANT_ID: "business-123",
      COINPAY_WEBHOOK_SECRET: "whsec_test"
    });

    try {
      const response = await fetch(`${appBaseUrl}/api/webhooks/coinpay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "payment.confirmed", data: { payment_id: "pay_123" } })
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({ success: false, error: "Invalid signature" });
    } finally {
      appServer.kill();
    }
  });

  it("starts CoinPay OAuth with a registered callback and state cookie", async () => {
    const { appServer, appBaseUrl } = await startApp({
      COINPAY_OAUTH_ISSUER: "https://coinpayportal.example",
      COINPAY_OAUTH_CLIENT_ID: "cp_test_client",
      COINPAY_OAUTH_CLIENT_SECRET: "cps_test_secret",
      COINPAY_OAUTH_REDIRECT_URI: "https://logicsrc.com/api/oauth/coinpay/callback"
    });

    try {
      const response = await fetch(`${appBaseUrl}/api/oauth/coinpay/start`, { redirect: "manual" });
      const location = new URL(response.headers.get("location") ?? "");

      expect(response.status).toBe(302);
      expect(location.origin).toBe("https://coinpayportal.example");
      expect(location.pathname).toBe("/api/oauth/authorize");
      expect(location.searchParams.get("response_type")).toBe("code");
      expect(location.searchParams.get("client_id")).toBe("cp_test_client");
      expect(location.searchParams.get("redirect_uri")).toBe("https://logicsrc.com/api/oauth/coinpay/callback");
      expect(location.searchParams.get("scope")).toBe("openid profile email");
      expect(location.searchParams.get("state")).toMatch(/^[a-f0-9]{32}$/);
      expect(response.headers.get("set-cookie")).toContain("logicsrc_coinpay_oauth_state=");
    } finally {
      appServer.kill();
    }
  });

  it("exchanges CoinPay OAuth callback codes and stores a signed session", async () => {
    const { fakeCoinPay, fakeCoinPayBaseUrl, tokenRequests } = await startFakeCoinPayOAuth();
    const { appServer, appBaseUrl } = await startApp({
      COINPAY_OAUTH_ISSUER: fakeCoinPayBaseUrl,
      COINPAY_OAUTH_CLIENT_ID: "cp_test_client",
      COINPAY_OAUTH_CLIENT_SECRET: "cps_test_secret",
      COINPAY_OAUTH_REDIRECT_URI: "https://logicsrc.com/api/oauth/coinpay/callback",
      LOGICSRC_SESSION_SECRET: "session_secret_for_tests"
    });

    try {
      const response = await fetch(`${appBaseUrl}/api/oauth/coinpay/callback?code=auth_code_123&state=state_123`, {
        redirect: "manual",
        headers: { cookie: "logicsrc_coinpay_oauth_state=state_123" }
      });
      const cookieHeader = response.headers.get("set-cookie") ?? "";
      const sessionCookie = cookieHeader.match(/logicsrc_coinpay_session=([^;]+)/)?.[0];

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/?coinpay_oauth=connected");
      expect(sessionCookie).toBeTruthy();
      expect(tokenRequests[0]).toMatchObject({
        grant_type: "authorization_code",
        code: "auth_code_123",
        redirect_uri: "https://logicsrc.com/api/oauth/coinpay/callback",
        client_id: "cp_test_client",
        client_secret: "cps_test_secret"
      });

      const sessionResponse = await fetch(`${appBaseUrl}/api/oauth/coinpay/session`, {
        headers: { cookie: sessionCookie ?? "" }
      });
      const sessionBody = await sessionResponse.json();

      expect(sessionBody).toMatchObject({
        authenticated: true,
        user: {
          provider: "coinpay",
          sub: "merchant-123",
          email: "merchant@example.com",
          name: "Merchant User",
          scope: "openid profile email"
        }
      });
    } finally {
      appServer.kill();
      await close(fakeCoinPay);
    }
  });
});

async function createCheckout({
  eligibility,
  payment
}: {
  eligibility: { accepts_card: boolean; accepts_crypto: boolean; chains: string[] };
  payment: Record<string, unknown>;
}) {
  const upstreamRequests: Array<{
    method?: string;
    url?: string;
    authorization?: string;
    body?: Record<string, unknown>;
  }> = [];

  const fakeCoinPay = createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      upstreamRequests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body: rawBody ? JSON.parse(rawBody) : undefined
      });

      if (request.method === "GET" && request.url?.startsWith("/api/payments/merchant-eligibility")) {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          merchant_id: "merchant-123",
          ...eligibility
        }));
        return;
      }

      if (request.method === "POST" && request.url === "/api/payments/create") {
        response.writeHead(201, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          payment: {
            id: "pay_123",
            amount_usd: 250,
            blockchain: "USDC_POL",
            amount_crypto: "499.5",
            payment_address: "0xabc",
            expires_at: "2030-01-01T00:00:00.000Z",
            status: "pending",
            ...payment
          }
        }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ success: false, error: "not found" }));
    });
  });

  await listen(fakeCoinPay);
  const fakeCoinPayPort = (fakeCoinPay.address() as AddressInfo).port;
  const appPort = nextCheckoutPort;
  nextCheckoutPort += 1;
  const { appServer, appBaseUrl } = await startApp({
      PORT: String(appPort),
      COINPAY_API_KEY: "cp_test_key",
      COINPAY_API_URL: `http://127.0.0.1:${fakeCoinPayPort}`,
      COINPAY_BUSINESS_ID: "business-123",
      COINPAY_ELIGIBILITY_MERCHANT_ID: "merchant-123",
      COINPAY_HIRE_US_BLOCKCHAIN: "USDC_POL",
      PUBLIC_URL: "https://logicsrc.test"
  });

  try {
    await waitForServer(appBaseUrl);

    const response = await fetch(`${appBaseUrl}/api/hire-us/coinpay-checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "buyer@example.com" })
    });
    const body = await response.json();

    return { response, body, upstreamRequests };
  } finally {
    appServer.kill();
    await close(fakeCoinPay);
  }
}

async function startApp(env: Record<string, string>) {
  const appPort = env.PORT ? Number(env.PORT) : nextCheckoutPort;
  if (!env.PORT) {
    nextCheckoutPort += 1;
  }
  const appBaseUrl = `http://127.0.0.1:${appPort}`;
  const appServer = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(appPort),
      COINPAY_API_URL: "https://coinpayportal.example",
      PUBLIC_URL: "https://logicsrc.test",
      ...env
    }
  });

  await waitForServer(appBaseUrl);
  return { appServer, appBaseUrl };
}

async function startFakeCoinPayOAuth() {
  const tokenRequests: Array<Record<string, string>> = [];
  const fakeCoinPay = createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      if (request.method === "POST" && request.url === "/api/oauth/token") {
        tokenRequests.push(Object.fromEntries(new URLSearchParams(rawBody)));
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          access_token: "access_token_123",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "refresh_token_123",
          scope: "openid profile email"
        }));
        return;
      }

      if (request.method === "GET" && request.url === "/api/oauth/userinfo") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          sub: "merchant-123",
          email: "merchant@example.com",
          name: "Merchant User"
        }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "not found" }));
    });
  });

  await listen(fakeCoinPay);
  const fakeCoinPayPort = (fakeCoinPay.address() as AddressInfo).port;
  return {
    fakeCoinPay,
    fakeCoinPayBaseUrl: `http://127.0.0.1:${fakeCoinPayPort}`,
    tokenRequests
  };
}

function listen(server: HttpServer) {
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server: HttpServer) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function waitForServer(serverBaseUrl: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${serverBaseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`LogicSRC web server did not start: ${String(lastError)}`);
}
