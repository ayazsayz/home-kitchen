-- Migration 010: menu design — dish badges and delivery time estimate.
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.

-- Badges the owner ticks per dish: 'spicy', 'chef', 'new', 'suggest' (offer at checkout)
alter table menu_items add column if not exists tags text[] not null default '{}';

-- "Delivery in about N minutes" shown on the menu (null = hidden)
alter table settings add column if not exists eta_minutes int check (eta_minutes is null or eta_minutes between 5 and 240);
