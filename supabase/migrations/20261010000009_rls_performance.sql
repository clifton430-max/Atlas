-- =============================================================================
-- Performance + hardening from the Supabase advisors (no data changes, no
-- change to who can access what):
--
--  1. auth_rls_initplan: policies called auth.uid() once PER ROW. Wrapping it
--     as (select auth.uid()) lets Postgres evaluate it once per statement.
--     ALTER POLICY keeps each policy's name, command and roles; only the
--     expression text changes, with identical semantics.
--  2. unindexed_foreign_keys: covering indexes for FK columns used by
--     cascades and by app lookups (e.g. shared_pins.source_pin_id,
--     friendships.requester_id).
--  3. Trigger functions are not meant to be called directly; trigger firing
--     does not check EXECUTE, so direct grants are removed.
-- =============================================================================

-- ---- 1. RLS initplan --------------------------------------------------------
alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy maps_owner_all on public.maps
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter policy groups_owner_all on public.groups
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter policy pin_images_select on public.pin_images
  using (owner_id = (select auth.uid()) or public.can_read_pin_image(id));
alter policy pin_images_insert_own on public.pin_images
  with check (owner_id = (select auth.uid()));
alter policy pin_images_delete_own on public.pin_images
  using (owner_id = (select auth.uid()));

alter policy pins_select_own on public.pins
  using (owner_id = (select auth.uid()));
alter policy pins_insert_own on public.pins
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.maps m where m.id = map_id and m.owner_id = (select auth.uid()))
    and (image_id is null or exists (
      select 1 from public.pin_images i where i.id = image_id and i.owner_id = (select auth.uid())))
  );
alter policy pins_update_own on public.pins
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.maps m where m.id = map_id and m.owner_id = (select auth.uid()))
    and (image_id is null or exists (
      select 1 from public.pin_images i where i.id = image_id and i.owner_id = (select auth.uid())))
  );
alter policy pins_delete_own on public.pins
  using (owner_id = (select auth.uid()));

alter policy pin_groups_select_own on public.pin_groups
  using (owner_id = (select auth.uid()));
alter policy pin_groups_insert_own on public.pin_groups
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.pins p where p.id = pin_id and p.owner_id = (select auth.uid()))
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))
  );
alter policy pin_groups_delete_own on public.pin_groups
  using (owner_id = (select auth.uid()));

alter policy friendships_participants_read on public.friendships
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

alter policy collab_maps_member_read on public.collab_maps
  using (owner_id = (select auth.uid()) or public.is_collab_member(id));
alter policy collab_maps_insert_owner on public.collab_maps
  with check (owner_id = (select auth.uid()));
alter policy collab_maps_owner_update on public.collab_maps
  using (public.my_collab_role(id) = 'owner')
  with check (public.my_collab_role(id) = 'owner' and owner_id = (select auth.uid()));

alter policy collab_members_remove on public.collab_members
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or public.my_collab_role(map_id) = 'owner')
  );

alter policy collab_invitations_read on public.collab_invitations
  using (public.my_collab_role(map_id) = 'owner' or recipient_id = (select auth.uid()));

alter policy shared_pins_read on public.shared_pins
  using (public.is_collab_member(collab_map_id) or shared_by = (select auth.uid()));
alter policy shared_pins_remove on public.shared_pins
  using (shared_by = (select auth.uid()) or public.my_collab_role(collab_map_id) = 'owner');

alter policy "pin images: upload to own folder" on storage.objects
  with check (
    bucket_id = 'pin-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and array_length(string_to_array(name, '/'), 1) = 2
  );
alter policy "pin images: delete unreferenced own files" on storage.objects
  using (
    bucket_id = 'pin-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and not public.pin_image_object_in_use(name)
  );

-- ---- 2. Covering indexes for foreign keys ------------------------------------
create index if not exists collab_invitations_created_by_idx on public.collab_invitations (created_by);
create index if not exists collab_maps_owner_idx on public.collab_maps (owner_id);
create index if not exists collab_members_added_by_idx on public.collab_members (added_by);
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists pin_groups_owner_idx on public.pin_groups (owner_id);
create index if not exists pins_event_idx on public.pins (event_id) where event_id is not null;
create index if not exists shared_pins_event_idx on public.shared_pins (event_id) where event_id is not null;
create index if not exists shared_pins_shared_by_idx on public.shared_pins (shared_by);
create index if not exists shared_pins_source_pin_idx on public.shared_pins (source_pin_id) where source_pin_id is not null;

-- ---- 3. Trigger functions are not callable directly ---------------------------
revoke execute on function public.add_collab_owner_member() from authenticated;
revoke execute on function public.enforce_pin_group_owner() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated;
