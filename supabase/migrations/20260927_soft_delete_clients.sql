-- ==============================================================================
-- RYVOM: SAFE CLIENT DELETION WITH RECOVERABLE SOFT DELETE (PHASE 1)
-- Migration: 20260927_soft_delete_clients.sql
--
-- DESCRIPTION:
-- Replaces destructive CASCADE DELETE with safe, recoverable soft delete.
-- 1. Adds deleted_at timestamptz NULL to public.clients (default NULL means active).
-- 2. Preserves all existing foreign keys, cascading constraints, and RLS policies.
-- 3. Adds compound index on (coach_user_id, deleted_at) for efficient active queries.
-- 4. Updates get_dashboard_checkins() to exclude check-ins of soft-deleted clients.
-- ==============================================================================

-- 1. Add deleted_at column to public.clients
alter table public.clients
  add column if not exists deleted_at timestamptz default null;

-- 2. Index for coach active/deleted client queries
create index if not exists clients_coach_deleted_idx
  on public.clients (coach_user_id, deleted_at);

-- Partial index for active clients only (fastest lookup for normal dashboard views)
create index if not exists clients_active_not_deleted_idx
  on public.clients (coach_user_id, active)
  where (deleted_at is null);

-- 3. Update get_dashboard_checkins() RPC to filter out soft-deleted clients
create or replace function public.get_dashboard_checkins()
returns table (
  id uuid,
  client_id uuid,
  week_ending date,
  weight numeric(6,2),
  waist_cm numeric(6,2),
  diet_adherence numeric(5,2),
  training_adherence numeric(5,2),
  sleep_hours numeric(4,2),
  stress integer,
  status text
)
language sql
security invoker
set search_path = ''
stable
as $$
  with ranked as (
    select
      ci.id,
      ci.client_id,
      ci.week_ending,
      ci.weight,
      ci.waist_cm,
      ci.diet_adherence,
      ci.training_adherence,
      ci.sleep_hours,
      ci.stress,
      ci.status,
      pg_catalog.row_number() over (partition by ci.client_id order by ci.week_ending desc) as rn
    from public.check_ins ci
    join public.clients c on c.id = ci.client_id
    where c.coach_user_id = auth.uid()
      and c.active = true
      and c.is_self = false
      and c.deleted_at is null
  )
  select
    id,
    client_id,
    week_ending,
    weight,
    waist_cm,
    diet_adherence,
    training_adherence,
    sleep_hours,
    stress,
    status
  from ranked
  where rn <= 2
  order by week_ending desc;
$$;

-- Grant execution permissions
revoke execute on function public.get_dashboard_checkins() from public;
revoke execute on function public.get_dashboard_checkins() from anon;
grant execute on function public.get_dashboard_checkins() to authenticated;
grant execute on function public.get_dashboard_checkins() to service_role;
