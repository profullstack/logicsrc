import type { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { COINPAY_SESSION_COOKIE, verifySession } from "@/lib/coinpay";

export const dynamic = "force-dynamic";

// GET /api/oauth/coinpay/session — report whether a valid CoinPay session cookie
// is present and, if so, the connected user.
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(COINPAY_SESSION_COOKIE)?.value;
  const session = sessionCookie ? verifySession(sessionCookie) : null;
  return json({
    authenticated: !!session,
    user: session
      ? {
          provider: session.provider,
          sub: session.sub,
          email: session.email,
          name: session.name,
          scope: session.scope,
          connected_at: session.connected_at
        }
      : null
  });
}
