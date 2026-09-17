-- Migration: 20260920_integrity_and_constraints.sql
-- Database constraints for cross-client relationship integrity and self profile uniqueness

-- 1. Ensure Coach cannot have multiple self profiles (exactly ONE is_self = true per coach)
create unique index if not exists unique_coach_self_profile
  on public.clients (coach_user_id)
  where (is_self = true);

-- 2. Performance Tracking Integrity:
-- Ensure performance_metrics has a unique constraint on (id, client_id)
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

-- Ensure performance_logs references (metric_id, client_id) on performance_metrics
-- This guarantees at the database level that performance_logs.client_id MUST match performance_metrics.client_id!
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'performance_logs_metric_client_fk'
  ) then
    -- Drop single column foreign key if present
    alter table public.performance_logs
      drop constraint if exists performance_logs_metric_id_fkey;

    alter table public.performance_logs
      add constraint performance_logs_metric_client_fk
      foreign key (metric_id, client_id)
      references public.performance_metrics (id, client_id)
      on delete cascade;
  end if;
end $$;

-- 3. Check-ins uniqueness: ensure unique (client_id, week_ending)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'check_ins_client_week_unique'
  ) then
    -- Check if table already has unnamed unique constraint or add one
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

-- 4. Reviews uniqueness: ensure exactly one review per check-in
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
