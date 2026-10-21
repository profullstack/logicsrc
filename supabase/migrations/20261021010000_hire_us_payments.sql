-- Settled CoinPay payments for Hire Us (metered agent-hours).
-- Written only by the signed CoinPay webhook (/api/webhooks/coinpay) through the
-- service-role key. payment_id is CoinPay's payment id (data.payment_id in the
-- webhook, NOT the top-level event id), unique so a redelivered or duplicate
-- event can never book the same purchase twice.

create table if not exists public.hire_us_payments (
  payment_id text primary key,
  event_id text,
  event_type text,
  status text not null,
  amount_usd numeric(12, 2),
  hours numeric(10, 2),
  rate_usd_per_hour numeric(10, 2),
  account_id text,
  buyer_email text,
  property text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists hire_us_payments_account_idx on public.hire_us_payments (account_id);
create index if not exists hire_us_payments_email_idx on public.hire_us_payments (buyer_email);

-- No policies: anon/authenticated cannot read or write; the service role bypasses RLS.
alter table public.hire_us_payments enable row level security;
grant all on public.hire_us_payments to service_role;
