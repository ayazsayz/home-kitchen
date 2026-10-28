-- Migration 004: configurable currency (symbol + decimal places) and 3-decimal amounts.
-- Run once in Supabase → SQL Editor BEFORE deploying this version.
-- Safe on the live database: existing amounts are kept exactly; the current app keeps working.

alter table settings add column if not exists currency_symbol text not null default '';   -- '' = use the usual symbol for the code
alter table settings add column if not exists currency_decimals int;                        -- null = usual for the code
do $$ begin
  alter table settings add constraint settings_currency_decimals_check check (currency_decimals is null or currency_decimals in (0, 2, 3));
exception when duplicate_object then null; end $$;

-- Allow 3 decimal places (KWD, BHD, OMR). Widening numeric(10,2) → numeric(12,3) keeps every existing value.
alter table settings       alter column delivery_fee type numeric(12,3), alter column min_order type numeric(12,3);
alter table menu_items     alter column price type numeric(12,3);
alter table orders         alter column subtotal type numeric(12,3), alter column delivery_fee type numeric(12,3),
                           alter column total type numeric(12,3), alter column discount type numeric(12,3);
alter table order_items    alter column unit_price type numeric(12,3), alter column line_total type numeric(12,3);
alter table delivery_zones alter column fee type numeric(12,3), alter column min_order type numeric(12,3);
alter table promo_codes    alter column value type numeric(12,3), alter column min_order type numeric(12,3),
                           alter column max_discount type numeric(12,3);
