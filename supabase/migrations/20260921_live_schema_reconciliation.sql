-- ==============================================================================
-- RYVOM: LIVE SUPABASE SCHEMA RECONCILIATION MIGRATION
-- File: 20260921_live_schema_reconciliation.sql
-- 
-- DESCRIPTION:
-- Safe, non-destructive, idempotent migration to reconcile the live Supabase
-- database with the full RYVOM Personal Training platform requirements.
--
-- GUARANTEES:
-- 1. NEVER drops existing tables (preserves users, weight_logs, workout_logs,
--    workouts, workout_sets, meal_logs, meals, meal_items, foods, progress,
--    coach_notes, staple_recipes, user_settings, password_reset_requests, lift_logs).
-- 2. NEVER deletes any existing user data.
-- 3. Eliminates schema collision on coach_notes by introducing public.client_coach_notes
--    specifically for the PT client timeline, keeping legacy public.coach_notes intact.
-- 4. Creates all missing PT tables: clients, check_ins, coach_reviews, client_access,
--    performance_metrics, performance_logs, client_coach_notes.
-- 5. Configures client-photos bucket as PRIVATE (public = false) with client-ownership RLS.
-- 6. Enforces database-level constraints:
--    - exactly ONE is_self profile per coach
--    - performance logs metric_id + client_id composite foreign key
--    - unique client_id + week_ending check-in
--    - unique check_in_id per review
-- ==============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. CLIENTS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  goal text,
  starting_weight numeric(6,2),
  target_weight numeric(6,2),
  target_date date,
  notes text,
  active boolean not null default true,
  is_self boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure columns exist if table was partially created
alter table public.clients add column if not exists is_self boolean not null default false;
alter table public.clients add column if not exists active boolean not null default true;
alter table public.clients add column if not exists updated_at timestamptz not null default now();

-- Index for coach client queries
create index if not exists clients_coach_user_idx on public.clients(coach_user_id, active);

-- Constraint: Exactly ONE self profile per coach
create unique index if not exists unique_coach_self_profile
  on public.clients (coach_user_id)
  where (is_self = true);

-- Enable RLS on clients
alter table public.clients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'coach can manage own clients'
  ) then
    create policy "coach can manage own clients"
      on public.clients for all
      using (coach_user_id = auth.uid())
      with check (coach_user_id = auth.uid());
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 2. CHECK-INS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  week_ending date not null,
  submitted_at timestamptz not null default now(),
  weight numeric(6,2),
  average_weight numeric(6,2),
  waist_cm numeric(6,2),
  diet_adherence numeric(5,2),
  training_adherence numeric(5,2),
  average_steps integer,
  sleep_hours numeric(4,2),
  hunger integer check (hunger between 1 and 10),
  energy integer check (energy between 1 and 10),
  stress integer check (stress between 1 and 10),
  client_notes text,
  photo_front_url text,
  photo_side_url text,
  photo_back_url text,
  status text not null default 'pending' check (status in ('pending','reviewed','follow_up')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure unique constraint on (client_id, week_ending)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'check_ins_client_week_unique'
  ) then
    if not exists (
      select 1 from pg_index i
      join pg_class c on c.oid = i.indrelid
      where c.relname = 'check_ins' and i.indisunique = true and array_length(i.indkey, 1) = 2
    ) then
      alter table public.check_ins
        add constraint check_ins_client_week_unique unique (client_id, week_ending);
    end if;
  end if;
end $$;

create index if not exists check_ins_client_week_idx on public.check_ins(client_id, week_ending desc);
create index if not exists check_ins_status_idx on public.check_ins(status, week_ending desc);

-- Enable RLS on check_ins
alter table public.check_ins enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'check_ins' and policyname = 'coach can manage client checkins'
  ) then
    create policy "coach can manage client checkins"
      on public.check_ins for all
      using (exists (
        select 1 from public.clients c
        where c.id = check_ins.client_id and c.coach_user_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.clients c
        where c.id = check_ins.client_id and c.coach_user_id = auth.uid()
      ));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 3. COACH REVIEWS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null unique references public.check_ins(id) on delete cascade,
  coach_notes text,
  wins text,
  issues text,
  adjustments text,
  next_week_goals text,
  reviewed_at timestamptz not null default now()
);

-- Ensure unique check_in_id constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coach_reviews_check_in_id_key'
  ) then
    if not exists (
      select 1 from pg_index i
      join pg_class c on c.oid = i.indrelid
      where c.relname = 'coach_reviews' and i.indisunique = true
    ) then
      alter table public.coach_reviews
        add constraint coach_reviews_check_in_id_key unique (check_in_id);
    end if;
  end if;
end $$;

-- Enable RLS on coach_reviews
alter table public.coach_reviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coach_reviews' and policyname = 'coach can manage reviews'
  ) then
    create policy "coach can manage reviews"
      on public.coach_reviews for all
      using (exists (
        select 1
        from public.check_ins ci
        join public.clients c on c.id = ci.client_id
        where ci.id = coach_reviews.check_in_id and c.coach_user_id = auth.uid()
      ))
      with check (exists (
        select 1
        from public.check_ins ci
        join public.clients c on c.id = ci.client_id
        where ci.id = coach_reviews.check_in_id and c.coach_user_id = auth.uid()
      ));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 4. CLIENT ACCESS / INVITES TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.client_access (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists client_access_client_idx on public.client_access(client_id);
create index if not exists client_access_token_idx on public.client_access(token_hash);

-- Enable RLS on client_access
alter table public.client_access enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_access' and policyname = 'coach can manage own client access'
  ) then
    create policy "coach can manage own client access"
      on public.client_access for all
      using (exists (
        select 1 from public.clients c
        where c.id = client_access.client_id and c.coach_user_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.clients c
        where c.id = client_access.client_id and c.coach_user_id = auth.uid()
      ));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 5. PERFORMANCE METRICS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  unit text not null default 'kg',
  metric_type text not null default 'weight' check (metric_type in ('number', 'percentage', 'weight', 'distance', 'time', 'reps')),
  target_value numeric(8,2),
  track_on_checkin boolean not null default false,
  show_on_dashboard boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ensure unique (id, client_id) for composite foreign key constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'performance_metrics_id_client_id_uniq'
  ) then
    alter table public.performance_metrics
      add constraint performance_metrics_id_client_id_uniq unique (id, client_id);
  end if;
end $$;

create index if not exists performance_metrics_client_idx on public.performance_metrics(client_id);

-- Enable RLS on performance_metrics
alter table public.performance_metrics enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'performance_metrics' and policyname = 'coach can manage performance metrics'
  ) then
    create policy "coach can manage performance metrics"
      on public.performance_metrics for all
      using (exists (
        select 1 from public.clients c
        where c.id = performance_metrics.client_id and c.coach_user_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.clients c
        where c.id = performance_metrics.client_id and c.coach_user_id = auth.uid()
      ));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 6. PERFORMANCE LOGS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.performance_logs (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  check_in_id uuid references public.check_ins(id) on delete set null,
  logged_date date not null default current_date,
  value numeric(8,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Enforce composite foreign key on (metric_id, client_id) -> performance_metrics(id, client_id)
-- This guarantees at the DB level that a log cannot belong to another client's metric!
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'performance_logs_metric_client_fk'
  ) then
    alter table public.performance_logs
      drop constraint if exists performance_logs_metric_id_fkey;

    alter table public.performance_logs
      add constraint performance_logs_metric_client_fk
      foreign key (metric_id, client_id)
      references public.performance_metrics (id, client_id)
      on delete cascade;
  end if;
end $$;

create index if not exists performance_logs_metric_idx on public.performance_logs(metric_id, logged_date desc);
create index if not exists performance_logs_client_idx on public.performance_logs(client_id, logged_date desc);

-- Enable RLS on performance_logs
alter table public.performance_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'performance_logs' and policyname = 'coach can manage performance logs'
  ) then
    create policy "coach can manage performance logs"
      on public.performance_logs for all
      using (exists (
        select 1 from public.clients c
        where c.id = performance_logs.client_id and c.coach_user_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.clients c
        where c.id = performance_logs.client_id and c.coach_user_id = auth.uid()
      ));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 7. CLIENT COACH NOTES TABLE (DEDICATED PT TABLE, PRESERVES LEGACY coach_notes)
-- ------------------------------------------------------------------------------
-- Note: Live DB already contains legacy public.coach_notes (referencing public.users).
-- We create public.client_coach_notes with a strict foreign key to public.clients(id).
-- This completely avoids collisions and preserves all historical data in public.coach_notes.
create table if not exists public.client_coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  note_date date not null default current_date,
  note text not null check (length(trim(note)) > 0),
  category text default 'general',
  created_at timestamptz not null default now()
);

create index if not exists client_coach_notes_client_idx
  on public.client_coach_notes(client_id, note_date desc);

-- Enable RLS on client_coach_notes
alter table public.client_coach_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_coach_notes' and policyname = 'coach can manage client coach notes'
  ) then
    create policy "coach can manage client coach notes"
      on public.client_coach_notes for all
      using (exists (
        select 1 from public.clients c
        where c.id = client_coach_notes.client_id and c.coach_user_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.clients c
        where c.id = client_coach_notes.client_id and c.coach_user_id = auth.uid()
      ));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 8. UPDATED_AT TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists check_ins_updated_at on public.check_ins;
create trigger check_ins_updated_at before update on public.check_ins
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 9. SUPABASE STORAGE: PRIVATE client-photos BUCKET & RLS
-- ------------------------------------------------------------------------------
-- Create or update bucket: strictly PRIVATE (public = false)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-photos',
  'client-photos',
  false, -- PRIVATE BUCKET: No permanent unauthenticated access
  10485760, -- 10MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'];

-- Remove any legacy public or blanket authenticated policies
drop policy if exists "public can view client photos" on storage.objects;
drop policy if exists "coach can manage client photos" on storage.objects;
drop policy if exists "coach can manage own client photos" on storage.objects;

-- Strict storage policy: Coach can only manage photos under clients/<client_id>/... for clients they own
create policy "coach can manage own client photos"
  on storage.objects for all
  using (
    bucket_id = 'client-photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.clients c
      where c.id::text = split_part(name, '/', 2)
        and c.coach_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'client-photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.clients c
      where c.id::text = split_part(name, '/', 2)
        and c.coach_user_id = auth.uid()
    )
  );

-- ==============================================================================
-- END OF RECONCILIATION MIGRATION
-- ==============================================================================
