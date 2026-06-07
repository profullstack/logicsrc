import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import {
  COINPAY_OAUTH_STATE_COOKIE,
  COINPAY_SESSION_COOKIE,
  getCoinPayOAuthConfig,
  parseJson,
  serializeCookie,
  signSession
} from "@/lib/coinpay";

export const dynamic = "force-dynamic";

function redirectWithOAuthStatus(status: string, error?: string): NextResponse {
  const params = new URLSearchParams({ coinpay_oauth: status });
  if (error) {
    params.set("error", error);
  }
  return new NextResponse(null, { status: 302, headers: { location: `/?${params.toString()}` } });
}

// GET /api/oauth/coinpay/callback — validate state, exchange the code for tokens,
// fetch userinfo, and store a signed session cookie.
export async function GET(request: NextRequest) {
  const config = getCoinPayOAuthConfig();
  if (!config) {
    return json({ success: false, error: "CoinPay OAuth is not configured" }, 503);
  }

  const url = request.nextUrl;
  const callbackError = url.searchParams.get("error");
  if (callbackError) {
    return redirectWithOAuthStatus("error", callbackError);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get(COINPAY_OAUTH_STATE_COOKIE)?.value;

  if (!code) {
    return redirectWithOAuthStatus("error", "missing_code");
  }

  if (!state || !expectedState || state !== expectedState) {
    return redirectWithOAuthStatus("error", "invalid_state");
  }

  try {
    const tokenResponse = await fetch(new URL("/api/oauth/token", config.issuer), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret
      })
    });
    const tokenText = await tokenResponse.text();
    const tokenPayload = parseJson(tokenText);

    if (!tokenResponse.ok || typeof tokenPayload.access_token !== "string") {
      console.error("[coinpay-oauth] token exchange failed", {
        status: tokenResponse.status,
        error: (tokenPayload.error as string) || tokenText.slice(0, 160)
      });
      return redirectWithOAuthStatus("error", "token_exchange_failed");
    }

    const userResponse = await fetch(new URL("/api/oauth/userinfo", config.issuer), {
      headers: { authorization: `Bearer ${tokenPayload.access_token}` }
    });
    const userText = await userResponse.text();
    const userInfo = userResponse.ok ? parseJson(userText) : {};

    const session = signSession({
      provider: "coinpay",
      sub: typeof userInfo.sub === "string" ? userInfo.sub : null,
      email: typeof userInfo.email === "string" ? userInfo.email : null,
      name: typeof userInfo.name === "string" ? userInfo.name : null,
      scope: typeof tokenPayload.scope === "string" ? tokenPayload.scope : config.scopes,
      connected_at: new Date().toISOString()
    });

    const response = new NextResponse(null, {
      status: 302,
      headers: { location: "/?coinpay_oauth=connected" }
    });
    response.headers.append(
      "set-cookie",
      serializeCookie(COINPAY_SESSION_COOKIE, session, { maxAge: 60 * 60 * 24 * 30, path: "/" })
    );
    response.headers.append(
      "set-cookie",
      serializeCookie(COINPAY_OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/api/oauth/coinpay" })
    );
    return response;
  } catch (error) {
    console.error("[coinpay-oauth] callback failed", error);
    return redirectWithOAuthStatus("error", "callback_failed");
  }
}
