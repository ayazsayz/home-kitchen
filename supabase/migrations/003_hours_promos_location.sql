-- Migration 003: opening hours & scheduled orders, promo codes, map pin.
-- Run once in Supabase → SQL Editor BEFORE deploying this version.
-- Safe on the live database: it only adds things, and the current app keeps working.

-- ---------- Opening hours & scheduled orders ----------
-- hours: { "0": [{"open":"12:00","close":"23:00"}], ..., "6": [...] }   0 = Sunday, times in Dubai time.
--        A day with [] is closed. close < open means past midnight (e.g. 18:00–01:00).
alter table settings add column if not exists auto_hours boolean not null default false;
alter table settings add column if not exists hours jsonb not null default '{}'::jsonb;
alter table settings add column if not exists allow_asap boolean not null default true;
alter table settings add column if not exists allow_scheduled boolean not null default false;
alter table settings add column if not exists slot_minutes int not null default 30 check (slot_minutes between 10 and 240);
alter table settings add column if not exists slot_capacity int not null default 0 check (slot_capacity >= 0); -- 0 = unlimited
alter table settings add column if not exists lead_minutes int not null default 45 check (lead_minutes between 0 and 1440);
alter table settings add column if not exists days_ahead int not null default 2 check (days_ahead between 0 and 14);

alter table orders add column if not exists scheduled_for timestamptz;   -- null = as soon as possible
create index if not exists orders_scheduled_idx on orders (scheduled_for) where scheduled_for is not null;

-- ---------- Promo codes ----------
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text default '',
  kind text not null default 'percent' check (kind in ('percent','fixed','free_delivery')),
  value numeric(10,2) not null default 0 check (value >= 0),   -- % for percent, AED for fixed
  min_order numeric(10,2) not null default 0,
  max_discount numeric(10,2),                                  -- cap for percent codes; null = no cap
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,                                             -- total uses; null = unlimited
  per_customer_limit int,                                      -- uses per phone number; null = unlimited
  first_order_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists promo_codes_code_idx on promo_codes (upper(code));
alter table promo_codes enable row level security;
-- No public policy: customers check codes through the server only.
drop policy if exists "staff all promos" on promo_codes;
create policy "staff all promos" on promo_codes for all to authenticated using (true) with check (true);

alter table orders add column if not exists promo_code text;
alter table orders add column if not exists discount numeric(10,2) not null default 0;
create index if not exists orders_promo_idx on orders (upper(promo_code)) where promo_code is not null;

-- ---------- Map pin ----------
alter table orders add column if not exists location_lat double precision;
alter table orders add column if not exists location_lng double precision;
alter table settings add column if not exists require_pin boolean not null default false;
alter table settings add column if not exists map_center_lat double precision not null default 25.2048;  -- Dubai
alter table settings add column if not exists map_center_lng double precision not null default 55.2708;
