-- Migration 005: expenses (shopping, gas, packaging…) for the profit report.
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default ((now() at time zone 'Asia/Dubai')::date),
  category text not null default 'Other',
  description text not null default '',
  vendor text not null default '',
  amount numeric(12,3) not null check (amount >= 0),
  paid_with text not null default 'cash' check (paid_with in ('cash','card','bank')),
  receipt_path text,                              -- file in the private "receipts" bucket
  created_at timestamptz not null default now()
);
create index if not exists expenses_spent_on_idx on expenses (spent_on desc);

alter table expenses enable row level security;
-- Staff only. Customers can never see expenses.
drop policy if exists "staff all expenses" on expenses;
create policy "staff all expenses" on expenses for all to authenticated using (true) with check (true);

-- Editable list of expense categories.
alter table settings add column if not exists expense_categories jsonb not null default
  '["Meat","Chicken","Vegetables & fruit","Bread & buns","Dairy","Spices & oil","Groceries","Packaging","Gas","Delivery & fuel","Utilities","Rent","Salaries","Equipment","Marketing","Other"]'::jsonb;

-- Private bucket for receipt photos (only logged-in staff can read/upload).
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict do nothing;
drop policy if exists "staff read receipts" on storage.objects;
create policy "staff read receipts" on storage.objects for select to authenticated using (bucket_id = 'receipts');
drop policy if exists "staff upload receipts" on storage.objects;
create policy "staff upload receipts" on storage.objects for insert to authenticated with check (bucket_id = 'receipts');
drop policy if exists "staff delete receipts" on storage.objects;
create policy "staff delete receipts" on storage.objects for delete to authenticated using (bucket_id = 'receipts');
