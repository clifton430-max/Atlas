-- =============================================================================
-- Orphaned pin-image cleanup support (additive; no existing objects change).
--
-- An "orphan" is a Storage object in pin-images with NO pin_images metadata
-- row (e.g. the metadata insert failed after upload, or a file delete failed
-- after its row was removed). Orphans are never referenced by any pin or
-- shared pin, because references go through pin_images rows.
--
--   my_orphaned_pin_images(min_age)  -> the CALLER's own orphans older than
--       min_age (default 1 hour, so in-flight uploads are never listed).
--       The client then deletes them through the Storage API, where the
--       existing delete policy re-checks: own folder AND no metadata row.
--   orphaned_pin_image_report()      -> service-role-only, counts per owner
--       (no file names), for operators. Nothing is deleted automatically.
-- =============================================================================
create or replace function public.my_orphaned_pin_images(p_min_age interval default interval '1 hour')
returns table (name text, size_bytes bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at
    from storage.objects o
   where o.bucket_id = 'pin-images'
     and split_part(o.name, '/', 1) = public.require_uid()::text
     and o.created_at < now() - greatest(p_min_age, interval '0 seconds')
     and not exists (select 1 from public.pin_images i where i.storage_path = o.name)
   order by o.created_at;
$$;

create or replace function public.orphaned_pin_image_report(p_min_age interval default interval '1 hour')
returns table (owner_folder text, orphan_count bigint, total_bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(o.name, '/', 1), count(*), coalesce(sum((o.metadata ->> 'size')::bigint), 0)
    from storage.objects o
   where o.bucket_id = 'pin-images'
     and o.created_at < now() - p_min_age
     and not exists (select 1 from public.pin_images i where i.storage_path = o.name)
   group by 1
   order by 2 desc;
$$;

revoke all on function public.my_orphaned_pin_images(interval) from public, anon, authenticated;
grant execute on function public.my_orphaned_pin_images(interval) to authenticated;
revoke all on function public.orphaned_pin_image_report(interval) from public, anon, authenticated;
grant execute on function public.orphaned_pin_image_report(interval) to service_role;
