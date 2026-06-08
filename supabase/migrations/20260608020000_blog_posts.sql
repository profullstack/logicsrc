-- Blog posts ingested via the autoblog webhook (/api/webhooks/blog).
-- Source of truth for /blog, /blog/[slug], /blog/rss.xml, and sitemap.xml.
-- Writes happen only through the service-role key (the webhook); the public
-- (anon) key can read published posts.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,                 -- autoblog Post.id (idempotency)
  slug text not null unique,
  title text not null,
  excerpt text,
  html text not null,
  markdown text,
  url text,
  canonical_url text,
  author jsonb,
  tags text[] not null default '{}',
  categories text[] not null default '{}',
  featured_image jsonb,
  status text not null default 'published',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_published_idx
  on public.blog_posts (published_at desc)
  where status = 'published';

alter table public.blog_posts enable row level security;

-- Public can read published posts; everything else is service-role only
-- (service_role bypasses RLS, so no insert/update policy is needed).
drop policy if exists "blog_posts public read" on public.blog_posts;
create policy "blog_posts public read"
  on public.blog_posts for select
  using (status = 'published');
