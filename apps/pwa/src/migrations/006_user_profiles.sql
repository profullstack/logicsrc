-- The signup profile (@profullstack/profile): email, first/last name, company
-- domain, job title, LinkedIn URL, keyed by users.id. Its own table so the
-- display_name teammates see stays as it is. No backfill: display_name holds
-- an email local-part or "logicsrc user", not a person's name.
create table if not exists "user_profiles" (
  "user_id" text primary key,
  "email" text,
  "first_name" text,
  "last_name" text,
  "company_domain" text,
  "job_title" text,
  "linkedin_url" text,
  "created_at" text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists "user_profiles_email" on "user_profiles" (lower("email"));
create index if not exists "user_profiles_company_domain" on "user_profiles" ("company_domain");
