-- Custom pins and meetups at ANY point on a collaboration map.
--
-- Additive only: two new RPCs plus an edit RPC. No table, column, policy or
-- existing function changes; existing maps, pins and meetups are untouched.
--
--   create_shared_custom_pin  editors/owners drop a pin at arbitrary coordinates
--                             (title, optional note/address). A repeat of the
--                             same request within 60 s returns the first pin
--                             (double clicks / network retries never duplicate).
--   update_shared_pin_details the pin's author or the map owner edits title,
--                             note, address or position (partial update: NULL
--                             keeps the current value).
--   create_meetup_at          one transaction: the meeting-point pin + the
--                             meetup (all of create_meetup's checks apply).

create or replace function public.create_shared_custom_pin(
  p_collab_map_id uuid,
  p_title text,
  p_latitude double precision,
  p_longitude double precision,
  p_note text default null,
  p_address text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_role public.collab_role := public.collab_role_of(p_collab_map_id, v_me);
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
begin
  if v_role is null or v_role = 'viewer' then
    raise exception 'You need editor access to add pins to this map' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 300 then
    raise exception 'Give the pin a title (up to 300 characters)' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception 'Descriptions are limited to 2000 characters' using errcode = '22023';
  end if;
  if p_address is not null and char_length(p_address) > 300 then
    raise exception 'Addresses are limited to 300 characters' using errcode = '22023';
  end if;

  -- Idempotent retry: same author, map, title and spot within a minute.
  select id into v_id from public.shared_pins
   where collab_map_id = p_collab_map_id and shared_by = v_me and source_pin_id is null and event_id is null
     and title = v_title and abs(latitude - p_latitude) < 1e-6 and abs(longitude - p_longitude) < 1e-6
     and created_at > now() - interval '60 seconds'
   order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.shared_pins (collab_map_id, shared_by, title, note, latitude, longitude, address)
  values (p_collab_map_id, v_me, v_title, nullif(btrim(coalesce(p_note, '')), ''), p_latitude, p_longitude, nullif(btrim(coalesce(p_address, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_shared_pin_details(
  p_shared_pin_id uuid,
  p_title text default null,
  p_note text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_address text default null,
  p_clear_note boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_pin public.shared_pins;
begin
  select * into v_pin from public.shared_pins where id = p_shared_pin_id for update;
  if not found or public.collab_role_of(v_pin.collab_map_id, v_me) is null then
    raise exception 'Pin not found' using errcode = 'P0002';
  end if;
  if v_pin.shared_by <> v_me and public.collab_role_of(v_pin.collab_map_id, v_me) <> 'owner' then
    raise exception 'Only the person who added this pin or the map owner can edit it' using errcode = '42501';
  end if;
  if p_title is not null and char_length(btrim(p_title)) not between 1 and 300 then
    raise exception 'Give the pin a title (up to 300 characters)' using errcode = '22023';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180)) then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception 'Descriptions are limited to 2000 characters' using errcode = '22023';
  end if;
  -- Event pins keep the event's verified location.
  if p_latitude is not null and v_pin.event_id is not null then
    raise exception 'Event pins stay at the event''s venue' using errcode = '22023';
  end if;
  update public.shared_pins set
    title = coalesce(btrim(p_title), title),
    note = case when p_clear_note then null else coalesce(nullif(btrim(p_note), ''), note) end,
    latitude = coalesce(p_latitude, latitude),
    longitude = coalesce(p_longitude, longitude),
    address = coalesce(nullif(btrim(left(p_address, 300)), ''), address)
  where id = p_shared_pin_id;
end;
$$;

create or replace function public.create_meetup_at(
  p_collab_map_id uuid,
  p_title text,
  p_latitude double precision,
  p_longitude double precision,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_description text default null,
  p_capacity integer default null,
  p_visibility text default 'members')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin uuid;
  v_meetup uuid;
begin
  v_pin := public.create_shared_custom_pin(p_collab_map_id, p_title, p_latitude, p_longitude, null, null);
  -- A retried request finds the meetup it already created.
  select id into v_meetup from public.meetups
   where shared_pin_id = v_pin and created_by = auth.uid() and starts_at = p_starts_at and ends_at = p_ends_at and cancelled_at is null
   limit 1;
  if v_meetup is null then
    v_meetup := public.create_meetup(v_pin, p_starts_at, p_ends_at, p_timezone, p_description, p_capacity, p_visibility, true);
  end if;
  return jsonb_build_object('shared_pin_id', v_pin, 'meetup_id', v_meetup);
end;
$$;

revoke all on function public.create_shared_custom_pin(uuid, text, double precision, double precision, text, text) from public, anon;
revoke all on function public.update_shared_pin_details(uuid, text, text, double precision, double precision, text, boolean) from public, anon;
revoke all on function public.create_meetup_at(uuid, text, double precision, double precision, timestamptz, timestamptz, text, text, integer, text) from public, anon;
grant execute on function public.create_shared_custom_pin(uuid, text, double precision, double precision, text, text) to authenticated;
grant execute on function public.update_shared_pin_details(uuid, text, text, double precision, double precision, text, boolean) to authenticated;
grant execute on function public.create_meetup_at(uuid, text, double precision, double precision, timestamptz, timestamptz, text, text, integer, text) to authenticated;
