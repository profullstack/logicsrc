import type { NextRequest } from "next/server";
import { verifyAndParse } from "@profullstack/autoblog";
import { json } from "@/lib/http";
import { serviceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webhooks/blog — receive an autoblog `post.published` webhook,
// verify the Standard Webhooks signature against BLOG_WEBHOOK_SECRET, and
// upsert the post into blog_posts. There is no admin user: the shared
// secret is the only credential, identical to the other Profullstack
// autoblog receivers.
export async function POST(request: NextRequest) {
  const secret = process.env.BLOG_WEBHOOK_SECRET;
  if (!secret) {
    return json({ success: false, error: "Blog webhook is not configured" }, 503);
  }

  // Raw bytes — the signature is computed over the body as received.
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const result = verifyAndParse({ headers, body, opts: { secret } });
  if (!result.ok) {
    return json({ success: false, error: result.reason }, result.status);
  }

  const post = result.post;
  const supabase = serviceClient();
  const { error } = await supabase.from("blog_posts").upsert(
    {
      external_id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt ?? null,
      html: post.html,
      markdown: post.markdown ?? null,
      url: post.url ?? null,
      canonical_url: post.canonical_url ?? null,
      author: post.author ?? null,
      tags: post.tags ?? [],
      categories: post.categories ?? [],
      featured_image: post.featured_image ?? null,
      status: post.status ?? "published",
      published_at: post.published_at,
      updated_at: post.updated_at,
    },
    { onConflict: "slug" },
  );
  if (error) {
    return json({ success: false, error: error.message }, 500);
  }

  return json({ received: true, slug: post.slug });
}
