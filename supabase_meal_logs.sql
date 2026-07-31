-- meal_logs table for Ryvom 2.0
-- Creates the table used by AI Nutrition Tracker and Quick-Add logging
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  meal_name text not null,
  food_item text not null,
  state text default 'Cooked',
  weight_g numeric not null check (weight_g > 0),
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fats numeric not null default 0,
  logged_at timestamptz not null default now()
);

create index if not exists meal_logs_user_date_idx on public.meal_logs (user_id, logged_at desc);

alter table public.meal_logs enable row level security;

drop policy if exists "Users can view own meal logs" on public.meal_logs;
create policy "Users can view own meal logs"
  on public.meal_logs for select
  using (user_id::text = auth.uid()::text);

drop policy if exists "Users can insert own meal logs" on public.meal_logs;
create policy "Users can insert own meal logs"
  on public.meal_logs for insert
  with check (user_id::text = auth.uid()::text);

drop policy if exists "Users can update own meal logs" on public.meal_logs;
create policy "Users can update own meal logs"
  on public.meal_logs for update
  using (user_id::text = auth.uid()::text);

drop policy if exists "Users can delete own meal logs" on public.meal_logs;
create policy "Users can delete own meal logs"
  on public.meal_logs for delete
  using (user_id::text = auth.uid()::text);