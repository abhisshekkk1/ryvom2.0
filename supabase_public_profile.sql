-- SQL script to add public profile fields to user_settings and enable public read RLS policies.
-- Run this in your Supabase SQL Editor (SQL Editor -> New query -> Paste & Run)

create extension if not exists pgcrypto;

-- 1. Add public profile columns to user_settings
alter table public.user_settings add column if not exists username text unique;
alter table public.user_settings add column if not exists bio text;
alter table public.user_settings add column if not exists instagram_url text;
alter table public.user_settings add column if not exists youtube_url text;
alter table public.user_settings add column if not exists medium_url text;

-- 2. Index on username for fast public lookup
create index if not exists user_settings_username_idx on public.user_settings (lower(username));

-- 3. Enable public read access for user_settings, weight_logs, and lift_logs
alter table public.user_settings enable row level security;
alter table public.weight_logs enable row level security;
alter table public.lift_logs enable row level security;

-- Allow anyone (public/unauthenticated) to view user_settings
drop policy if exists "Public can view user settings" on public.user_settings;
create policy "Public can view user settings"
  on public.user_settings
  for select
  using (true);

drop policy if exists "Users can insert their own settings" on public.user_settings;
create policy "Users can insert their own settings"
  on public.user_settings
  for insert
  with check (user_id::text = auth.uid()::text);

drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can update their own settings"
  on public.user_settings
  for update
  using (user_id::text = auth.uid()::text);

drop policy if exists "Public can view weight logs" on public.weight_logs;
create policy "Public can view weight logs"
  on public.weight_logs
  for select
  using (true);

drop policy if exists "Users can insert own weight" on public.weight_logs;
create policy "Users can insert own weight"
  on public.weight_logs
  for insert
  with check (user_id::text = auth.uid()::text);

drop policy if exists "Users can update own weight" on public.weight_logs;
create policy "Users can update own weight"
  on public.weight_logs
  for update
  using (user_id::text = auth.uid()::text);

drop policy if exists "Users can delete own weight" on public.weight_logs;
create policy "Users can delete own weight"
  on public.weight_logs
  for delete
  using (user_id::text = auth.uid()::text);

drop policy if exists "Public can view lift logs" on public.lift_logs;
create policy "Public can view lift logs"
  on public.lift_logs
  for select
  using (true);

drop policy if exists "Users can insert own lifts" on public.lift_logs;
create policy "Users can insert own lifts"
  on public.lift_logs
  for insert
  with check (user_id::text = auth.uid()::text);

drop policy if exists "Users can update own lifts" on public.lift_logs;
create policy "Users can update own lifts"
  on public.lift_logs
  for update
  using (user_id::text = auth.uid()::text);

drop policy if exists "Users can delete own lifts" on public.lift_logs;
create policy "Users can delete own lifts"
  on public.lift_logs
  for delete
  using (user_id::text = auth.uid()::text);
