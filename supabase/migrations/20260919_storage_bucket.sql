-- Migration: 20260919_storage_bucket.sql
-- Setup Supabase Storage bucket for PRIVATE client progress photos with strict RLS

-- 1. Create client-photos bucket in storage.buckets as PRIVATE (public = false)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-photos',
  'client-photos',
  false, -- PRIVATE: No public access
  10485760, -- 10MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'];

-- 2. Drop any legacy or insecure policies
drop policy if exists "public can view client photos" on storage.objects;
drop policy if exists "coach can manage client photos" on storage.objects;
drop policy if exists "coach can manage own client photos" on storage.objects;

-- 3. Strict storage policy: Coach can only access/manage photos for clients they actually own
-- Photos are organized under paths: clients/<client_id>/<filename>
create policy "coach can manage own client photos"
  on storage.objects for all
  using (
    bucket_id = 'client-photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.clients c
      where c.id::text = split_part(name, '/', 2)
        and c.coach_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'client-photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.clients c
      where c.id::text = split_part(name, '/', 2)
        and c.coach_user_id = auth.uid()
    )
  );
