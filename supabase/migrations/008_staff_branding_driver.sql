-- Migration 008: staff logins with roles, branding, delivery drivers.
-- Run once in Supabase → SQL Editor BEFORE deploying this version.
-- Every login that exists today becomes an OWNER, so nobody loses access.

-- ---------- Staff & roles ----------
create table if not exists staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null check (role in ('owner','manager','cook','driver')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into staff (user_id, name, email, role)
select id, coalesce(split_part(email, '@', 1), ''), coalesce(email, ''), 'owner' from auth.users
on conflict (user_id) do nothing;

-- Role of the signed-in user (null for customers / unknown users).
create or replace function public.staff_role() returns text
  language sql stable security definer set search_path = public
as $$ select role from staff where user_id = auth.uid() and active $$;

create or replace function public.has_role(roles text[]) returns boolean
  language sql stable security definer set search_path = public
as $$ select coalesce((select role from staff where user_id = auth.uid() and active) = any(roles), false) $$;

alter table staff enable row level security;
drop policy if exists "staff read self or owner" on staff;
create policy "staff read self or owner" on staff for select to authenticated
  using (user_id = auth.uid() or public.has_role(array['owner']));
drop policy if exists "owner manage staff" on staff;
create policy "owner manage staff" on staff for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));

-- ---------- Drivers ----------
alter table orders add column if not exists driver_id uuid references staff(user_id) on delete set null;
alter table orders add column if not exists driver_name text not null default '';
alter table orders add column if not exists picked_up_at timestamptz;
alter table orders add column if not exists delivered_at timestamptz;
create index if not exists orders_driver_idx on orders (driver_id) where driver_id is not null;

-- ---------- Branding ----------
alter table settings add column if not exists logo_url text not null default '';
alter table settings add column if not exists cover_url text not null default '';
alter table settings add column if not exists brand_color text not null default '#c2410c';
alter table settings add column if not exists tagline text not null default 'Home-cooked, made to order';

-- ---------- Replace "any logged-in user can do anything" with role-based rules ----------
-- owner: everything · manager: orders, menu, promos, expenses, customers · cook: orders · driver: own deliveries
drop policy if exists "staff all settings" on settings;
drop policy if exists "owner update settings" on settings;
create policy "owner update settings" on settings for update to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));

drop policy if exists "staff all categories" on categories;
drop policy if exists "managers write categories" on categories;
create policy "managers write categories" on categories for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "staff all menu" on menu_items;
drop policy if exists "managers write menu" on menu_items;
create policy "managers write menu" on menu_items for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "staff all zones" on delivery_zones;
drop policy if exists "owner write zones" on delivery_zones;
create policy "owner write zones" on delivery_zones for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));

drop policy if exists "staff all promos" on promo_codes;
drop policy if exists "managers all promos" on promo_codes;
create policy "managers all promos" on promo_codes for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "staff all expenses" on expenses;
drop policy if exists "managers all expenses" on expenses;
create policy "managers all expenses" on expenses for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "staff all orders" on orders;
drop policy if exists "kitchen read orders" on orders;
create policy "kitchen read orders" on orders for select to authenticated
  using (public.has_role(array['owner','manager','cook']));
drop policy if exists "kitchen update orders" on orders;
create policy "kitchen update orders" on orders for update to authenticated
  using (public.has_role(array['owner','manager','cook'])) with check (public.has_role(array['owner','manager','cook']));
drop policy if exists "owner delete orders" on orders;
create policy "owner delete orders" on orders for delete to authenticated using (public.has_role(array['owner']));
-- Drivers: delivery orders that are ready (unassigned or theirs), or that they are delivering / delivered.
drop policy if exists "driver read deliveries" on orders;
create policy "driver read deliveries" on orders for select to authenticated using (
  public.has_role(array['driver']) and order_type = 'delivery'
  and ((status = 'ready' and (driver_id is null or driver_id = auth.uid()))
       or (driver_id = auth.uid() and status in ('out_for_delivery','completed')))
);
drop policy if exists "driver update deliveries" on orders;
create policy "driver update deliveries" on orders for update to authenticated using (
  public.has_role(array['driver']) and order_type = 'delivery'
  and ((status = 'ready' and (driver_id is null or driver_id = auth.uid())) or (driver_id = auth.uid() and status = 'out_for_delivery'))
) with check (
  public.has_role(array['driver']) and driver_id = auth.uid() and status in ('out_for_delivery','completed')
);

drop policy if exists "staff all order_items" on order_items;
drop policy if exists "staff read order items" on order_items;
create policy "staff read order items" on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id)); -- visible when the order is visible to this user
drop policy if exists "owner write order items" on order_items;
create policy "owner write order items" on order_items for all to authenticated
  using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));

-- Storage: menu photos/branding (owner+manager), receipts (owner+manager).
drop policy if exists "staff upload menu images" on storage.objects;
create policy "staff upload menu images" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu' and public.has_role(array['owner','manager']));
drop policy if exists "staff update menu images" on storage.objects;
create policy "staff update menu images" on storage.objects for update to authenticated
  using (bucket_id = 'menu' and public.has_role(array['owner','manager']));
drop policy if exists "staff delete menu images" on storage.objects;
create policy "staff delete menu images" on storage.objects for delete to authenticated
  using (bucket_id = 'menu' and public.has_role(array['owner','manager']));
drop policy if exists "staff read receipts" on storage.objects;
create policy "staff read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.has_role(array['owner','manager']));
drop policy if exists "staff upload receipts" on storage.objects;
create policy "staff upload receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_role(array['owner','manager']));
drop policy if exists "staff delete receipts" on storage.objects;
create policy "staff delete receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.has_role(array['owner','manager']));
