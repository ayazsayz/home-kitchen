-- Migration 011: holidays/days off, fake-order protection.
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.

-- Holidays / days off: [{"from":"2026-03-20","to":"2026-03-22","note":"Eid"}]
alter table settings add column if not exists closures jsonb not null default '[]'::jsonb;

-- Numbers that can't place online orders
create table if not exists blocked_phones (
  phone text primary key,                  -- normalised, e.g. +971501234567
  reason text not null default '',
  blocked_by_name text not null default '',
  created_at timestamptz not null default now()
);
alter table blocked_phones enable row level security;
drop policy if exists "managers manage blocked" on blocked_phones;
create policy "managers manage blocked" on blocked_phones for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));
drop policy if exists "kitchen reads blocked" on blocked_phones;
create policy "kitchen reads blocked" on blocked_phones for select to authenticated using (public.has_role(array['cook']));

-- Max orders per phone number / per device in 10 minutes (0 = no limit)
alter table settings add column if not exists max_orders_phone int not null default 3 check (max_orders_phone >= 0);
alter table settings add column if not exists max_orders_device int not null default 6 check (max_orders_device >= 0);

-- Order flags for the kitchen
alter table orders add column if not exists first_order boolean not null default false; -- first order from this number
alter table orders add column if not exists client_hash text not null default '';       -- anonymised device/network id for rate limits
create index if not exists orders_phone_created_idx on orders (customer_phone, created_at desc);
create index if not exists orders_client_created_idx on orders (client_hash, created_at desc);
