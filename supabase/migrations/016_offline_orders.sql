-- Migration 016: offline orders. Staff orders taken without internet are saved on the device and uploaded later;
-- client_ref (made on the device) makes sure an order that is uploaded twice is only saved once.
-- Run once in Supabase → SQL Editor (before or after deploying — until it is run, uploads still work, just without the double-save guard). Safe to run twice.

alter table orders add column if not exists client_ref uuid;
create unique index if not exists orders_client_ref_key on orders (client_ref) where client_ref is not null;
