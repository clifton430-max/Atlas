-- =============================================================================
-- Server-side operations (Postgres RPC functions, callable via supabase.rpc()).
--
-- Two flavours:
--   * SECURITY INVOKER: atomic multi-statement writes that still run under the
--     caller's RLS (e.g. save_event_pin). RLS remains the authority.
--   * SECURITY DEFINER: workflows that must touch rows the caller cannot write
--     directly (friendships, invitations, memberships, shared pins). Each one
--     re-derives the caller from auth.uid() and validates every precondition;
--     no client-supplied owner/role/permission value is trusted.
-- All definer functions pin search_path = '' and fully qualify identifiers.
-- =============================================================================

create or replace function public.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pins and groups
-- ---------------------------------------------------------------------------

-- Replace a pin's group memberships with exactly p_group_ids (invoker / RLS).
create or replace function public.set_pin_groups(p_pin_id uuid, p_group_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.require_uid();
  if not exists (select 1 from public.pins where id = p_pin_id) then
    raise exception 'Pin not found' using errcode = 'P0002';
  end if;
  delete from public.pin_groups
   where pin_id = p_pin_id and not (group_id = any (coalesce(p_group_ids, '{}')));
  insert into public.pin_groups (pin_id, group_id)
  select p_pin_id, g from unnest(coalesce(p_group_ids, '{}')) as g
  on conflict do nothing;
end;
$$;

-- Save a public event to a personal map with explicit group assignment.
-- Idempotent: if the event is already on the map, only memberships change.
create or replace function public.save_event_pin(p_map_id uuid, p_event_id uuid, p_group_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_pin uuid;
begin
  perform public.require_uid();
  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    raise exception 'Choose at least one group' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  select id into v_pin from public.pins
   where map_id = p_map_id and event_id = p_event_id and kind = 'event';
  if v_pin is null then
    insert into public.pins (map_id, kind, event_id)
    values (p_map_id, 'event', p_event_id)
    returning id into v_pin;
  end if;

  perform public.set_pin_groups(v_pin, p_group_ids);
  return v_pin;
end;
$$;

-- Create a private custom pin with explicit group assignment (invoker / RLS).
create or replace function public.create_custom_pin(
  p_map_id uuid, p_title text, p_note text, p_latitude double precision,
  p_longitude double precision, p_address text, p_group_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_pin uuid;
begin
  perform public.require_uid();
  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    raise exception 'Choose at least one group' using errcode = '22023';
  end if;
  insert into public.pins (map_id, kind, title, note, latitude, longitude, address)
  values (p_map_id, 'custom', btrim(p_title), nullif(p_note, ''), p_latitude, p_longitude, nullif(p_address, ''))
  returning id into v_pin;
  perform public.set_pin_groups(v_pin, p_group_ids);
  return v_pin;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles / friend codes
-- ---------------------------------------------------------------------------
create or replace function public.get_my_friend_code()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select friend_code from public.profiles where id = public.require_uid();
$$;

-- Regenerating invalidates every previously shared friend link / QR code.
create or replace function public.regenerate_friend_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_code text := replace(gen_random_uuid()::text, '-', '');
begin
  update public.profiles set friend_code = v_code where id = public.require_uid();
  return v_code;
end;
$$;

-- Resolve a friend link. Returns only public profile columns.
create or replace function public.find_profile_by_friend_code(p_code text)
returns table (id uuid, username text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name
    from public.profiles p
   where public.require_uid() is not null and p.friend_code = p_code;
$$;

-- ---------------------------------------------------------------------------
-- Friendships. State machine:
--   (none|declined|revoked) --request--> pending --accept--> accepted
--                                         pending --decline--> declined
--   pending (by requester) / accepted --remove--> revoked
-- A request toward someone who already asked you is accepted immediately.
-- ---------------------------------------------------------------------------
create or replace function public.request_friendship_internal(p_me uuid, p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare r public.friendships;
begin
  if p_target is null or p_target = p_me then
    raise exception 'Invalid friend request target' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  select * into r from public.friendships
   where least(requester_id, addressee_id) = least(p_me, p_target)
     and greatest(requester_id, addressee_id) = greatest(p_me, p_target)
   for update;

  if not found then
    insert into public.friendships (requester_id, addressee_id) values (p_me, p_target)
    returning * into r;
    return r.id;
  end if;

  if r.status = 'accepted' then
    raise exception 'You are already friends' using errcode = '23505';
  elsif r.status = 'pending' and r.requester_id = p_me then
    raise exception 'Friend request already sent' using errcode = '23505';
  elsif r.status = 'pending' and r.addressee_id = p_me then
    update public.friendships set status = 'accepted', responded_at = now() where id = r.id;
  else
    update public.friendships
       set requester_id = p_me, addressee_id = p_target, status = 'pending', responded_at = null
     where id = r.id;
  end if;
  return r.id;
end;
$$;
revoke all on function public.request_friendship_internal(uuid, uuid) from public, anon, authenticated;

-- By user id: only permitted toward discoverable users (prevents contacting
-- private users without their friend link).
create or replace function public.send_friend_request(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := public.require_uid();
begin
  if not exists (select 1 from public.profiles where id = p_target and discoverable) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  return public.request_friendship_internal(v_me, p_target);
end;
$$;

-- By friend code (link / QR): works for non-discoverable users, because the
-- code is a secret they chose to hand out.
create or replace function public.send_friend_request_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_target uuid;
begin
  select id into v_target from public.profiles where friend_code = p_code;
  if v_target is null then
    raise exception 'Friend link is invalid or has been reset' using errcode = 'P0002';
  end if;
  return public.request_friendship_internal(v_me, v_target);
end;
$$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := public.require_uid();
begin
  update public.friendships
     set status = case when p_accept then 'accepted'::public.friendship_status
                       else 'declined'::public.friendship_status end,
         responded_at = now()
   where id = p_friendship_id and addressee_id = v_me and status = 'pending';
  if not found then
    raise exception 'No pending request to respond to' using errcode = 'P0002';
  end if;
end;
$$;

-- Unfriend (either side of an accepted friendship) or cancel your own request.
create or replace function public.remove_friendship(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := public.require_uid();
begin
  update public.friendships
     set status = 'revoked', responded_at = now()
   where id = p_friendship_id
     and ((status = 'accepted' and (requester_id = v_me or addressee_id = v_me))
       or (status = 'pending' and requester_id = v_me));
  if not found then
    raise exception 'Friendship not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Collaboration maps, roles and invitations
-- ---------------------------------------------------------------------------
create or replace function public.create_collab_map(p_name text, p_description text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.collab_maps (owner_id, name, description)
  values (public.require_uid(), btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Owner-only role change. The owner's own role cannot be changed here.
create or replace function public.set_collab_member_role(p_map_id uuid, p_user_id uuid, p_role public.collab_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := public.require_uid();
begin
  if public.collab_role_of(p_map_id, v_me) is distinct from 'owner' then
    raise exception 'Only the owner can change roles' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Ownership transfer is not supported' using errcode = '22023';
  end if;
  update public.collab_members set role = p_role
   where map_id = p_map_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Create an invitation. Returns the RAW token exactly once; only its SHA-256
-- hash is stored. Recipient-restricted invitations may only target friends.
create or replace function public.create_collab_invitation(
  p_map_id uuid,
  p_role public.collab_role,
  p_recipient_id uuid default null,
  p_expires_in_hours integer default 168,
  p_max_uses integer default null)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz;
  v_id uuid;
begin
  if public.collab_role_of(p_map_id, v_me) is distinct from 'owner' then
    raise exception 'Only the owner can invite members' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Invitations may grant editor or viewer only' using errcode = '22023';
  end if;
  if p_expires_in_hours is null or p_expires_in_hours < 1 or p_expires_in_hours > 24 * 30 then
    raise exception 'Expiry must be between 1 hour and 30 days' using errcode = '22023';
  end if;
  if p_recipient_id is not null then
    if not public.are_friends(v_me, p_recipient_id) then
      raise exception 'You can only invite friends directly' using errcode = '42501';
    end if;
    if public.collab_role_of(p_map_id, p_recipient_id) is not null then
      raise exception 'That user is already a member' using errcode = '23505';
    end if;
  end if;

  v_expires := now() + make_interval(hours => p_expires_in_hours);
  insert into public.collab_invitations
    (map_id, created_by, role, recipient_id, token_hash, expires_at, max_uses)
  values
    (p_map_id, v_me, p_role, p_recipient_id,
     encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires,
     case when p_recipient_id is not null then 1 else p_max_uses end)
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function public.revoke_collab_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := public.require_uid();
begin
  update public.collab_invitations i set revoked_at = now()
   where i.id = p_invitation_id and i.revoked_at is null
     and public.collab_role_of(i.map_id, v_me) = 'owner';
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Shared validity check used by preview and accept. Returns a status string.
create or replace function public.invitation_status_internal(i public.collab_invitations, p_me uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if i.revoked_at is not null then return 'revoked'; end if;
  if i.declined_at is not null then return 'declined'; end if;
  if i.expires_at <= now() then return 'expired'; end if;
  if i.max_uses is not null and i.use_count >= i.max_uses then return 'used'; end if;
  if i.recipient_id is not null and i.recipient_id <> p_me then return 'wrong_recipient'; end if;
  if public.collab_role_of(i.map_id, p_me) is not null then return 'already_member'; end if;
  return 'valid';
end;
$$;
revoke all on function public.invitation_status_internal(public.collab_invitations, uuid) from public, anon, authenticated;

-- Preview before explicit acceptance. Map details are only revealed when the
-- token is valid for this user.
create or replace function public.preview_collab_invitation(p_token text)
returns table (status text, map_id uuid, map_name text, role public.collab_role,
               inviter_name text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  i public.collab_invitations;
  v_status text;
begin
  select * into i from public.collab_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::public.collab_role, null::text, null::timestamptz;
    return;
  end if;
  v_status := public.invitation_status_internal(i, v_me);
  if v_status in ('valid', 'already_member') then
    return query
      select v_status, m.id, m.name, i.role,
             coalesce(nullif(p.display_name, ''), p.username), i.expires_at
        from public.collab_maps m
        join public.profiles p on p.id = i.created_by
       where m.id = i.map_id;
  else
    return query select v_status, null::uuid, null::text, null::public.collab_role, null::text, null::timestamptz;
  end if;
end;
$$;

create or replace function public.accept_invitation_internal(i public.collab_invitations, p_me uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text := public.invitation_status_internal(i, p_me);
begin
  if v_status <> 'valid' then
    raise exception 'Invitation cannot be accepted (%)', v_status using errcode = '42501';
  end if;
  insert into public.collab_members (map_id, user_id, role, added_by)
  values (i.map_id, p_me, i.role, i.created_by);
  update public.collab_invitations set use_count = use_count + 1 where id = i.id;
  return i.map_id;
end;
$$;
revoke all on function public.accept_invitation_internal(public.collab_invitations, uuid) from public, anon, authenticated;

-- Accept via link / QR token.
create or replace function public.accept_collab_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  i public.collab_invitations;
begin
  select * into i from public.collab_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  return public.accept_invitation_internal(i, v_me);
end;
$$;

-- Accept / decline a recipient-restricted invitation from the in-app inbox.
create or replace function public.respond_collab_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  i public.collab_invitations;
begin
  select * into i from public.collab_invitations
   where id = p_invitation_id and recipient_id = v_me
   for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if p_accept then
    return public.accept_invitation_internal(i, v_me);
  end if;
  update public.collab_invitations set declined_at = now() where id = i.id;
  return null;
end;
$$;

-- The caller's pending, still-valid, recipient-restricted invitations.
create or replace function public.my_pending_invitations()
returns table (invitation_id uuid, map_id uuid, map_name text, role public.collab_role,
               inviter_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, m.id, m.name, i.role, coalesce(nullif(p.display_name, ''), p.username), i.expires_at
    from public.collab_invitations i
    join public.collab_maps m on m.id = i.map_id
    join public.profiles p on p.id = i.created_by
   where i.recipient_id = public.require_uid()
     and public.invitation_status_internal(i, i.recipient_id) = 'valid'
   order by i.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Sharing a private pin into a collaboration map.
-- Creates (or refreshes) an independent snapshot. Requirements, all checked
-- here rather than trusted from the client:
--   * caller owns the source pin;
--   * caller is owner or editor of the destination collaboration map;
--   * the pin has verified coordinates (event pins use the event's).
-- The private note is copied only when p_include_note is true; the custom
-- appearance/image only when p_include_appearance is true.
-- ---------------------------------------------------------------------------
create or replace function public.share_pin(
  p_pin_id uuid, p_collab_map_id uuid,
  p_include_note boolean default false,
  p_include_appearance boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_pin public.pins;
  v_event public.events;
  v_role public.collab_role;
  v_lat double precision;
  v_lng double precision;
  v_title text;
  v_address text;
  v_id uuid;
begin
  select * into v_pin from public.pins where id = p_pin_id and owner_id = v_me;
  if not found then
    raise exception 'Pin not found' using errcode = 'P0002';
  end if;
  v_role := public.collab_role_of(p_collab_map_id, v_me);
  if v_role is null or v_role = 'viewer' then
    raise exception 'You need editor access to share into this map' using errcode = '42501';
  end if;

  if v_pin.kind = 'event' then
    select * into v_event from public.events where id = v_pin.event_id;
    v_lat := v_event.latitude;
    v_lng := v_event.longitude;
    v_title := coalesce(v_pin.title, v_event.name);
    v_address := concat_ws(', ', v_event.venue_name, v_event.address, v_event.city);
  else
    v_lat := v_pin.latitude;
    v_lng := v_pin.longitude;
    v_title := v_pin.title;
    v_address := v_pin.address;
  end if;
  if v_lat is null or v_lng is null then
    raise exception 'This pin has no verified location to share' using errcode = '22023';
  end if;

  insert into public.shared_pins as sp (
    collab_map_id, shared_by, source_pin_id, event_id, title, note, latitude, longitude, address,
    color, shape, icon, size, border_color, border_width, image_id, image_mask)
  values (
    p_collab_map_id, v_me, v_pin.id, v_pin.event_id, v_title,
    case when p_include_note then v_pin.note end,
    v_lat, v_lng, nullif(v_address, ''),
    case when p_include_appearance then v_pin.color end,
    case when p_include_appearance then v_pin.shape else 'circle' end,
    case when p_include_appearance then v_pin.icon end,
    case when p_include_appearance then v_pin.size else 32 end,
    case when p_include_appearance then v_pin.border_color end,
    case when p_include_appearance then v_pin.border_width else 2 end,
    case when p_include_appearance then v_pin.image_id end,
    case when p_include_appearance then v_pin.image_mask else 'circle' end)
  on conflict (collab_map_id, source_pin_id) where source_pin_id is not null
  do update set
    title = excluded.title, note = excluded.note, latitude = excluded.latitude,
    longitude = excluded.longitude, address = excluded.address, color = excluded.color,
    shape = excluded.shape, icon = excluded.icon, size = excluded.size,
    border_color = excluded.border_color, border_width = excluded.border_width,
    image_id = excluded.image_id, image_mask = excluded.image_mask
  returning sp.id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants: authenticated only (anon gets nothing).
-- ---------------------------------------------------------------------------
grant execute on function public.require_uid() to authenticated;
grant execute on function public.set_pin_groups(uuid, uuid[]) to authenticated;
grant execute on function public.save_event_pin(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.create_custom_pin(uuid, text, text, double precision, double precision, text, uuid[]) to authenticated;
grant execute on function public.get_my_friend_code() to authenticated;
grant execute on function public.regenerate_friend_code() to authenticated;
grant execute on function public.find_profile_by_friend_code(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.send_friend_request_by_code(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friendship(uuid) to authenticated;
grant execute on function public.create_collab_map(text, text) to authenticated;
grant execute on function public.set_collab_member_role(uuid, uuid, public.collab_role) to authenticated;
grant execute on function public.create_collab_invitation(uuid, public.collab_role, uuid, integer, integer) to authenticated;
grant execute on function public.revoke_collab_invitation(uuid) to authenticated;
grant execute on function public.preview_collab_invitation(text) to authenticated;
grant execute on function public.accept_collab_invitation(text) to authenticated;
grant execute on function public.respond_collab_invitation(uuid, boolean) to authenticated;
grant execute on function public.my_pending_invitations() to authenticated;
grant execute on function public.share_pin(uuid, uuid, boolean, boolean) to authenticated;
