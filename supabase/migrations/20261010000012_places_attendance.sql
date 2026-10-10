-- =============================================================================
-- Living-map addendum: save places, attendance, and direct collaboration adds.
-- Additive columns/indexes/functions; save_event_pin is re-created with an
-- extra optional argument (no data is changed).
--
--  * attendance ('going' | 'interested' | NULL) on pins and shared_pins —
--    only meaningful for events; set explicitly by the user.
--  * place_ref ('osm:<type>/<id>') records which OpenStreetMap place a pin or
--    shared pin was saved from. Place pins are user-owned custom pins at the
--    place's location; one per (map, place), like saved events.
--  * add_to_collab(): editors/owners pin an event or place straight into a
--    collaboration map. Roles are checked server-side from collab_members;
--    event coordinates come from public.events, never from the client.
-- =============================================================================

alter table public.pins add column if not exists attendance text
  check (attendance is null or attendance in ('going', 'interested'));
alter table public.pins add column if not exists place_ref text
  check (place_ref is null or place_ref ~ '^osm:(node|way|relation)/[0-9]{1,15}$');
-- Attendance is only meaningful for saved events.
alter table public.pins add constraint pins_attendance_events_only
  check (attendance is null or kind = 'event');
create unique index if not exists pins_map_place_uniq on public.pins (map_id, place_ref) where place_ref is not null;

alter table public.shared_pins add column if not exists attendance text
  check (attendance is null or attendance in ('going', 'interested'));
alter table public.shared_pins add column if not exists place_ref text
  check (place_ref is null or place_ref ~ '^osm:(node|way|relation)/[0-9]{1,15}$');
create index if not exists shared_pins_direct_event_idx on public.shared_pins (collab_map_id, shared_by, event_id)
  where source_pin_id is null and event_id is not null;

-- ---------------------------------------------------------------------------
-- save_event_pin(map, event, groups, attendance?)  (invoker / RLS)
-- ---------------------------------------------------------------------------
drop function if exists public.save_event_pin(uuid, uuid, uuid[]);
create or replace function public.save_event_pin(
  p_map_id uuid, p_event_id uuid, p_group_ids uuid[], p_attendance text default null)
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
  if p_attendance is not null and p_attendance not in ('going', 'interested') then
    raise exception 'Invalid attendance' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  select id into v_pin from public.pins
   where map_id = p_map_id and event_id = p_event_id and kind = 'event';
  if v_pin is null then
    insert into public.pins (map_id, kind, event_id, attendance)
    values (p_map_id, 'event', p_event_id, p_attendance)
    returning id into v_pin;
  else
    update public.pins set attendance = p_attendance where id = v_pin;
  end if;
  perform public.set_pin_groups(v_pin, p_group_ids);
  return v_pin;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_place_pin: an OSM place saved to a personal map (invoker / RLS).
-- Idempotent per (map, place): saving again updates groups only.
-- ---------------------------------------------------------------------------
create or replace function public.save_place_pin(
  p_map_id uuid, p_place_ref text, p_title text, p_latitude double precision,
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
  select id into v_pin from public.pins where map_id = p_map_id and place_ref = p_place_ref;
  if v_pin is null then
    insert into public.pins (map_id, kind, title, latitude, longitude, address, place_ref)
    values (p_map_id, 'custom', btrim(p_title), p_latitude, p_longitude, nullif(p_address, ''), p_place_ref)
    returning id into v_pin;
  end if;
  perform public.set_pin_groups(v_pin, p_group_ids);
  return v_pin;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_to_collab: pin a public event or a place directly into a collaboration
-- map. Owner/editor only. Re-adding the same item updates attendance.
-- ---------------------------------------------------------------------------
create or replace function public.add_to_collab(
  p_collab_map_id uuid,
  p_event_id uuid default null,
  p_place_ref text default null,
  p_title text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_address text default null,
  p_attendance text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_role public.collab_role := public.collab_role_of(p_collab_map_id, v_me);
  v_event public.events;
  v_id uuid;
  v_title text;
  v_lat double precision;
  v_lng double precision;
  v_address text;
begin
  if v_role is null or v_role = 'viewer' then
    raise exception 'You need editor access to add to this map' using errcode = '42501';
  end if;
  if (p_event_id is null) = (p_place_ref is null) then
    raise exception 'Provide exactly one event or place' using errcode = '22023';
  end if;
  if p_attendance is not null and (p_attendance not in ('going', 'interested') or p_event_id is null) then
    raise exception 'Attendance applies to events only' using errcode = '22023';
  end if;

  if p_event_id is not null then
    select * into v_event from public.events where id = p_event_id;
    if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
    if v_event.latitude is null then
      raise exception 'This event has no verified location' using errcode = '22023';
    end if;
    v_title := v_event.name;
    v_lat := v_event.latitude;
    v_lng := v_event.longitude;
    v_address := nullif(concat_ws(', ', v_event.venue_name, v_event.address, v_event.city), '');
  else
    if p_place_ref !~ '^osm:(node|way|relation)/[0-9]{1,15}$' then
      raise exception 'Invalid place reference' using errcode = '22023';
    end if;
    if p_title is null or char_length(btrim(p_title)) not between 1 and 300
       or p_latitude is null or p_longitude is null
       or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception 'Invalid place details' using errcode = '22023';
    end if;
    v_title := btrim(p_title);
    v_lat := p_latitude;
    v_lng := p_longitude;
    v_address := nullif(left(coalesce(p_address, ''), 300), '');
  end if;

  select id into v_id from public.shared_pins
   where collab_map_id = p_collab_map_id and shared_by = v_me and source_pin_id is null
     and (event_id = p_event_id or place_ref = p_place_ref);
  if v_id is not null then
    update public.shared_pins set attendance = p_attendance where id = v_id;
    return v_id;
  end if;

  insert into public.shared_pins (collab_map_id, shared_by, event_id, place_ref, title, latitude, longitude, address, attendance)
  values (p_collab_map_id, v_me, p_event_id, p_place_ref, v_title, v_lat, v_lng, v_address, p_attendance)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.save_event_pin(uuid, uuid, uuid[], text) from public, anon;
revoke all on function public.save_place_pin(uuid, text, text, double precision, double precision, text, uuid[]) from public, anon;
revoke all on function public.add_to_collab(uuid, uuid, text, text, double precision, double precision, text, text) from public, anon;
grant execute on function public.save_event_pin(uuid, uuid, uuid[], text) to authenticated;
grant execute on function public.save_place_pin(uuid, text, text, double precision, double precision, text, uuid[]) to authenticated;
grant execute on function public.add_to_collab(uuid, uuid, text, text, double precision, double precision, text, text) to authenticated;
