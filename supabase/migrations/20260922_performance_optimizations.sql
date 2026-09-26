-- ==============================================================================
-- RYVOM PERFORMANCE OPTIMIZATIONS MIGRATION
-- File: 20260922_performance_optimizations.sql
-- ==============================================================================

-- 1. Covering Index: Accelerate coach client dashboard retrieval
create index if not exists clients_coach_dashboard_idx
  on public.clients (coach_user_id, active, is_self, full_name);

-- 2. Composite Index: Accelerate per-client chronological check-in scans
create index if not exists check_ins_client_week_status_idx
  on public.check_ins (client_id, week_ending desc, status);

-- 3. Foreign Key Index: Accelerate coach reviews lookup by check_in_id
create index if not exists coach_reviews_checkin_idx
  on public.coach_reviews (check_in_id);

-- 4. Composite Index: Accelerate performance logs query for client timelines
create index if not exists performance_logs_client_date_idx
  on public.performance_logs (client_id, logged_date desc);

-- 5. Composite Index: Accelerate client coach notes timeline query
create index if not exists client_coach_notes_client_date_idx
  on public.client_coach_notes (client_id, note_date desc);

-- 6. Efficient RPC: Retrieve only the latest 2 check-ins per client in ONE query
-- Hardened according to Supabase SECURITY DEFINER best practices
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
security definer
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
      row_number() over (partition by ci.client_id order by ci.week_ending desc) as rn
    from public.check_ins ci
    join public.clients c on c.id = ci.client_id
    where c.coach_user_id = auth.uid()
      and c.active = true
      and c.is_self = false
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

-- 7. Restrict execution to authenticated users only (Supabase Security Best Practice)
revoke execute on function public.get_dashboard_checkins() from public;
grant execute on function public.get_dashboard_checkins() to authenticated;
