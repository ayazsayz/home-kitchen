-- Home Kitchen: run this once in Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- ---------- Settings (single row) ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'My Home Kitchen',
  phone text default '',
  address text default '',
  currency text not null default 'AED',
  delivery_fee numeric(10,2) not null default 0,
  min_order numeric(10,2) not null default 0,
  vat_percent numeric(5,2) not null default 0,   -- 0 = not VAT registered; prices are VAT-inclusive
  trn text default '',                            -- Tax Registration Number shown on receipts
  is_open boolean not null default true,
  closed_message text default 'We are closed right now. Please order later.',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

-- ---------- Menu ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text default '',
  price numeric(10,2) not null check (price >= 0),
  image_url text default '',
  available boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Orders ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity,
  status text not null default 'new'
    check (status in ('new','accepted','preparing','ready','out_for_delivery','completed','rejected')),
  order_type text not null default 'delivery' check (order_type in ('delivery','pickup')),
  customer_name text not null,
  customer_phone text not null,
  address text default '',
  notes text default '',
  subtotal numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  vat_percent numeric(5,2) not null default 0,
  payment_method text not null default 'cod',
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_created_idx on orders (created_at desc);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  name text not null,          -- snapshot, so old orders survive menu edits
  unit_price numeric(10,2) not null,
  qty int not null check (qty > 0),
  line_total numeric(10,2) not null
);

-- ---------- Security (RLS) ----------
-- Public (anon) can read the menu and settings only.
-- Orders are created/read by the server API with the service role key.
-- Logged-in staff (authenticated) can do everything.
alter table settings    enable row level security;
alter table categories  enable row level security;
alter table menu_items  enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;

drop policy if exists "public read settings" on settings;
create policy "public read settings" on settings for select using (true);
drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories for select using (true);
drop policy if exists "public read menu" on menu_items;
create policy "public read menu" on menu_items for select using (true);

drop policy if exists "staff all settings" on settings;
create policy "staff all settings" on settings for all to authenticated using (true) with check (true);
drop policy if exists "staff all categories" on categories;
create policy "staff all categories" on categories for all to authenticated using (true) with check (true);
drop policy if exists "staff all menu" on menu_items;
create policy "staff all menu" on menu_items for all to authenticated using (true) with check (true);
drop policy if exists "staff all orders" on orders;
create policy "staff all orders" on orders for all to authenticated using (true) with check (true);
drop policy if exists "staff all order_items" on order_items;
create policy "staff all order_items" on order_items for all to authenticated using (true) with check (true);

-- ---------- Realtime: new orders appear instantly on the dashboard ----------
do $$ begin
  alter publication supabase_realtime add table orders;
exception when duplicate_object then null; end $$;

-- ---------- Image storage for menu photos ----------
insert into storage.buckets (id, name, public) values ('menu', 'menu', true)
on conflict do nothing;
drop policy if exists "public read menu images" on storage.objects;
create policy "public read menu images" on storage.objects for select using (bucket_id = 'menu');
drop policy if exists "staff upload menu images" on storage.objects;
create policy "staff upload menu images" on storage.objects for insert to authenticated with check (bucket_id = 'menu');
drop policy if exists "staff update menu images" on storage.objects;
create policy "staff update menu images" on storage.objects for update to authenticated using (bucket_id = 'menu');
drop policy if exists "staff delete menu images" on storage.objects;
create policy "staff delete menu images" on storage.objects for delete to authenticated using (bucket_id = 'menu');

-- ---------- Sample menu (delete if not needed) ----------
do $$
declare c1 uuid; c2 uuid; c3 uuid;
begin
  if not exists (select 1 from categories) then
    insert into categories (name, sort) values ('Mains', 1) returning id into c1;
    insert into categories (name, sort) values ('Sides', 2) returning id into c2;
    insert into categories (name, sort) values ('Drinks', 3) returning id into c3;
    insert into menu_items (category_id, name, description, price, sort) values
      (c1, 'Chicken Biryani', 'Basmati rice, spiced chicken, raita', 28, 1),
      (c1, 'Mutton Karahi', 'Slow-cooked mutton, tomato, ginger', 42, 2),
      (c1, 'Daal Chawal', 'Yellow lentils with steamed rice', 18, 3),
      (c2, 'Garlic Naan', 'Fresh from the tawa', 4, 1),
      (c2, 'Samosa (2 pcs)', 'Potato and peas', 6, 2),
      (c3, 'Mango Lassi', 'Chilled yogurt drink', 9, 1),
      (c3, 'Karak Chai', 'Strong spiced tea', 3, 2);
  end if;
end $$;
