import { createHmac, timingSafeEqual } from "node:crypto";

// Server-side CoinPay + session helpers, ported from the legacy server.js so the
// Next API routes keep identical behavior (eligibility-driven payment rails,
// signed webhook verification, and HMAC-signed OAuth session cookies).

export const COINPAY_OAUTH_STATE_COOKIE = "logicsrc_coinpay_oauth_state";
export const COINPAY_SESSION_COOKIE = "logicsrc_coinpay_session";

export interface MerchantEligibility {
  accepts_card: boolean;
  accepts_crypto: boolean;
  chains: string[];
}

export interface PaymentRail {
  method: "both" | "card" | "crypto";
  currency: string;
  blockchain: string | null;
}

export interface CoinPayOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer: string;
  scopes: string;
}

export function parseJson(text: string): Record<string, unknown> {
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function fetchMerchantEligibility(
  apiUrl: string,
  apiKey: string | undefined,
  merchantId: string | undefined
): Promise<MerchantEligibility | null> {
  if (!merchantId) {
    return null;
  }

  try {
    const url = new URL("/api/payments/merchant-eligibility", apiUrl);
    url.searchParams.set("merchant_id", merchantId);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey ?? ""}` }
    });
    const text = await response.text();
    const payload = parseJson(text);

    if (!response.ok || payload.success !== true) {
      console.warn("[coinpay] merchant eligibility unavailable", {
        status: response.status,
        error: (payload.error as string) || text.slice(0, 120)
      });
      return null;
    }

    return {
      accepts_card: payload.accepts_card === true,
      accepts_crypto: payload.accepts_crypto === true,
      chains: Array.isArray(payload.chains)
        ? (payload.chains as unknown[]).filter((chain): chain is string => typeof chain === "string")
        : []
    };
  } catch (error) {
    console.warn("[coinpay] merchant eligibility request failed", error);
    return null;
  }
}

export function choosePaymentRail(
  eligibility: MerchantEligibility | null,
  configuredBlockchain: string
): PaymentRail | null {
  const cryptoCurrency = configuredBlockchain.toLowerCase();

  if (!eligibility) {
    return { method: "both", currency: cryptoCurrency, blockchain: configuredBlockchain };
  }

  const configuredChainAvailable = eligibility.chains
    .map((chain) => chain.toUpperCase())
    .includes(configuredBlockchain.toUpperCase());
  const acceptsConfiguredCrypto = eligibility.accepts_crypto && configuredChainAvailable;

  if (eligibility.accepts_card && acceptsConfiguredCrypto) {
    return { method: "both", currency: cryptoCurrency, blockchain: configuredBlockchain };
  }

  if (eligibility.accepts_card) {
    return { method: "card", currency: "card", blockchain: null };
  }

  if (acceptsConfiguredCrypto) {
    return { method: "crypto", currency: cryptoCurrency, blockchain: configuredBlockchain };
  }

  return null;
}

export function verifyCoinPayWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  try {
    const parts = signatureHeader.split(",").map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
    const signature = parts.find((part) => part.startsWith("v1="))?.slice(3);
    if (!timestamp || !signature) {
      return false;
    }

    const timestampSeconds = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) {
      return false;
    }

    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const actualBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function getCoinPayOAuthConfig(): CoinPayOAuthConfig | null {
  const clientId = process.env.COINPAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.COINPAY_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.COINPAY_OAUTH_REDIRECT_URI;
  const issuer = process.env.COINPAY_OAUTH_ISSUER || process.env.COINPAY_API_URL || "https://coinpayportal.com";
  const scopes = process.env.COINPAY_OAUTH_SCOPES || "openid profile email";

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri, issuer, scopes };
}

function getSessionSecret(): string {
  const secret = process.env.LOGICSRC_SESSION_SECRET || process.env.COINPAY_OAUTH_CLIENT_SECRET;
  if (!secret) {
    throw new Error("LOGICSRC_SESSION_SECRET or COINPAY_OAUTH_CLIENT_SECRET must be set");
  }
  return secret;
}

export function signSession(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySession(value: string): Record<string, unknown> | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface CookieOptions {
  maxAge?: number;
  path?: string;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "HttpOnly", "SameSite=Lax", `Path=${options.path || "/"}`];

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if ((process.env.PUBLIC_URL || "").startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
