-- Ryvom coach check-in dashboard schema
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now(),
  unique (client_id, week_ending)
);

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

create index if not exists clients_coach_user_idx on public.clients(coach_user_id, active);
create index if not exists check_ins_client_week_idx on public.check_ins(client_id, week_ending desc);
create index if not exists check_ins_status_idx on public.check_ins(status, week_ending desc);

alter table public.clients enable row level security;
alter table public.check_ins enable row level security;
alter table public.coach_reviews enable row level security;

create policy "coach can manage own clients"
  on public.clients for all
  using (coach_user_id = auth.uid())
  with check (coach_user_id = auth.uid());

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
