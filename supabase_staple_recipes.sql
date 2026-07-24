-- SQL script to create staple_recipes table in Supabase with RLS enabled.
-- Run this in your Supabase SQL Editor (SQL Editor -> New query -> Paste & Run)

create extension if not exists pgcrypto;

-- 1. Create staple_recipes table
create table if not exists public.staple_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  recipe_name text not null,
  meal_category text default 'Lunch',
  calories numeric not null check (calories >= 0),
  protein numeric not null check (protein >= 0),
  carbs numeric not null check (carbs >= 0),
  fat numeric not null check (fat >= 0),
  icon text default '🥗',
  created_at timestamptz not null default now()
);

-- 2. Indexes for performance
create index if not exists staple_recipes_user_idx on public.staple_recipes (user_id, created_at desc);

-- 3. Enable Row Level Security (RLS)
alter table public.staple_recipes enable row level security;

-- 4. RLS Policies (Allow authenticated users to read, insert, update, and delete their own recipes)
drop policy if exists "Users can view their own staple recipes" on public.staple_recipes;
create policy "Users can view their own staple recipes"
  on public.staple_recipes
  for select
  using (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));

drop policy if exists "Users can insert their own staple recipes" on public.staple_recipes;
create policy "Users can insert their own staple recipes"
  on public.staple_recipes
  for insert
  with check (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));

drop policy if exists "Users can update their own staple recipes" on public.staple_recipes;
create policy "Users can update their own staple recipes"
  on public.staple_recipes
  for update
  using (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));

drop policy if exists "Users can delete their own staple recipes" on public.staple_recipes;
create policy "Users can delete their own staple recipes"
  on public.staple_recipes
  for delete
  using (user_id = auth.uid() or user_id in (select id from public.users where id = user_id));
