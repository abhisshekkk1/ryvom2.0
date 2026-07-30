-- Supabase Full RLS Migration Script for Ryvom 2.0
-- Run this ONCE in Supabase SQL Editor to secure all tables.
-- This enables RLS and creates user-scoped policies for every table.

create extension if not exists pgcrypto;

-- ============================================================
-- public.users
-- ============================================================
alter table public.users enable row level security;

drop policy if exists "Users can view own record" on public.users;
create policy "Users can view own record"
  on public.users for select
  using (id = auth.uid());

drop policy if exists "Users can insert own record" on public.users;
create policy "Users can insert own record"
  on public.users for insert
  with check (id = auth.uid());

drop policy if exists "Users can update own record" on public.users;
create policy "Users can update own record"
  on public.users for update
  using (id = auth.uid());

-- ============================================================
-- foods (shared reference data, anyone authenticated can read)
-- ============================================================
alter table public.foods enable row level security;

drop policy if exists "Authenticated users can read foods" on public.foods;
create policy "Authenticated users can read foods"
  on public.foods for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert foods" on public.foods;
create policy "Authenticated users can insert foods"
  on public.foods for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- meals
-- ============================================================
alter table public.meals enable row level security;

drop policy if exists "Users can view own meals" on public.meals;
create policy "Users can view own meals"
  on public.meals for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own meals" on public.meals;
create policy "Users can insert own meals"
  on public.meals for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own meals" on public.meals;
create policy "Users can update own meals"
  on public.meals for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete own meals" on public.meals;
create policy "Users can delete own meals"
  on public.meals for delete
  using (user_id = auth.uid());

-- ============================================================
-- meal_items (scoped via parent meal's user_id)
-- ============================================================
alter table public.meal_items enable row level security;

drop policy if exists "Users can view meal items for own meals" on public.meal_items;
create policy "Users can view meal items for own meals"
  on public.meal_items for select
  using (
    meal_id in (
      select id from public.meals where user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert meal items for own meals" on public.meal_items;
create policy "Users can insert meal items for own meals"
  on public.meal_items for insert
  with check (
    meal_id in (
      select id from public.meals where user_id = auth.uid()
    )
  );

drop policy if exists "Users can update meal items for own meals" on public.meal_items;
create policy "Users can update meal items for own meals"
  on public.meal_items for update
  using (
    meal_id in (
      select id from public.meals where user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete meal items for own meals" on public.meal_items;
create policy "Users can delete meal items for own meals"
  on public.meal_items for delete
  using (
    meal_id in (
      select id from public.meals where user_id = auth.uid()
    )
  );

-- ============================================================
-- workouts
-- ============================================================
alter table public.workouts enable row level security;

drop policy if exists "Users can view own workouts" on public.workouts;
create policy "Users can view own workouts"
  on public.workouts for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own workouts" on public.workouts;
create policy "Users can insert own workouts"
  on public.workouts for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own workouts" on public.workouts;
create policy "Users can update own workouts"
  on public.workouts for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete own workouts" on public.workouts;
create policy "Users can delete own workouts"
  on public.workouts for delete
  using (user_id = auth.uid());

-- ============================================================
-- workout_sets (via parent workout's user_id)
-- ============================================================
alter table public.workout_sets enable row level security;

drop policy if exists "Users can view sets for own workouts" on public.workout_sets;
create policy "Users can view sets for own workouts"
  on public.workout_sets for select
  using (
    workout_id in (
      select id from public.workouts where user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert sets for own workouts" on public.workout_sets;
create policy "Users can insert sets for own workouts"
  on public.workout_sets for insert
  with check (
    workout_id in (
      select id from public.workouts where user_id = auth.uid()
    )
  );

drop policy if exists "Users can update sets for own workouts" on public.workout_sets;
create policy "Users can update sets for own workouts"
  on public.workout_sets for update
  using (
    workout_id in (
      select id from public.workouts where user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete sets for own workouts" on public.workout_sets;
create policy "Users can delete sets for own workouts"
  on public.workout_sets for delete
  using (
    workout_id in (
      select id from public.workouts where user_id = auth.uid()
    )
  );

-- ============================================================
-- progress
-- ============================================================
alter table public.progress enable row level security;

drop policy if exists "Users can view own progress" on public.progress;
create policy "Users can view own progress"
  on public.progress for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own progress" on public.progress;
create policy "Users can insert own progress"
  on public.progress for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own progress" on public.progress;
create policy "Users can update own progress"
  on public.progress for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete own progress" on public.progress;
create policy "Users can delete own progress"
  on public.progress for delete
  using (user_id = auth.uid());

-- ============================================================
-- coach_notes (coach can read/write for their clients)
-- ============================================================
alter table public.coach_notes enable row level security;

drop policy if exists "Coaches can view their client notes" on public.coach_notes;
create policy "Coaches can view their client notes"
  on public.coach_notes for select
  using (coach_id = auth.uid());

drop policy if exists "Clients can view their own coach notes" on public.coach_notes;
create policy "Clients can view their own coach notes"
  on public.coach_notes for select
  using (client_id = auth.uid());

drop policy if exists "Coaches can insert notes for their clients" on public.coach_notes;
create policy "Coaches can insert notes for their clients"
  on public.coach_notes for insert
  with check (coach_id = auth.uid());

drop policy if exists "Coaches can update their own notes" on public.coach_notes;
create policy "Coaches can update their own notes"
  on public.coach_notes for update
  using (coach_id = auth.uid());

drop policy if exists "Coaches can delete their own notes" on public.coach_notes;
create policy "Coaches can delete their own notes"
  on public.coach_notes for delete
  using (coach_id = auth.uid());

-- ============================================================
-- weight_logs (write via auth.uid, public read for link-in-bio
-- is already handled in supabase_public_profile.sql)
-- ============================================================
alter table public.weight_logs enable row level security;

-- Public read policy already exists from supabase_public_profile.sql
-- Write policies already added in supabase_public_profile.sql

-- ============================================================
-- staple_recipes (already has RLS from supabase_staple_recipes.sql)
-- ============================================================
alter table public.staple_recipes enable row level security;

-- Existing policies already use user_id = auth.uid()
-- Re-drop and recreate to ensure correctness

drop policy if exists "Users can view their own staple recipes" on public.staple_recipes;
create policy "Users can view their own staple recipes"
  on public.staple_recipes for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their own staple recipes" on public.staple_recipes;
create policy "Users can insert their own staple recipes"
  on public.staple_recipes for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own staple recipes" on public.staple_recipes;
create policy "Users can update their own staple recipes"
  on public.staple_recipes for update
  using (user_id = auth.uid());

drop policy if exists "Users can delete their own staple recipes" on public.staple_recipes;
create policy "Users can delete their own staple recipes"
  on public.staple_recipes for delete
  using (user_id = auth.uid());

-- ============================================================
-- meal_logs (ensure RLS is enabled and properly scoped)
-- Add this in case table exists from app usage
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'meal_logs'
  ) then
    alter table public.meal_logs enable row level security;

    drop policy if exists "Users can view own meal logs" on public.meal_logs;
    create policy "Users can view own meal logs"
      on public.meal_logs for select
      using (user_id = auth.uid());

    drop policy if exists "Users can insert own meal logs" on public.meal_logs;
    create policy "Users can insert own meal logs"
      on public.meal_logs for insert
      with check (user_id = auth.uid());

    drop policy if exists "Users can update own meal logs" on public.meal_logs;
    create policy "Users can update own meal logs"
      on public.meal_logs for update
      using (user_id = auth.uid());

    drop policy if exists "Users can delete own meal logs" on public.meal_logs;
    create policy "Users can delete own meal logs"
      on public.meal_logs for delete
      using (user_id = auth.uid());
  end if;
end $$;

-- ============================================================
-- user_settings (ensure RLS is enabled)
-- ============================================================
do $$
begin
  if table exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_settings'
  ) then
    alter table public.user_settings enable row level security;
    -- Public select and auth.uid() write policies defined in supabase_public_profile.sql
  end if;
end $$;