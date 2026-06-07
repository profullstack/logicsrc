import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { json } from "@/lib/http";
import { COINPAY_OAUTH_STATE_COOKIE, getCoinPayOAuthConfig, serializeCookie } from "@/lib/coinpay";

export const dynamic = "force-dynamic";

// GET /api/oauth/coinpay/start — begin CoinPay OAuth: set a signed state cookie
// and redirect to the provider's authorize endpoint.
export async function GET() {
  const config = getCoinPayOAuthConfig();
  if (!config) {
    return json({ success: false, error: "CoinPay OAuth is not configured" }, 503);
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL("/api/oauth/authorize", config.issuer);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", config.scopes);
  authorizeUrl.searchParams.set("state", state);

  return new NextResponse(null, {
    status: 302,
    headers: {
      location: authorizeUrl.toString(),
      "set-cookie": serializeCookie(COINPAY_OAUTH_STATE_COOKIE, state, {
        maxAge: 600,
        path: "/api/oauth/coinpay"
      })
    }
  });
}
