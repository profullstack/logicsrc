-- CoinPay hosted checkout sessions opened for Hire Us (metered agent-hours).
-- One row per cs_ session, written when the session opens; the signed webhook
-- marks it paid. Settled payments stay in hire_us_payments (one row per CoinPay
-- payment id), which now also carries the session id.

create table if not exists public.hire_us_checkouts (
  session_id text primary key,               -- CoinPay checkout session id (cs_...)
  account_id text not null,                  -- CoinPay account (OAuth sub) or the buyer email for guests
  buyer_email text not null,
  hours numeric(10, 2) not null,
  rate_usd_per_hour numeric(10, 2) not null,
  amount_usd numeric(12, 2) not null,
  status text not null default 'open' check (status in ('open', 'paid', 'expired')),
  payment_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists hire_us_checkouts_account_idx on public.hire_us_checkouts (account_id);

alter table public.hire_us_payments add column if not exists checkout_session_id text;
create index if not exists hire_us_payments_session_idx on public.hire_us_payments (checkout_session_id);

-- No policies: anon/authenticated cannot read or write; the service role bypasses RLS.
alter table public.hire_us_checkouts enable row level security;
grant all on public.hire_us_checkouts to service_role;
