-- =============================================================================
-- Security fix: function EXECUTE privileges (privileges only; no data changes).
--
-- Problem found while auditing the live project: PostgreSQL grants EXECUTE on
-- every new function to PUBLIC. The earlier schema-scoped
-- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public REVOKE ... FROM PUBLIC` cannot
-- remove that built-in grant, so `anon` (and `authenticated`) could call every
-- function directly. Most are harmless (they require auth.uid()), but two
-- helpers disclosed other users' relationships when given known UUIDs:
--   collab_role_of(map, user)  -> any user's role in any collaboration map
--   are_friends(a, b)          -> whether any two users are friends
-- and pin_image_object_in_use(path) revealed whether an arbitrary path existed.
--
-- Fix:
--   1. Revoke EXECUTE from PUBLIC/anon on every public function, and make the
--      GLOBAL default for the migration role stop granting it to PUBLIC.
--   2. Keep the explicit `authenticated` grants made by earlier migrations
--      (RPCs and the caller-scoped helpers used inside RLS/Storage policies).
--   3. Remove direct access to the two leaky helpers (they remain usable inside
--      SECURITY DEFINER functions, which run as the owner).
--   4. Make pin_image_object_in_use caller-scoped.
-- =============================================================================
revoke execute on all functions in schema public from public, anon;
alter default privileges revoke execute on functions from public;

revoke execute on function public.collab_role_of(uuid, uuid) from authenticated;
revoke execute on function public.are_friends(uuid, uuid) from authenticated;

-- Used by the Storage delete policy. For paths outside the caller's folder it
-- always answers "in use" (i.e. deny), so it discloses nothing about others.
create or replace function public.pin_image_object_in_use(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(p_name, '/', 1) is distinct from auth.uid()::text
      or exists (select 1 from public.pin_images where storage_path = p_name);
$$;
revoke execute on function public.pin_image_object_in_use(text) from public, anon;
grant execute on function public.pin_image_object_in_use(text) to authenticated;
