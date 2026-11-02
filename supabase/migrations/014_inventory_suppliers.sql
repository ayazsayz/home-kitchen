-- Migration 014: stock / inventory, recipes, suppliers, purchases and supplier payments.
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database (and safe to run twice).

-- ---------- Stock items (ingredients & packaging) ----------
create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'pcs',                 -- pcs, kg, g, L, ml, pack, box…
  category text not null default '',
  qty numeric(14,3) not null default 0,             -- on hand (kept up to date by stock_moves)
  low_level numeric(14,3) not null default 0,       -- warn at or below this
  avg_cost numeric(14,4) not null default 0,        -- average cost per unit (updated when deliveries are received)
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- Every change to stock is a move; stock_items.qty is the running total.
create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  change numeric(14,3) not null,                    -- + in, − out
  kind text not null check (kind in ('purchase','sale','waste','count','adjust')),
  ref_id uuid,                                      -- order or purchase
  note text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists stock_moves_item_idx on stock_moves (stock_item_id, created_at desc);
create index if not exists stock_moves_kind_idx on stock_moves (kind, created_at desc);

-- What goes into one portion of a dish (e.g. Crispy Chicken Burger = 1 bun + 0.15 kg chicken + 1 box)
create table if not exists recipe_lines (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  qty numeric(14,4) not null check (qty > 0),
  primary key (menu_item_id, stock_item_id)
);

-- ---------- Suppliers & purchases ----------
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists purchase_no_seq;
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_no int not null default nextval('purchase_no_seq'),
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text not null default '',
  status text not null default 'ordered' check (status in ('ordered','received','cancelled')),
  total numeric(12,3) not null default 0,
  note text not null default '',
  expense_id uuid references expenses(id) on delete set null,
  received_on date,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists purchases_supplier_idx on purchases (supplier_id, created_at desc);

create table if not exists purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id) on delete restrict,
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0)
);

create table if not exists supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  amount numeric(12,3) not null check (amount > 0),
  paid_with text not null default 'cash' check (paid_with in ('cash','card','bank')),
  paid_on date not null default ((now() at time zone 'Asia/Dubai')::date),
  note text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);

-- Orders: has this order's stock been deducted (via recipes)?
alter table orders add column if not exists stock_deducted boolean not null default false;

-- ---------- Keep stock_items.qty in step with stock_moves ----------
create or replace function public.apply_stock_move() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update stock_items set qty = qty + new.change where id = new.stock_item_id;
  return new;
end $$;
drop trigger if exists stock_moves_apply on stock_moves;
create trigger stock_moves_apply after insert on stock_moves for each row execute function public.apply_stock_move();

-- ---------- Deduct ingredients when an order is completed (from its dishes' recipes) ----------
create or replace function public.deduct_order_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and not coalesce(new.stock_deducted, false) then
    insert into stock_moves (stock_item_id, change, kind, ref_id, note)
    select r.stock_item_id, -sum(r.qty * oi.qty), 'sale', new.id, 'Order #' || new.order_no
    from order_items oi join recipe_lines r on r.menu_item_id = oi.menu_item_id
    where oi.order_id = new.id
    group by r.stock_item_id;
    new.stock_deducted := true;
  end if;
  return new;
end $$;
drop trigger if exists orders_deduct_stock on orders;
create trigger orders_deduct_stock before update of status on orders for each row execute function public.deduct_order_stock();

-- ---------- Access rules ----------
-- Owner & manager manage everything; cooks can read stock (low-stock warning on the Orders screen).
alter table stock_items enable row level security;
alter table stock_moves enable row level security;
alter table recipe_lines enable row level security;
alter table suppliers enable row level security;
alter table purchases enable row level security;
alter table purchase_lines enable row level security;
alter table supplier_payments enable row level security;

drop policy if exists "managers stock items" on stock_items;
create policy "managers stock items" on stock_items for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));
drop policy if exists "kitchen reads stock" on stock_items;
create policy "kitchen reads stock" on stock_items for select to authenticated using (public.has_role(array['cook']));

drop policy if exists "managers stock moves" on stock_moves;
create policy "managers stock moves" on stock_moves for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "managers recipes" on recipe_lines;
create policy "managers recipes" on recipe_lines for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "managers suppliers" on suppliers;
create policy "managers suppliers" on suppliers for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "managers purchases" on purchases;
create policy "managers purchases" on purchases for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "managers purchase lines" on purchase_lines;
create policy "managers purchase lines" on purchase_lines for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

drop policy if exists "managers supplier payments" on supplier_payments;
create policy "managers supplier payments" on supplier_payments for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));

grant usage, select on sequence purchase_no_seq to authenticated, service_role;
