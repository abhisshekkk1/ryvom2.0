-- ==============================================================================
-- RYVOM: SUPABASE SECURITY ADVISOR FUNCTION & RPC HARDENING
-- File: 20260924_harden_security_definer_and_advisor.sql
--
-- DESCRIPTION:
-- Resolves Supabase Security Advisor production findings:
-- 1. function_search_path_mutable: public.set_updated_at()
-- 2. anon_security_definer_function_executable: public.get_dashboard_checkins()
-- 3. authenticated_security_definer_function_executable: public.get_dashboard_checkins()
--
-- SECURITY ARCHITECTURE & GUARANTEES:
-- - Hardens public.set_updated_at() by fixing search_path to empty string ('')
--   and schema-qualifying pg_catalog.now(). Preserves trigger semantics 100%.
-- - Hardens public.get_dashboard_checkins() by converting it from SECURITY DEFINER
--   to SECURITY INVOKER. The authenticated coach already possesses full SELECT
--   privileges on their own clients and check-ins via RLS policies; elevated
--   privileges are completely unnecessary and introduce privilege escalation risks.
-- - Enforces SET search_path = '' on get_dashboard_checkins() and schema-qualifies
--   all table and function references.
-- - Revokes EXECUTE on get_dashboard_checkins() from PUBLIC and anon.
-- - Grants EXECUTE on get_dashboard_checkins() strictly to authenticated and service_role.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDEN public.set_updated_at() TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- Ensure triggers on public.clients and public.check_ins remain active and intact
drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists check_ins_updated_at on public.check_ins;
create trigger check_ins_updated_at
  before update on public.check_ins
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------------------------
-- 2. HARDEN public.get_dashboard_checkins() RPC FUNCTION
-- ------------------------------------------------------------------------------
-- Drops previous function signature if required to cleanly change security mode
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

-- Revoke execute from public and untrusted roles (anon)
revoke execute on function public.get_dashboard_checkins() from public;
revoke execute on function public.get_dashboard_checkins() from anon;

-- Grant execute exclusively to authenticated coach sessions and backend service_role
grant execute on function public.get_dashboard_checkins() to authenticated;
grant execute on function public.get_dashboard_checkins() to service_role;

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================
