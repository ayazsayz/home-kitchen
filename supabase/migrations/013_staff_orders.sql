-- Migration 013: orders taken by staff (WhatsApp, phone, walk-in).
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.
alter table orders add column if not exists source text not null default 'web'
  check (source in ('web', 'whatsapp', 'phone', 'walkin'));
alter table orders add column if not exists created_by_name text not null default ''; -- staff member who entered it
