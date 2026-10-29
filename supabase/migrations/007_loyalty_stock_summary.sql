-- Migration 007: loyalty stamps, daily stock limits, daily summary email.
-- Run once in Supabase → SQL Editor BEFORE deploying this version. Safe on the live database.

-- ---------- Loyalty stamps ----------
-- Every Nth order (by mobile number) gets a reward, applied automatically at checkout.
alter table settings add column if not exists loyalty_enabled boolean not null default false;
alter table settings add column if not exists loyalty_every int not null default 10 check (loyalty_every between 2 and 100);
alter table settings add column if not exists loyalty_kind text not null default 'percent' check (loyalty_kind in ('percent','fixed'));
alter table settings add column if not exists loyalty_value numeric(12,3) not null default 20 check (loyalty_value >= 0);
alter table settings add column if not exists loyalty_max numeric(12,3);                        -- cap for percent rewards
alter table settings add column if not exists loyalty_min_order numeric(12,3) not null default 0; -- orders below this don't earn a stamp

-- Loyalty rewards are stored on the order like a promo, with promo_code = 'LOYALTY'.
create index if not exists orders_phone_idx on orders (customer_phone);

-- ---------- Daily stock limits ----------
alter table menu_items add column if not exists daily_limit int check (daily_limit is null or daily_limit >= 0); -- null = unlimited

-- ---------- Daily summary ----------
alter table settings add column if not exists summary_email text not null default '';
