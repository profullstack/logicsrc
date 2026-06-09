create table if not exists feed_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  homepage_url text,
  feed_url text not null unique,
  canonical_feed_url text,
  kind text not null default 'unknown',
  provider text not null,
  language text,
  image_url text,
  score numeric not null default 0,
  confidence numeric not null default 0,
  freshness_score numeric not null default 0,
  keyword_score numeric not null default 0,
  provider_score numeric not null default 0,
  last_published_at timestamptz,
  last_checked_at timestamptz,
  is_valid boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists feed_discovery_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  normalized_query text not null,
  type text default 'all',
  result_count integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists feed_discovery_results (
  query_id uuid references feed_discovery_queries(id) on delete cascade,
  source_id uuid references feed_sources(id) on delete cascade,
  rank integer not null,
  score numeric not null,
  created_at timestamptz default now(),
  primary key (query_id, source_id)
);

create table if not exists feed_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references feed_sources(id) on delete cascade,
  title text not null,
  url text not null unique,
  description text,
  published_at timestamptz,
  guid text,
  created_at timestamptz default now()
);

create table if not exists feed_provider_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  query text not null,
  status text not null,
  result_count integer default 0,
  error_message text,
  duration_ms integer,
  created_at timestamptz default now()
);
