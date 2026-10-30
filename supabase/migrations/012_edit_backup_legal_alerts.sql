-- Migration 012: edit/cancel orders, weekly backup, privacy & terms, late-order alert, WhatsApp button, customer notes.
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.

-- Edit / cancel accepted orders (a cancelled order keeps status 'rejected' so it's left out of sales, stock and loyalty)
alter table orders add column if not exists cancel_reason text not null default '';
alter table orders add column if not exists cancelled_by_name text not null default '';
alter table orders add column if not exists edited_at timestamptz;
alter table orders add column if not exists edit_note text not null default '';

-- Settings
alter table settings add column if not exists late_minutes int not null default 30 check (late_minutes >= 0);   -- 0 = no late alert
alter table settings add column if not exists backup_weekly boolean not null default true;                        -- email a backup every Sunday
alter table settings add column if not exists whatsapp_button boolean not null default true;                      -- floating chat button on the menu
alter table settings add column if not exists legal_extra text not null default '';                               -- owner's own extra terms

-- Notes about a customer (allergies, VIP...) shown on their future orders
create table if not exists customer_notes (
  phone text primary key,
  note text not null default '',
  updated_by_name text not null default '',
  updated_at timestamptz not null default now()
);
alter table customer_notes enable row level security;
drop policy if exists "managers manage notes" on customer_notes;
create policy "managers manage notes" on customer_notes for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));
drop policy if exists "kitchen reads notes" on customer_notes;
create policy "kitchen reads notes" on customer_notes for select to authenticated using (public.has_role(array['cook']));
