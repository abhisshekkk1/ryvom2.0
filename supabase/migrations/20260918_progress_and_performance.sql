-- Migration: 20260918_progress_and_performance.sql
-- PT client check-in + long-term progress and performance tracking schema

-- 1. Add is_self flag to clients table for Coach's personal profile
alter table public.clients 
add column if not exists is_self boolean not null default false;

-- 2. Performance metrics definition table
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

-- 3. Performance logs table (dated performance entries)
create table if not exists public.performance_logs (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.performance_metrics(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  check_in_id uuid references public.check_ins(id) on delete set null,
  logged_date date not null default current_date,
  value numeric(8,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

-- 4. Private coach notes timeline table (strictly coach-only, never visible to client)
create table if not exists public.client_coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  note_date date not null default current_date,
  note text not null,
  category text default 'general',
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists performance_metrics_client_idx on public.performance_metrics(client_id);
create index if not exists performance_logs_metric_idx on public.performance_logs(metric_id, logged_date desc);
create index if not exists performance_logs_client_idx on public.performance_logs(client_id, logged_date desc);
create index if not exists client_coach_notes_client_idx on public.client_coach_notes(client_id, note_date desc);

-- Enable RLS
alter table public.performance_metrics enable row level security;
alter table public.performance_logs enable row level security;
alter table public.client_coach_notes enable row level security;

-- Policies: Coach can manage their clients' metrics and logs
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
