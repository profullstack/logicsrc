import { NextResponse } from "next/server";

// JSON responses are never cached, matching the legacy server.js `sendJson`.
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers }
  });
}
