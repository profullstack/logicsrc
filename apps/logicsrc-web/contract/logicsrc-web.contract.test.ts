import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "../src/proxy";
import { renderPageMarkup } from "@/lib/page-markup";
import { choosePaymentRail, signSession, verifyCoinPayWebhook, verifySession } from "@/lib/coinpay";
import { POST as coinpayCheckout } from "@/app/api/hire-us/coinpay-checkout/route";
import { POST as projectRequest } from "@/app/api/hire-us/project-request/route";
import { GET as oauthStart } from "@/app/api/oauth/coinpay/start/route";
import { GET as oauthCallback } from "@/app/api/oauth/coinpay/callback/route";
import { GET as oauthSession } from "@/app/api/oauth/coinpay/session/route";
import { POST as coinpayWebhook } from "@/app/api/webhooks/coinpay/route";

// CoinPay/OAuth/webhook env keys we clear between tests so each case controls
// exactly what is configured.
const COINPAY_ENV_KEYS = [
  "COINPAY_API_KEY",
  "COINPAY_API_URL",
  "COINPAY_ELIGIBILITY_API_KEY",
  "COINPAY_AGENT_API_KEY",
  "COINPAY_BUSINESS_ID",
  "COINPAY_MERCHANT_ID",
  "COINPAY_ELIGIBILITY_MERCHANT_ID",
  "COINPAY_HIRE_US_BLOCKCHAIN",
  "PUBLIC_URL",
  "COINPAY_WEBHOOK_SECRET",
  "COINPAY_OAUTH_ISSUER",
  "COINPAY_OAUTH_CLIENT_ID",
  "COINPAY_OAUTH_CLIENT_SECRET",
  "COINPAY_OAUTH_REDIRECT_URI",
  "LOGICSRC_SESSION_SECRET"
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of COINPAY_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of COINPAY_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("www canonical redirect (proxy.ts)", () => {
  it("301s www to the apex host over https, preserving path + query", () => {
    const request = new NextRequest("https://www.logicsrc.com/openspec?ref=email", {
      headers: { host: "www.logicsrc.com" }
    });
    const response = proxy(request);

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://logicsrc.com/openspec?ref=email");
  });

  it("passes through apex requests untouched", () => {
    const request = new NextRequest("https://logicsrc.com/hire-us", {
      headers: { host: "logicsrc.com" }
    });
    const response = proxy(request);

    // NextResponse.next() yields a non-redirect response.
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("server-rendered page markup", () => {
  it("includes canonical section content and the CoinPay connect action", () => {
    const markup = renderPageMarkup();
    expect(markup).toContain("LogicSRC vs OpenSpec.dev");
    expect(markup).toContain("Open replacement architecture for secrets");
    expect(markup).toContain("/api/oauth/coinpay/start");
    expect(markup).toContain('id="project-request-form"');
  });
});

describe("payment rail selection", () => {
  it("prefers both when card and configured crypto are available", () => {
    expect(
      choosePaymentRail({ accepts_card: true, accepts_crypto: true, chains: ["USDC_POL"] }, "USDC_POL")
    ).toEqual({ method: "both", currency: "usdc_pol", blockchain: "USDC_POL" });
  });

  it("falls back to card when configured crypto is unavailable", () => {
    expect(
      choosePaymentRail({ accepts_card: true, accepts_crypto: false, chains: [] }, "USDC_POL")
    ).toEqual({ method: "card", currency: "card", blockchain: null });
  });

  it("uses crypto only when card is not enabled", () => {
    expect(
      choosePaymentRail({ accepts_card: false, accepts_crypto: true, chains: ["USDC_POL"] }, "USDC_POL")
    ).toEqual({ method: "crypto", currency: "usdc_pol", blockchain: "USDC_POL" });
  });

  it("returns null when no rail is available", () => {
    expect(choosePaymentRail({ accepts_card: false, accepts_crypto: false, chains: [] }, "USDC_POL")).toBeNull();
  });
});

describe("POST /api/hire-us/coinpay-checkout", () => {
  it("does not create checkout without server credentials", async () => {
    const response = await coinpayCheckout(
      new NextRequest("http://localhost/api/hire-us/coinpay-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ success: false, error: "CoinPay checkout is not configured" });
  });

  it("creates a checkout with card and crypto when both rails are available", async () => {
    process.env.COINPAY_API_KEY = "cp_test_key";
    process.env.COINPAY_API_URL = "https://coinpayportal.example";
    process.env.COINPAY_BUSINESS_ID = "business-123";
    process.env.COINPAY_ELIGIBILITY_MERCHANT_ID = "merchant-123";
    process.env.COINPAY_HIRE_US_BLOCKCHAIN = "USDC_POL";
    process.env.PUBLIC_URL = "https://logicsrc.test";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/payments/merchant-eligibility")) {
        return jsonResponse({ success: true, accepts_card: true, accepts_crypto: true, chains: ["USDC_POL"] });
      }
      if (url.includes("/api/payments/create")) {
        return jsonResponse(
          { success: true, payment: { id: "pay_123", stripe_checkout_url: "https://checkout.stripe.test/session" } },
          201
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = await coinpayCheckout(
      new NextRequest("http://localhost/api/hire-us/coinpay-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer@example.com" })
      })
    );
    const body = await response.json();

    const createCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === "string" ? input : input.toString()).includes("/api/payments/create")
    );
    const createBody = JSON.parse((createCall?.[1]?.body as string) ?? "{}");

    expect(response.status).toBe(201);
    expect(body.payment.checkout_url).toBe("https://checkout.stripe.test/session");
    expect(createCall?.[1]?.headers).toMatchObject({ authorization: "Bearer cp_test_key" });
    expect(createBody).toMatchObject({
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

  it("uses card-only checkout when configured crypto is not available", async () => {
    process.env.COINPAY_API_KEY = "cp_test_key";
    process.env.COINPAY_API_URL = "https://coinpayportal.example";
    process.env.COINPAY_BUSINESS_ID = "business-123";
    process.env.COINPAY_ELIGIBILITY_MERCHANT_ID = "merchant-123";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/payments/merchant-eligibility")) {
        return jsonResponse({ success: true, accepts_card: true, accepts_crypto: false, chains: [] });
      }
      return jsonResponse(
        { success: true, payment: { id: "pay_123", stripe_checkout_url: "https://checkout.stripe.test/card-only" } },
        201
      );
    });

    const response = await coinpayCheckout(
      new NextRequest("http://localhost/api/hire-us/coinpay-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer@example.com" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.payment.checkout_url).toBe("https://checkout.stripe.test/card-only");
  });

  it("does not create checkout when no payment rail is available", async () => {
    process.env.COINPAY_API_KEY = "cp_test_key";
    process.env.COINPAY_API_URL = "https://coinpayportal.example";
    process.env.COINPAY_BUSINESS_ID = "business-123";
    process.env.COINPAY_ELIGIBILITY_MERCHANT_ID = "merchant-123";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({ success: true, accepts_card: false, accepts_crypto: false, chains: [] })
    );

    const response = await coinpayCheckout(
      new NextRequest("http://localhost/api/hire-us/coinpay-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer@example.com" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ success: false, error: "CoinPay checkout is not available for this merchant" });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (typeof input === "string" ? input : input.toString()).includes("/api/payments/create")
      )
    ).toBe(false);
  });
});

describe("POST /api/hire-us/project-request", () => {
  it("accepts a valid project request before invoicing", async () => {
    const response = await projectRequest(
      new NextRequest("http://localhost/api/hire-us/project-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contact: "buyer@example.com",
          project: "Build a LogicSRC plugin and API contract for a recurring agent workflow."
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      success: true,
      request: { status: "pending_acceptance", amount_usd: 250, interval: "week", invoice: "created_after_acceptance" }
    });
    expect(body.request.id).toMatch(/^hire_/);
  });

  it("rejects an incomplete project request", async () => {
    const response = await projectRequest(
      new NextRequest("http://localhost/api/hire-us/project-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: "", project: "too short" })
      })
    );

    expect(response.status).toBe(422);
  });
});

describe("CoinPay OAuth", () => {
  it("returns 503 from start when OAuth is not configured", async () => {
    const response = await oauthStart();
    expect(response.status).toBe(503);
  });

  it("starts OAuth with a registered callback and state cookie", async () => {
    process.env.COINPAY_OAUTH_ISSUER = "https://coinpayportal.example";
    process.env.COINPAY_OAUTH_CLIENT_ID = "cp_test_client";
    process.env.COINPAY_OAUTH_CLIENT_SECRET = "cps_test_secret";
    process.env.COINPAY_OAUTH_REDIRECT_URI = "https://logicsrc.com/api/oauth/coinpay/callback";

    const response = await oauthStart();
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://coinpayportal.example");
    expect(location.pathname).toBe("/api/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("cp_test_client");
    expect(location.searchParams.get("redirect_uri")).toBe("https://logicsrc.com/api/oauth/coinpay/callback");
    expect(location.searchParams.get("state")).toMatch(/^[a-f0-9]{32}$/);
    expect(response.headers.get("set-cookie")).toContain("logicsrc_coinpay_oauth_state=");
  });

  it("rejects a callback with mismatched state", async () => {
    process.env.COINPAY_OAUTH_ISSUER = "https://coinpayportal.example";
    process.env.COINPAY_OAUTH_CLIENT_ID = "cp_test_client";
    process.env.COINPAY_OAUTH_CLIENT_SECRET = "cps_test_secret";
    process.env.COINPAY_OAUTH_REDIRECT_URI = "https://logicsrc.com/api/oauth/coinpay/callback";

    const response = await oauthCallback(
      new NextRequest("http://localhost/api/oauth/coinpay/callback?code=abc&state=wrong", {
        headers: { cookie: "logicsrc_coinpay_oauth_state=expected" }
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/?coinpay_oauth=error&error=invalid_state");
  });

  it("exchanges a callback code and stores a verifiable session", async () => {
    process.env.COINPAY_OAUTH_ISSUER = "https://coinpayportal.example";
    process.env.COINPAY_OAUTH_CLIENT_ID = "cp_test_client";
    process.env.COINPAY_OAUTH_CLIENT_SECRET = "cps_test_secret";
    process.env.COINPAY_OAUTH_REDIRECT_URI = "https://logicsrc.com/api/oauth/coinpay/callback";
    process.env.LOGICSRC_SESSION_SECRET = "session_secret_for_tests";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/oauth/token")) {
        return jsonResponse({ access_token: "access_token_123", token_type: "Bearer", scope: "openid profile email" });
      }
      if (url.includes("/api/oauth/userinfo")) {
        return jsonResponse({ sub: "merchant-123", email: "merchant@example.com", name: "Merchant User" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const callback = await oauthCallback(
      new NextRequest("http://localhost/api/oauth/coinpay/callback?code=auth_code_123&state=state_123", {
        headers: { cookie: "logicsrc_coinpay_oauth_state=state_123" }
      })
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/?coinpay_oauth=connected");

    const setCookies = callback.headers.getSetCookie();
    const sessionCookie = setCookies.find((cookie) => cookie.startsWith("logicsrc_coinpay_session="));
    expect(sessionCookie).toBeTruthy();
    const sessionValue = decodeURIComponent(sessionCookie!.split(";")[0].split("=")[1]);

    const session = await oauthSession(
      new NextRequest("http://localhost/api/oauth/coinpay/session", {
        headers: { cookie: `logicsrc_coinpay_session=${encodeURIComponent(sessionValue)}` }
      })
    );
    const sessionBody = await session.json();

    expect(sessionBody).toMatchObject({
      authenticated: true,
      user: { provider: "coinpay", sub: "merchant-123", email: "merchant@example.com", name: "Merchant User" }
    });
  });
});

describe("session signing", () => {
  it("verifies a session it signed and rejects tampering", () => {
    process.env.LOGICSRC_SESSION_SECRET = "session_secret_for_tests";
    const token = signSession({ provider: "coinpay", sub: "merchant-123" });
    expect(verifySession(token)).toMatchObject({ provider: "coinpay", sub: "merchant-123" });
    expect(verifySession(`tampered`)).toBeNull();
    expect(verifySession(`.extra`)).toBeNull();
  });
});

describe("POST /api/webhooks/coinpay", () => {
  it("returns 503 when no webhook secret is configured", async () => {
    const response = await coinpayWebhook(
      new NextRequest("http://localhost/api/webhooks/coinpay", { method: "POST", body: "{}" })
    );
    expect(response.status).toBe(503);
  });

  it("rejects unsigned webhooks", async () => {
    process.env.COINPAY_WEBHOOK_SECRET = "whsec_test";
    const response = await coinpayWebhook(
      new NextRequest("http://localhost/api/webhooks/coinpay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "payment.confirmed", data: { payment_id: "pay_123" } })
      })
    );
    expect(response.status).toBe(401);
  });

  it("accepts signed webhooks", async () => {
    const secret = "whsec_test";
    process.env.COINPAY_WEBHOOK_SECRET = secret;
    const payload = JSON.stringify({ id: "evt_1", type: "payment.forwarded", data: { payment_id: "pay_123" } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

    expect(verifyCoinPayWebhook(payload, `t=${timestamp},v1=${signature}`, secret)).toBe(true);
    expect(verifyCoinPayWebhook(payload, `t=${timestamp}, v1=${signature}`, secret)).toBe(true);

    const response = await coinpayWebhook(
      new NextRequest("http://localhost/api/webhooks/coinpay", {
        method: "POST",
        headers: { "content-type": "application/json", "x-coinpay-signature": `t=${timestamp},v1=${signature}` },
        body: payload
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, complete: true, payment_id: "pay_123" });
  });
});
