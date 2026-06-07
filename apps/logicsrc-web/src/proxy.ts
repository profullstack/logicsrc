import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Canonical host: 301 www.* to the bare apex domain over https, preserving
// path + query (e.g. https://www.logicsrc.com/foo -> https://logicsrc.com/foo).
// This is the Next 16 "proxy" (formerly middleware) entrypoint.
export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get("host") ?? "";
  if (host.startsWith("www.")) {
    const apexHost = host.slice("www.".length);
    const { pathname, search } = request.nextUrl;
    return NextResponse.redirect(`https://${apexHost}${pathname}${search}`, 301);
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
