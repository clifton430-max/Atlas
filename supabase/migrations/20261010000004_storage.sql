-- =============================================================================
-- Storage: private bucket for pin marker images.
--
-- Object layout:  pin-images/<owner uuid>/<random uuid>.<ext>
--
--   * Bucket is PRIVATE (public = false): files are only served via signed URLs
--     or authenticated downloads, both of which pass through these policies.
--   * Upload: only into your own folder; size and MIME limits enforced by the
--     bucket configuration (2 MB; png/jpeg/webp).
--   * Read: your own folder, or an image referenced by a shared pin in a
--     collaboration map you are a member of (can_read_pin_image_object).
--   * Update/overwrite: not allowed — replacement uploads a new object, so an
--     image still referenced elsewhere is never mutated underneath it.
--   * Delete: own folder only, and only after the pin_images metadata row is
--     gone. That row cannot be deleted while any pin or shared pin references it
--     (FK), so a file still in use can never be removed.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pin-images', 'pin-images', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_read_pin_image_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    split_part(p_name, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.pin_images i
      where i.storage_path = p_name and public.can_read_pin_image(i.id)
    )
  );
$$;

create or replace function public.pin_image_object_in_use(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pin_images where storage_path = p_name);
$$;

grant execute on function public.can_read_pin_image_object(text) to authenticated;
grant execute on function public.pin_image_object_in_use(text) to authenticated;

create policy "pin images: read authorized"
  on storage.objects for select to authenticated
  using (bucket_id = 'pin-images' and public.can_read_pin_image_object(name));

create policy "pin images: upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pin-images'
    and split_part(name, '/', 1) = auth.uid()::text
    and array_length(string_to_array(name, '/'), 1) = 2
  );

create policy "pin images: delete unreferenced own files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pin-images'
    and split_part(name, '/', 1) = auth.uid()::text
    and not public.pin_image_object_in_use(name)
  );
