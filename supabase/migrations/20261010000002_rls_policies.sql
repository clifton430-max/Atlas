-- =============================================================================
-- Row Level Security, privileges and authorization helpers.
--
-- Principles:
--   * Deny by default: RLS is enabled on EVERY table; anything not explicitly
--     allowed by a policy is invisible / unwritable for anon & authenticated.
--   * Never trust client-provided owner IDs or roles: policies compare against
--     auth.uid() and the stored role in collab_members.
--   * Multi-step state changes (friend requests, invitations, sharing, role
--     changes) have NO direct write policies; they go through SECURITY DEFINER
--     RPCs that validate everything server-side (see rpc migration).
--   * Supabase grants broad table privileges to anon/authenticated by default,
--     so we revoke and re-grant narrowly as a second layer under RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Baseline privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Discover data is the only anonymous-readable data.
grant select on public.events to anon, authenticated;

-- Profiles: column-level grants keep friend_code private even for rows a user
-- is allowed to see. Owners read their own code via get_my_friend_code().
grant select (id, username, display_name, discoverable, map_style, created_at) on public.profiles to authenticated;
grant update (username, display_name, discoverable, map_style) on public.profiles to authenticated;

grant select, insert, update, delete on public.maps to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.pins to authenticated;
grant select, insert, delete on public.pin_groups to authenticated;
grant select, insert, delete on public.pin_images to authenticated;
grant select on public.friendships to authenticated;
grant select, insert, update, delete on public.collab_maps to authenticated;
grant select, delete on public.collab_members to authenticated;
grant select on public.collab_invitations to authenticated;
grant select, delete on public.shared_pins to authenticated;

-- Trigger functions must stay executable by the roles whose statements fire them.
grant execute on function public.touch_updated_at() to anon, authenticated;
grant execute on function public.enforce_pin_group_owner() to authenticated;
grant execute on function public.add_collab_owner_member() to authenticated;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can be used inside policies
-- without recursive RLS evaluation). They only ever answer yes/no or a role
-- for the *calling* user, so they leak nothing.
-- ---------------------------------------------------------------------------
create or replace function public.collab_role_of(p_map_id uuid, p_user_id uuid)
returns public.collab_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.collab_members where map_id = p_map_id and user_id = p_user_id;
$$;

create or replace function public.is_collab_member(p_map_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.collab_members where map_id = p_map_id and user_id = auth.uid()
  );
$$;

create or replace function public.my_collab_role(p_map_id uuid)
returns public.collab_role
language sql
stable
security definer
set search_path = ''
as $$
  select public.collab_role_of(p_map_id, auth.uid());
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(p_a, p_b)
      and greatest(requester_id, addressee_id) = greatest(p_a, p_b)
  );
$$;

-- Profile visibility. A profile is visible to the caller when it is their own,
-- it is discoverable, they have a pending/accepted friendship, or they share a
-- collaboration map. Visibility of a profile reveals only public columns.
create or replace function public.can_view_profile(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    p_target = auth.uid()
    or exists (select 1 from public.profiles p where p.id = p_target and p.discoverable)
    or exists (
      select 1 from public.friendships f
      where f.status in ('pending', 'accepted')
        and ((f.requester_id = auth.uid() and f.addressee_id = p_target)
          or (f.addressee_id = auth.uid() and f.requester_id = p_target))
    )
    or exists (
      select 1 from public.collab_members a
      join public.collab_members b on a.map_id = b.map_id
      where a.user_id = auth.uid() and b.user_id = p_target
    )
  );
$$;

-- Read access to a pin image: its owner, or a member of a collaboration map
-- containing a shared representation that uses it.
create or replace function public.can_read_pin_image(p_image_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.pin_images i
    where i.id = p_image_id
      and (
        i.owner_id = auth.uid()
        or exists (
          select 1 from public.shared_pins sp
          join public.collab_members m on m.map_id = sp.collab_map_id
          where sp.image_id = i.id and m.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.collab_role_of(uuid, uuid) to authenticated;
grant execute on function public.is_collab_member(uuid) to authenticated;
grant execute on function public.my_collab_role(uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.can_read_pin_image(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.maps enable row level security;
alter table public.groups enable row level security;
alter table public.pin_images enable row level security;
alter table public.pins enable row level security;
alter table public.pin_groups enable row level security;
alter table public.friendships enable row level security;
alter table public.collab_maps enable row level security;
alter table public.collab_members enable row level security;
alter table public.collab_invitations enable row level security;
alter table public.shared_pins enable row level security;

-- ---------------------------------------------------------------------------
-- events: public read; writes only by service_role (Edge Function), which
-- bypasses RLS. No insert/update/delete policies exist for clients.
-- ---------------------------------------------------------------------------
create policy events_public_read on public.events
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated using (public.can_view_profile(id));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- maps: strictly owner-only.
-- ---------------------------------------------------------------------------
create policy maps_owner_all on public.maps
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- groups: strictly owner-only.
-- ---------------------------------------------------------------------------
create policy groups_owner_all on public.groups
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- pin_images
-- ---------------------------------------------------------------------------
-- The direct owner check matters for INSERT ... RETURNING: a STABLE helper
-- cannot see a row inserted by the same statement.
create policy pin_images_select on public.pin_images
  for select to authenticated using (owner_id = auth.uid() or public.can_read_pin_image(id));
create policy pin_images_insert_own on public.pin_images
  for insert to authenticated with check (owner_id = auth.uid());
-- Deletion is owner-only; FK references from pins/shared_pins additionally
-- block deleting an image that is still in use.
create policy pin_images_delete_own on public.pin_images
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- pins: owner-only. Writes must also target the caller's own map and image.
-- ---------------------------------------------------------------------------
create policy pins_select_own on public.pins
  for select to authenticated using (owner_id = auth.uid());
create policy pins_insert_own on public.pins
  for insert to authenticated with check (
    owner_id = auth.uid()
    and exists (select 1 from public.maps m where m.id = map_id and m.owner_id = auth.uid())
    and (image_id is null or exists (
      select 1 from public.pin_images i where i.id = image_id and i.owner_id = auth.uid()))
  );
create policy pins_update_own on public.pins
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.maps m where m.id = map_id and m.owner_id = auth.uid())
    and (image_id is null or exists (
      select 1 from public.pin_images i where i.id = image_id and i.owner_id = auth.uid()))
  );
create policy pins_delete_own on public.pins
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- pin_groups: owner-only; both the pin and the group must be the caller's.
-- ---------------------------------------------------------------------------
create policy pin_groups_select_own on public.pin_groups
  for select to authenticated using (owner_id = auth.uid());
create policy pin_groups_insert_own on public.pin_groups
  for insert to authenticated with check (
    owner_id = auth.uid()
    and exists (select 1 from public.pins p where p.id = pin_id and p.owner_id = auth.uid())
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );
create policy pin_groups_delete_own on public.pin_groups
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- friendships: participants may read; all transitions go through RPCs.
-- ---------------------------------------------------------------------------
create policy friendships_participants_read on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- collab_maps
-- ---------------------------------------------------------------------------
-- owner_id check lets INSERT ... RETURNING succeed before the owner-member
-- trigger row is visible.
create policy collab_maps_member_read on public.collab_maps
  for select to authenticated using (owner_id = auth.uid() or public.is_collab_member(id));
create policy collab_maps_insert_owner on public.collab_maps
  for insert to authenticated with check (owner_id = auth.uid());
-- Only the owner (per collab_members, not a client claim) may rename/delete.
create policy collab_maps_owner_update on public.collab_maps
  for update to authenticated
  using (public.my_collab_role(id) = 'owner')
  with check (public.my_collab_role(id) = 'owner' and owner_id = auth.uid());
create policy collab_maps_owner_delete on public.collab_maps
  for delete to authenticated using (public.my_collab_role(id) = 'owner');

-- ---------------------------------------------------------------------------
-- collab_members: members see co-members. Removal: the owner may remove any
-- non-owner; a non-owner may remove themselves (leave). Role changes and
-- additions only happen via RPC.
-- ---------------------------------------------------------------------------
create policy collab_members_member_read on public.collab_members
  for select to authenticated using (public.is_collab_member(map_id));
create policy collab_members_remove on public.collab_members
  for delete to authenticated using (
    role <> 'owner'
    and (user_id = auth.uid() or public.my_collab_role(map_id) = 'owner')
  );

-- ---------------------------------------------------------------------------
-- collab_invitations: visible to the map owner and to the intended recipient.
-- ---------------------------------------------------------------------------
create policy collab_invitations_read on public.collab_invitations
  for select to authenticated using (
    public.my_collab_role(map_id) = 'owner' or recipient_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- shared_pins: readable by members of the collaboration map (and the sharer,
-- so they can still remove their contribution after leaving). Creation goes
-- through share_pin(). The sharer or the owner may remove a representation.
-- ---------------------------------------------------------------------------
create policy shared_pins_read on public.shared_pins
  for select to authenticated using (
    public.is_collab_member(collab_map_id) or shared_by = auth.uid()
  );
create policy shared_pins_remove on public.shared_pins
  for delete to authenticated using (
    shared_by = auth.uid() or public.my_collab_role(collab_map_id) = 'owner'
  );
