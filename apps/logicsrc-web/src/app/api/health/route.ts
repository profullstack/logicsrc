import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase";

// A cached answer reports the cache's health, not the app's.
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

// GET /api/health — public liveness + database check for status.profullstack.com.
// A filesystem route, so it wins over the CommandBoard `/api/:path*` rewrite.
// One head-only PostgREST query with a 3s cap; the failure reason is never returned.
export async function GET() {
  try {
    const { error } = await publicClient()
      .from("blog_posts")
      .select("slug", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw error;
  } catch {
    return NextResponse.json({ status: "error", db: "down" }, { status: 503, headers });
  }
  return NextResponse.json({ status: "ok", db: "ok" }, { headers });
}
