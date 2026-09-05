import { gate } from "@/lib/crawl-gateway";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Canonical host: 301 www.* to the bare apex domain over https, preserving
// path + query (e.g. https://www.logicsrc.com/foo -> https://logicsrc.com/foo).
// This is the Next 16 "proxy" (formerly middleware) entrypoint.
const ALLOWED_APEX = process.env.PUBLIC_DOMAIN || "logicsrc.com";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Crawl gateway first: AI training crawlers get 402 Payment Required (or the
  // sales page at /crawl) unless they present a paid pass. People, Googlebot
  // and retrieval crawlers fall through to everything below.
  const answer = await gate(request);
  if (answer) return answer;

  const host = request.headers.get("host") ?? "";
  if (host === `www.${ALLOWED_APEX}`) {
    const { pathname, search } = request.nextUrl;
    return NextResponse.redirect(`https://${ALLOWED_APEX}${pathname}${search}`, 301);
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
