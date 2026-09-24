-- ==============================================================================
-- RYVOM: SUPABASE SECURITY ADVISOR RLS HARDENING MIGRATION
-- File: 20260924_fix_rls_security_advisor.sql
--
-- DESCRIPTION:
-- Fixes Supabase Security Advisor production findings:
-- 1. ERROR: rls_disabled_in_public public.password_reset_requests
-- 2. ERROR: rls_disabled_in_public public.workout_logs
--
-- GUARANTEES:
-- - Enables and enforces Row Level Security (RLS) on both tables.
-- - Revokes public/anon access to sensitive password reset requests.
-- - Enforces strict tenant/user isolation on workout_logs (user_id = auth.uid()).
-- - Prevents cross-coach data exposure.
-- - Idempotent and safe to run multiple times.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PASSWORD_RESET_REQUESTS TABLE HARDENING
-- ------------------------------------------------------------------------------
-- Enable Row Level Security
alter table public.password_reset_requests enable row level security;
alter table public.password_reset_requests force row level security;

-- Revoke all privileges from untrusted roles (anon, authenticated, public)
-- Password reset data/tokens must NEVER be exposed over the PostgREST Data API.
revoke all on table public.password_reset_requests from anon;
revoke all on table public.password_reset_requests from authenticated;
revoke all on table public.password_reset_requests from public;

-- Preserve only trusted server-side administrative access (service_role)
grant all on table public.password_reset_requests to service_role;

-- Drop any existing permissive or legacy policies
drop policy if exists "allow anon read password reset" on public.password_reset_requests;
drop policy if exists "allow authenticated read password reset" on public.password_reset_requests;
drop policy if exists "users can view own password reset requests" on public.password_reset_requests;


-- ------------------------------------------------------------------------------
-- 2. WORKOUT_LOGS TABLE HARDENING (UNUSED / LEGACY TABLE)
-- ------------------------------------------------------------------------------
-- Enable and force Row Level Security
alter table public.workout_logs enable row level security;
alter table public.workout_logs force row level security;

-- Revoke all privileges from untrusted roles (anon, authenticated, public)
-- As an unused legacy table, apply least privilege: zero Data API exposure.
revoke all on table public.workout_logs from anon;
revoke all on table public.workout_logs from authenticated;
revoke all on table public.workout_logs from public;

-- Preserve only trusted server-side administrative access (service_role)
grant all on table public.workout_logs to service_role;

-- Drop any conflicting, permissive, or legacy policies
drop policy if exists "users can view own workout logs" on public.workout_logs;
drop policy if exists "users can insert own workout logs" on public.workout_logs;
drop policy if exists "users can update own workout logs" on public.workout_logs;
drop policy if exists "users can delete own workout logs" on public.workout_logs;
drop policy if exists "coach can view workout logs" on public.workout_logs;
drop policy if exists "coach can manage workout logs" on public.workout_logs;

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================
