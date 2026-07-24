-- SQL script to create or update lift_logs table in Supabase with RLS enabled.
-- Run this in your Supabase SQL Editor (SQL Editor -> New query -> Paste & Run)

create extension if not exists pgcrypto;

-- 1. Create lift_logs table if not exists
create table if not exists public.lift_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  lift_type text not null check (lift_type in ('Squat', 'Bench Press', 'Deadlift')),
  weight_kg numeric not null check (weight_kg > 0),
  sets integer not null check (sets > 0),
  reps integer not null check (reps > 0),
  notes text,
  tags text[],
  logged_date timestamptz not null default now()
);

-- 2. Add columns if table already existed without notes & tags
alter table public.lift_logs add column if not exists notes text;
alter table public.lift_logs add column if not exists tags text[];

-- 3. Indexes for performance
create index if not exists lift_logs_user_date_idx on public.lift_logs (user_id, logged_date desc);
create index if not exists lift_logs_user_lift_idx on public.lift_logs (user_id, lift_type);

-- 4. Enable Row Level Security (RLS)
alter table public.lift_logs enable row level security;

-- 5. RLS Policies
drop policy if exists "Users can view their own lift logs" on public.lift_logs;
create policy "Users can view their own lift logs"
  on public.lift_logs
  for select
  using (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));

drop policy if exists "Users can insert their own lift logs" on public.lift_logs;
create policy "Users can insert their own lift logs"
  on public.lift_logs
  for insert
  with check (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));

drop policy if exists "Users can update their own lift logs" on public.lift_logs;
create policy "Users can update their own lift logs"
  on public.lift_logs
  for update
  using (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));

drop policy if exists "Users can delete their own lift logs" on public.lift_logs;
create policy "Users can delete their own lift logs"
  on public.lift_logs
  for delete
  using (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));
