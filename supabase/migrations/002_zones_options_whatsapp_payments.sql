-- Migration 002: delivery zones, item options, WhatsApp templates, card payments.
-- Run once in Supabase → SQL Editor BEFORE deploying this version.
-- Safe to run on the live database: it only adds things, and the current app keeps working.

-- ---------- Delivery zones ----------
create table if not exists delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fee numeric(10,2) not null default 0 check (fee >= 0),
  min_order numeric(10,2),            -- null = use the global minimum
  active boolean not null default true,
  sort int not null default 0
);
alter table delivery_zones enable row level security;
drop policy if exists "public read zones" on delivery_zones;
create policy "public read zones" on delivery_zones for select using (true);
drop policy if exists "staff all zones" on delivery_zones;
create policy "staff all zones" on delivery_zones for all to authenticated using (true) with check (true);

alter table orders add column if not exists zone_name text default '';

-- ---------- Item options ----------
-- option_groups: [{ id, name, required, max, choices: [{ id, name, price, available }] }]
--   max = 1 → pick one (radio); max > 1 → pick up to N (checkboxes)
alter table menu_items  add column if not exists option_groups jsonb not null default '[]'::jsonb;
-- options: snapshot of what the customer picked: [{ group, name, price }]
alter table order_items add column if not exists options jsonb not null default '[]'::jsonb;

-- ---------- WhatsApp message templates (editable in Settings) ----------
alter table settings add column if not exists whatsapp_templates jsonb not null default '{}'::jsonb;

-- ---------- Card payments ----------
alter table settings add column if not exists card_enabled boolean not null default false;

alter table orders add column if not exists payment_status text not null default 'unpaid';
alter table orders add column if not exists payment_ref text;
alter table orders add column if not exists paid_at timestamptz;

do $$ begin
  alter table orders add constraint orders_payment_status_check
    check (payment_status in ('unpaid','pending','paid','failed'));
exception when duplicate_object then null; end $$;

-- New status for card orders that haven't been paid yet (hidden from the kitchen).
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending_payment','new','accepted','preparing','ready','out_for_delivery','completed','rejected'));

create index if not exists orders_payment_ref_idx on orders (payment_ref);
