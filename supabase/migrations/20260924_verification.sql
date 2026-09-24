-- ==============================================================================
-- RYVOM: SUPABASE SECURITY ADVISOR MIGRATION VERIFICATION
-- File: 20260924_verification.sql
-- Run this in Supabase SQL Editor AFTER executing 20260924_fix_rls_security_advisor.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. VERIFY RLS STATUS (Supabase Security Advisor Core Check)
-- Must return ENABLED for both tables.
-- ------------------------------------------------------------------------------
select 
  c.relname as table_name,
  case when c.relrowsecurity then 'PASSED (ENABLED)' else 'FAILED (DISABLED)' end as rls_status,
  case when c.relforcerowsecurity then 'ENFORCED' else 'NOT_ENFORCED' end as rls_enforced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('password_reset_requests', 'workout_logs')
order by c.relname;

-- ------------------------------------------------------------------------------
-- 2. VERIFY SECURITY ADVISOR LINTER QUERY (Must return 0 rows)
-- If this query returns ANY rows, Security Advisor will report rls_disabled_in_public.
-- ------------------------------------------------------------------------------
select 
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('password_reset_requests', 'workout_logs')
  and rowsecurity = false;

-- ------------------------------------------------------------------------------
-- 3. VERIFY TABLE GRANTS
-- - password_reset_requests: anon, authenticated, public MUST HAVE 0 GRANTS.
-- - workout_logs: anon, public MUST HAVE 0 GRANTS. authenticated has SELECT, INSERT, UPDATE, DELETE.
-- ------------------------------------------------------------------------------
select 
  grantee,
  table_schema,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as granted_privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('password_reset_requests', 'workout_logs')
  and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
group by grantee, table_schema, table_name
order by table_name, grantee;

-- ------------------------------------------------------------------------------
-- 4. VERIFY ROW LEVEL SECURITY POLICIES
-- - password_reset_requests: 0 policies (complete lockout from Data API).
-- - workout_logs: exactly 4 policies strictly scoped to user_id = auth.uid().
-- ------------------------------------------------------------------------------
select 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('password_reset_requests', 'workout_logs')
order by tablename, cmd;
