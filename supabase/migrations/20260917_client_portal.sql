-- Ryvom client portal / private invite access
create extension if not exists pgcrypto;

create table if not exists public.client_access (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists client_access_client_idx on public.client_access(client_id);
create index if not exists client_access_token_idx on public.client_access(token_hash);

alter table public.client_access enable row level security;

create policy "coach can manage own client access"
  on public.client_access for all
  using (exists (
    select 1 from public.clients c
    where c.id = client_access.client_id and c.coach_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.clients c
    where c.id = client_access.client_id and c.coach_user_id = auth.uid()
  ));

-- The client portal is served through a server route using a service role key.
-- No anonymous browser policy is granted to the client tables.
