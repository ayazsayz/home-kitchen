-- Migration 009: ratings & reviews, driver cash handover, dish profit, Arabic/Urdu.
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.

-- ---------- Ratings & reviews ----------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  customer_name text not null default '',
  customer_phone text not null default '',
  published boolean not null default false,   -- owner chooses which reviews show on the menu
  seen boolean not null default false,        -- low ratings stay flagged on the Orders screen until seen
  created_at timestamptz not null default now()
);
create index if not exists reviews_created_idx on reviews (created_at desc);
alter table reviews enable row level security;
-- Customers submit through the server; staff (owner/manager) read and manage.
drop policy if exists "managers all reviews" on reviews;
create policy "managers all reviews" on reviews for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));
drop policy if exists "kitchen read low reviews" on reviews;
create policy "kitchen read low reviews" on reviews for select to authenticated using (public.has_role(array['cook']));

-- ---------- Driver cash handover ----------
create table if not exists cash_handovers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references staff(user_id) on delete cascade,
  driver_name text not null default '',
  amount numeric(12,3) not null check (amount > 0),
  note text not null default '',
  received_by uuid references staff(user_id) on delete set null,
  received_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cash_handovers_driver_idx on cash_handovers (driver_id, created_at desc);
alter table cash_handovers enable row level security;
drop policy if exists "managers all handovers" on cash_handovers;
create policy "managers all handovers" on cash_handovers for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));
drop policy if exists "driver reads own handovers" on cash_handovers;
create policy "driver reads own handovers" on cash_handovers for select to authenticated
  using (public.has_role(array['driver']) and driver_id = auth.uid());

-- ---------- Dish profit ----------
alter table menu_items add column if not exists cost numeric(12,3) check (cost is null or cost >= 0); -- cost to make one
alter table order_items add column if not exists unit_cost numeric(12,3);                              -- snapshot when ordered

-- ---------- Arabic / Urdu ----------
alter table settings add column if not exists languages text[] not null default '{en}';   -- languages offered to customers
alter table settings add column if not exists default_language text not null default 'en';
alter table menu_items add column if not exists name_i18n jsonb not null default '{}'::jsonb;        -- {"ar": "...", "ur": "..."}
alter table menu_items add column if not exists description_i18n jsonb not null default '{}'::jsonb;
alter table categories add column if not exists name_i18n jsonb not null default '{}'::jsonb;
alter table orders add column if not exists lang text not null default 'en';                         -- customer's language (for WhatsApp)
