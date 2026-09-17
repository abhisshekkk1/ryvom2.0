-- Migration: 20260919_storage_bucket.sql
-- Setup Supabase Storage bucket for private client progress photos

-- 1. Create client-photos bucket in storage.buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-photos',
  'client-photos',
  true,
  10485760, -- 10MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'];

-- 2. Storage policies for authenticated coach
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'coach can manage client photos'
  ) then
    create policy "coach can manage client photos"
      on storage.objects for all
      using (bucket_id = 'client-photos' and auth.role() = 'authenticated')
      with check (bucket_id = 'client-photos' and auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'public can view client photos'
  ) then
    create policy "public can view client photos"
      on storage.objects for select
      using (bucket_id = 'client-photos');
  end if;
end $$;
