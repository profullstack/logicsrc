-- Function defaults and a stray backup table (2026-10-26 fleet audit).
--
-- The one exposed SECURITY DEFINER function is the rls_auto_enable event
-- trigger; it is revoked from anon/authenticated with every trigger function.
-- blog_posts_bak_20261014 had RLS off and full anon/authenticated grants, so
-- the anon key could read, rewrite or delete it.

-- Trigger and event-trigger functions are never RPCs.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- New functions are not executable by PUBLIC/anon/authenticated by default.
-- A new function the browser calls (or an RLS policy uses) needs an explicit
-- GRANT EXECUTE ... TO anon, authenticated.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

alter table public.blog_posts_bak_20261014 enable row level security;
revoke all on public.blog_posts_bak_20261014 from anon, authenticated;
