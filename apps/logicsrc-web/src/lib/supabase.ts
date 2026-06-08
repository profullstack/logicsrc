import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

// Public read client (anon key) — used by /blog, /blog/[slug], the RSS feed,
// and the sitemap. RLS limits it to published posts.
export function publicClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY) are required");
  }
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// Privileged client (service-role key) — used by the blog webhook to upsert
// posts. Bypasses RLS, so keep it server-only.
export function serviceClient(): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string | null;
  html: string;
  tags: string[];
  featured_image: { url?: string } | null;
  published_at: string;
  updated_at: string;
};
