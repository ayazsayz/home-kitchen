-- Migration 006: country, time zone and phone format are configurable (were fixed to UAE / Dubai).
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.

alter table settings add column if not exists country text not null default 'AE';
alter table settings add column if not exists timezone text not null default 'Asia/Dubai';      -- IANA name, e.g. Asia/Karachi
alter table settings add column if not exists phone_country_code text not null default '971';   -- digits only, e.g. 92

-- Expense dates default to "today" in the shop's own time zone.
create or replace function public.shop_today() returns date
  language sql stable security definer set search_path = public
as $$
  select (now() at time zone coalesce((select timezone from settings where id = 1), 'Asia/Dubai'))::date
$$;
alter table expenses alter column spent_on set default public.shop_today();
