-- Migration 017: day closing — the cash count at the end of each business day.
-- Run once in Supabase → SQL Editor (before or after deploying — until it is run, the closing report works but can't be saved). Safe to run twice.
-- (Numbered 017 because 016 is used by the offline-orders change on the uat branch.)

create table if not exists day_closings (
  day date primary key,                               -- business day (see Settings → Hours → Business day ends at)
  orders int not null default 0,
  net_sales numeric(12,3) not null default 0,
  expected_cash numeric(12,3) not null default 0,     -- cash sales − expenses paid in cash
  counted_cash numeric(12,3) not null default 0,
  difference numeric(12,3) generated always as (counted_cash - expected_cash) stored,
  note text not null default '',
  closed_by uuid default auth.uid(),
  closed_by_name text not null default '',
  closed_at timestamptz not null default now()
);

alter table day_closings enable row level security;
drop policy if exists "owners and managers day closings" on day_closings;
create policy "owners and managers day closings" on day_closings for all to authenticated
  using (public.has_role(array['owner','manager'])) with check (public.has_role(array['owner','manager']));
