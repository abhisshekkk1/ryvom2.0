-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It creates the tables used by app.py. Existing compatible tables are preserved.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('coach', 'client')),
  created_at timestamptz not null default now()
);

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  serving_g numeric not null default 100 check (serving_g > 0),
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  fiber numeric,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists foods_name_idx on public.foods (name);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  meal_type text not null check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  meal_date timestamptz not null default now()
);

-- The first Ryvom prototype called this column meal_time. Upgrade that table
-- safely when it already exists instead of failing on the index below.
alter table public.meals
  add column if not exists meal_date timestamptz default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meals' and column_name = 'meal_time'
  ) then
    execute 'update public.meals set meal_date = meal_time where meal_date is null';
  end if;
end $$;

update public.meals set meal_date = now() where meal_date is null;
alter table public.meals alter column meal_date set not null;
create index if not exists meals_user_date_idx on public.meals (user_id, meal_date desc);

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  food_id uuid not null references public.foods(id),
  grams numeric not null check (grams > 0),
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workout_date date not null default current_date
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise text not null,
  set_no integer not null check (set_no > 0),
  reps integer not null check (reps > 0),
  weight numeric not null check (weight >= 0),
  rpe numeric check (rpe between 1 and 10)
);

create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  weight numeric,
  waist numeric,
  unique(user_id, date)
);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null references public.users(id) on delete cascade,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists coach_notes_client_created_idx on public.coach_notes (client_id, created_at desc);

-- Do not expose this prototype to the public while using custom password authentication.
-- Migrate to Supabase Auth before enabling RLS and deploying.
