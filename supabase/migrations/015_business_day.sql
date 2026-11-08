-- Migration 015: business day for shops open past midnight.
-- Orders after midnight but before day_end_hour count for the day before (sales, daily summary, daily dish limits).
-- NULL = Auto (latest closing time after midnight + 1 hour; midnight if the shop closes before midnight).
-- Run once in Supabase → SQL Editor (before or after deploying — until it is run, days stay midnight to midnight). Safe to run twice.

alter table settings add column if not exists day_end_hour int;
alter table settings drop constraint if exists settings_day_end_hour_check;
alter table settings add constraint settings_day_end_hour_check check (day_end_hour is null or day_end_hour between 0 and 6);
