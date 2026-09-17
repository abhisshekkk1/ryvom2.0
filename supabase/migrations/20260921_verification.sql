-- ==============================================================================
-- RYVOM: LIVE SCHEMA VERIFICATION QUERY
-- File: 20260921_verification.sql
-- Run this in Supabase SQL Editor AFTER executing 20260921_live_schema_reconciliation.sql
-- ==============================================================================

-- 1. Verify Required Tables Exist and RLS is Active
select 
  t.table_name,
  case when c.relrowsecurity then 'ENABLED' else 'DISABLED' end as rls_status,
  case 
    when t.table_name in ('clients', 'check_ins', 'coach_reviews', 'client_access', 'performance_metrics', 'performance_logs', 'client_coach_notes') then 'NEW_PT_TABLE'
    else 'PRESERVED_LEGACY_TABLE'
  end as table_category
from information_schema.tables t
join pg_class c on c.relname = t.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where t.table_schema = 'public'
  and t.table_name in (
    -- New PT Tables
    'clients', 'check_ins', 'coach_reviews', 'client_access', 
    'performance_metrics', 'performance_logs', 'client_coach_notes',
    -- Legacy Tables (verify they are preserved)
    'users', 'weight_logs', 'workout_logs', 'workouts', 'workout_sets', 
    'meal_logs', 'meals', 'meal_items', 'foods', 'progress', 
    'coach_notes', 'staple_recipes', 'user_settings', 'password_reset_requests', 'lift_logs'
  )
order by table_category desc, t.table_name;

-- 2. Verify Key Database Constraints & Composite Foreign Keys
select 
  conrelid::regclass as table_name,
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'performance_metrics_id_client_id_uniq',
  'performance_logs_metric_client_fk',
  'check_ins_client_week_unique',
  'coach_reviews_check_in_id_key'
)
order by table_name, constraint_name;

-- 3. Verify Unique Index on Coach Self Profile
select 
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where indexname = 'unique_coach_self_profile';

-- 4. Verify Supabase Storage Bucket Privacy
select 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'client-photos';

-- 5. Verify Storage Policies (Ensure NO public read policy exists)
select 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 6. Verify Table RLS Policies on PT Tables
select 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'check_ins', 'coach_reviews', 'client_access', 'performance_metrics', 'performance_logs', 'client_coach_notes')
order by tablename, policyname;
