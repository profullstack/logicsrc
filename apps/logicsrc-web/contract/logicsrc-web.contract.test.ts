import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "../src/proxy";
import { renderPageMarkup } from "@/lib/page-markup";
import { siteFooterHtml } from "@/lib/site-footer";
import { choosePaymentRail, signSession, verifyCoinPayWebhook, verifySession } from "@/lib/coinpay";
import { POST as coinpayCheckout } from "@/app/api/hire-us/coinpay-checkout/route";
import { setHireUsCheckoutStore, type HireUsCheckoutRow } from "@/lib/hire-us-payments";
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
  it("301s www to the apex host over https, preserving path + query", async () => {
    const request = new NextRequest("https://www.logicsrc.com/openspec?ref=email", {
      headers: { host: "www.logicsrc.com" }
    });
    const response = await proxy(request);

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://logicsrc.com/openspec?ref=email");
  });

  it("passes through apex requests untouched", async () => {
    const request = new NextRequest("https://logicsrc.com/hire-us", {
      headers: { host: "logicsrc.com" }
    });
    const response = await proxy(request);

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

  it("carries the Profullstack webring links (the ring verifier reads the homepage)", async () => {
    process.env.PROFULLSTACK_FOOTER_OFFLINE = "1";
    const markup = renderPageMarkup("/", await siteFooterHtml());
    expect(markup).toContain("data-pfs-footer");
    const from = "from=https%3A%2F%2Flogicsrc.com%2F";
    // @profullstack/footer 0.2.2 dropped the random and vote links from the ring nav.
    for (const hop of ["previous", "next"]) {
      expect(markup).toContain(`https://rssamplifier.com/ring/profullstack/${hop}?${from}`);
    }
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
  const SID = "cs_Ju1h16BXSobdRs7XWg9MUIj0";
  const recorded: HireUsCheckoutRow[] = [];
  beforeEach(() => {
    recorded.length = 0;
    setHireUsCheckoutStore({ recordOpen: async (row) => void recorded.push(row) });
  });
  afterEach(() => setHireUsCheckoutStore(null));

  function configure() {
    process.env.COINPAY_API_KEY = "cp_test_key";
    process.env.COINPAY_API_URL = "https://coinpayportal.example";
    process.env.PUBLIC_URL = "https://logicsrc.test";
  }

  function mockSessions(answer: Record<string, unknown> = {}, status = 201) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/checkout/sessions")) {
        return jsonResponse(
          {
            success: true,
            id: SID,
            url: `https://coinpayportal.example/checkout/${SID}`,
            status: "open",
            methods: [{ code: "USDC_POL" }, { code: "BTC" }, { code: "PAYPAL" }],
            expires_at: "2026-10-21T14:00:00.000Z",
            ...answer
          },
          status
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  const post = (body: unknown) =>
    coinpayCheckout(
      new NextRequest("http://localhost/api/hire-us/coinpay-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    );

  it("does not create checkout without server credentials", async () => {
    const response = await post({});
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ success: false, error: "CoinPay checkout is not configured" });
  });

  it("opens a hosted checkout session with email, account, property and metadata", async () => {
    configure();
    const fetchMock = mockSessions();

    const response = await post({ email: "Buyer@Example.com" });
    const body = await response.json();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const createBody = JSON.parse(String(init.body));

    expect(url).toBe("https://coinpayportal.example/api/checkout/sessions");
    expect(init.headers).toMatchObject({ authorization: "Bearer cp_test_key" });
    expect(createBody).toMatchObject({
      amount: 4000,
      currency: "USD",
      description: "LogicSRC Hire Us - 10 agent-hours @ $400/agent-hour",
      customer_email: "buyer@example.com",
      account_id: "buyer@example.com",
      property: "logicsrc.com",
      success_url: "https://logicsrc.test/hire-us?payment=success&session={CHECKOUT_SESSION_ID}",
      cancel_url: "https://logicsrc.test/hire-us?payment=cancelled",
      metadata: {
        product: "logicsrc-hire-us",
        billing: "metered_hours",
        hours: 10,
        rate_usd_per_hour: 400,
        source: "logicsrc.com/hire-us",
        property: "logicsrc.com",
        account_id: "buyer@example.com",
        email: "buyer@example.com",
        buyer_email: "buyer@example.com"
      }
    });
    expect(createBody.business_id).toBeUndefined();
    expect(response.status).toBe(201);
    expect(body.payment).toMatchObject({
      id: SID,
      session_id: SID,
      amount_usd: 4000,
      checkout_url: `https://coinpayportal.example/checkout/${SID}`,
      methods: ["USDC_POL", "BTC", "PAYPAL"]
    });
    expect(recorded).toEqual([
      { session_id: SID, account_id: "buyer@example.com", buyer_email: "buyer@example.com", hours: 10, rate_usd_per_hour: 400, amount_usd: 4000 }
    ]);
  });

  it("uses the signed-in CoinPay account as account_id", async () => {
    configure();
    process.env.COINPAY_OAUTH_CLIENT_SECRET = "oauth-secret-for-session-signing";
    const fetchMock = mockSessions();
    const cookie = signSession({ sub: "coinpay-user-9", email: "acct@example.com", exp: Math.floor(Date.now() / 1000) + 600 });

    const response = await coinpayCheckout(
      new NextRequest("http://localhost/api/hire-us/coinpay-checkout", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `logicsrc_coinpay_session=${cookie}` },
        body: "{}"
      })
    );
    expect(response.status).toBe(201);
    const createBody = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(createBody).toMatchObject({ account_id: "coinpay-user-9", customer_email: "acct@example.com" });
  });

  it("requires an email", async () => {
    configure();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await post({});
    expect(response.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prices the checkout from the approved hours", async () => {
    configure();
    const fetchMock = mockSessions();

    const response = await post({ hours: 25.25, email: "buyer@example.com" });
    const body = await response.json();
    const createBody = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

    expect(response.status).toBe(201);
    expect(createBody.amount).toBe(10100);
    expect(createBody.description).toBe("LogicSRC Hire Us - 25.25 agent-hours @ $400/agent-hour");
    expect(createBody.metadata).toMatchObject({ billing: "metered_hours", hours: 25.25, rate_usd_per_hour: 400 });
    expect(body.payment).toMatchObject({ amount_usd: 10100, hours: 25.25, rate_usd_per_hour: 400 });
  });

  it("rejects hours below the minimum engagement or off the quarter-hour", async () => {
    configure();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (const hours of [9.75, 12.3, "many", -40]) {
      const response = await post({ hours, email: "buyer@example.com" });
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body).toEqual({
        success: false,
        error: "Approved agent-hours must be a quarter-hour increment of at least 10"
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes CoinPay's refusal through and records nothing", async () => {
    configure();
    mockSessions({ success: false, id: undefined, url: undefined, code: "NO_PAYMENT_METHODS", error: "No payment methods" }, 400);
    const response = await post({ email: "buyer@example.com" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "No payment methods" });
    expect(recorded).toEqual([]);
  });

  it("refuses a checkout URL on another origin", async () => {
    configure();
    mockSessions({ url: "https://evil.example/checkout" });
    const response = await post({ email: "buyer@example.com" });
    expect(response.status).toBe(502);
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
      request: {
        status: "pending_acceptance",
        rate_usd_per_hour: 400,
        billing: "metered_hours",
        minimum_hours: 10,
        invoice: "created_after_acceptance"
      }
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

  it("does not create a session when userinfo omits the subject", async () => {
    process.env.COINPAY_OAUTH_ISSUER = "https://coinpayportal.example";
    process.env.COINPAY_OAUTH_CLIENT_ID = "cp_test_client";
    process.env.COINPAY_OAUTH_CLIENT_SECRET = "cps_test_secret";
    process.env.COINPAY_OAUTH_REDIRECT_URI = "https://logicsrc.com/api/oauth/coinpay/callback";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/oauth/token")) {
        return jsonResponse({ access_token: "access_token_123", token_type: "Bearer", scope: "openid profile email" });
      }
      if (url.includes("/api/oauth/userinfo")) {
        return jsonResponse({ email: "merchant@example.com", name: "Merchant User" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const callback = await oauthCallback(
      new NextRequest("http://localhost/api/oauth/coinpay/callback?code=auth_code_123&state=state_123", {
        headers: { cookie: "logicsrc_coinpay_oauth_state=state_123" }
      })
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/?coinpay_oauth=error&error=userinfo_failed");
    expect(callback.headers.getSetCookie().some((cookie) => cookie.startsWith("logicsrc_coinpay_session="))).toBe(false);
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
    expect(verifyCoinPayWebhook(payload, `t=${timestamp},v1=${signature}0`, secret)).toBe(false);

    const response = await coinpayWebhook(
      new NextRequest("http://localhost/api/webhooks/coinpay", {
        method: "POST",
        headers: { "content-type": "application/json", "x-coinpay-signature": `t=${timestamp},v1=${signature}` },
        body: payload
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // No Hire Us metadata: acknowledged as a handled no-op, nothing recorded.
    expect(body).toEqual({ received: true, handled: true, settled: false, reason: "unknown payment", payment_id: "pay_123" });
  });
});
