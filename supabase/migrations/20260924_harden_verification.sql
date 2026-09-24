-- ==============================================================================
-- RYVOM: FUNCTION & RPC HARDENING VERIFICATION QUERY
-- File: 20260924_harden_verification.sql
-- Run this in Supabase SQL Editor AFTER executing 20260924_harden_security_definer_and_advisor.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. VERIFY FUNCTION SECURITY PROPERTIES & SEARCH PATH
-- Both functions must show:
-- - security_mode: INVOKER (prosecdef = false)
-- - search_path_enforced: ENFORCED (proconfig contains search_path=)
-- ------------------------------------------------------------------------------
select 
  p.proname as function_name,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security_mode,
  case 
    when p.proconfig is not null and array_to_string(p.proconfig, ', ') like '%search_path=%' 
    then 'ENFORCED (search_path='''')' 
    else 'MUTABLE (FAILED)' 
  end as search_path_status,
  array_to_string(p.proconfig, ', ') as configuration_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_updated_at', 'get_dashboard_checkins')
order by p.proname;

-- ------------------------------------------------------------------------------
-- 2. VERIFY SECURITY ADVISOR LINTER CHECKS (ALL 3 MUST RETURN 0 ROWS)
-- ------------------------------------------------------------------------------

-- 2A. function_search_path_mutable check (Must return 0 rows)
select 
  p.proname as mutable_search_path_finding
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_updated_at', 'get_dashboard_checkins')
  and (p.proconfig is null or not (array_to_string(p.proconfig, '') like '%search_path=%'));

-- 2B. anon_security_definer_function_executable check (Must return 0 rows)
select 
  p.proname as anon_sec_definer_finding
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_updated_at', 'get_dashboard_checkins')
  and p.prosecdef = true
  and (
    has_function_privilege('anon', p.oid, 'execute') 
    or has_function_privilege('public', p.oid, 'execute')
  );

-- 2C. authenticated_security_definer_function_executable check (Must return 0 rows)
select 
  p.proname as auth_sec_definer_finding
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_updated_at', 'get_dashboard_checkins')
  and p.prosecdef = true
  and has_function_privilege('authenticated', p.oid, 'execute');

-- ------------------------------------------------------------------------------
-- 3. VERIFY EXECUTE PRIVILEGES MATRIX ON get_dashboard_checkins()
-- - anon: false
-- - public: false
-- - authenticated: true
-- - service_role: true
-- ------------------------------------------------------------------------------
select 
  p.proname,
  has_function_privilege('anon', p.oid, 'execute') as anon_executable,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_executable,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_executable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_dashboard_checkins';
