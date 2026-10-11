-- Pin source metadata (additive, backward compatible).
--
-- A small, validated, versioned snapshot of what a reliable source said about
-- a place when it was saved (OSM tags, Commons image credit, provider ids),
-- stored SEPARATELY from user-authored fields (title, note, groups,
-- appearance). Editing a pin never touches it. Mirrors the client-side
-- normalizer src/features/pins/pinSource.ts (sanitizePinSource).

create or replace function public.pin_source_valid(s jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  lim jsonb := '{"providerId":100,"name":200,"category":60,"subcategory":80,"description":1000,"address":300,
                 "openingHours":300,"website":500,"phone":40,"email":120,"capturedAt":40}';
begin
  if s is null then return true; end if;
  if jsonb_typeof(s) <> 'object' or octet_length(s::text) > 4000 then return false; end if;
  if s->'v' is distinct from '1'::jsonb then return false; end if;
  if coalesce(s->>'provider', '') not in ('osm', 'ticketmaster', 'dev-fixture') then return false; end if;
  if coalesce(s->>'providerId', '') = '' then return false; end if;
  for k in select jsonb_object_keys(s) loop
    if k in ('v', 'provider') then continue; end if;
    if k = 'wheelchair' then
      if s->>'wheelchair' not in ('yes', 'limited', 'no', 'designated') then return false; end if;
    elsif k = 'image' then
      if jsonb_typeof(s->'image') <> 'object'
         or coalesce(s->'image'->>'thumbUrl', '') !~ '^https://(upload|thumb|commons)\.wikimedia\.org/'
         or coalesce(s->'image'->>'sourcePage', '') !~ '^https://commons\.wikimedia\.org/'
         or exists (select 1 from jsonb_object_keys(s->'image') ik where ik not in ('thumbUrl', 'sourcePage', 'license', 'artist'))
         or char_length(coalesce(s->'image'->>'license', '')) > 60
         or char_length(coalesce(s->'image'->>'artist', '')) > 200 then
        return false;
      end if;
    elsif lim ? k then
      if jsonb_typeof(s->k) <> 'string' or char_length(s->>k) > (lim->>k)::int then return false; end if;
    else
      return false; -- unknown key
    end if;
  end loop;
  if s ? 'website' and s->>'website' !~ '^https://' then return false; end if;
  return true;
end;
$$;

alter table public.pins add column if not exists source jsonb
  constraint pins_source_valid check (public.pin_source_valid(source));
alter table public.shared_pins add column if not exists source jsonb
  constraint shared_pins_source_valid check (public.pin_source_valid(source));

-- create_custom_pin: optional place reference + source snapshot (search results, map places).
drop function if exists public.create_custom_pin(uuid, text, text, double precision, double precision, text, uuid[]);
create or replace function public.create_custom_pin(
  p_map_id uuid, p_title text, p_note text, p_latitude double precision,
  p_longitude double precision, p_address text, p_group_ids uuid[],
  p_place_ref text default null, p_source jsonb default null)
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
  insert into public.pins (map_id, kind, title, note, latitude, longitude, address, place_ref, source)
  values (p_map_id, 'custom', btrim(p_title), nullif(p_note, ''), p_latitude, p_longitude, nullif(p_address, ''),
          p_place_ref, p_source)
  returning id into v_pin;
  perform public.set_pin_groups(v_pin, p_group_ids);
  return v_pin;
end;
$$;

-- save_place_pin: also stores/refreshes the source snapshot (never clears it).
drop function if exists public.save_place_pin(uuid, text, text, double precision, double precision, text, uuid[]);
create or replace function public.save_place_pin(
  p_map_id uuid, p_place_ref text, p_title text, p_latitude double precision,
  p_longitude double precision, p_address text, p_group_ids uuid[], p_source jsonb default null)
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
    insert into public.pins (map_id, kind, title, latitude, longitude, address, place_ref, source)
    values (p_map_id, 'custom', btrim(p_title), p_latitude, p_longitude, nullif(p_address, ''), p_place_ref, p_source)
    returning id into v_pin;
  elsif p_source is not null then
    update public.pins set source = p_source where id = v_pin;
  end if;
  perform public.set_pin_groups(v_pin, p_group_ids);
  return v_pin;
end;
$$;

-- add_to_collab: optional source snapshot for places.
drop function if exists public.add_to_collab(uuid, uuid, text, text, double precision, double precision, text, text);
create or replace function public.add_to_collab(
  p_collab_map_id uuid,
  p_event_id uuid default null,
  p_place_ref text default null,
  p_title text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_address text default null,
  p_attendance text default null,
  p_source jsonb default null)
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
  if not public.pin_source_valid(p_source) then
    raise exception 'Invalid source metadata' using errcode = '22023';
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
    update public.shared_pins set attendance = p_attendance, source = coalesce(p_source, source) where id = v_id;
    return v_id;
  end if;

  insert into public.shared_pins (collab_map_id, shared_by, event_id, place_ref, title, latitude, longitude, address, attendance, source)
  values (p_collab_map_id, v_me, p_event_id, p_place_ref, v_title, v_lat, v_lng, v_address, p_attendance, p_source)
  returning id into v_id;
  return v_id;
end;
$$;

-- share_pin: the shared copy carries the place reference and source snapshot.
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
    collab_map_id, shared_by, source_pin_id, event_id, place_ref, source, title, note, latitude, longitude, address,
    color, shape, icon, size, border_color, border_width, image_id, image_mask)
  values (
    p_collab_map_id, v_me, v_pin.id, v_pin.event_id, v_pin.place_ref, v_pin.source, v_title,
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
    longitude = excluded.longitude, address = excluded.address, place_ref = excluded.place_ref,
    source = excluded.source, color = excluded.color,
    shape = excluded.shape, icon = excluded.icon, size = excluded.size,
    border_color = excluded.border_color, border_width = excluded.border_width,
    image_id = excluded.image_id, image_mask = excluded.image_mask
  returning sp.id into v_id;
  return v_id;
end;
$$;

revoke all on function public.pin_source_valid(jsonb) from public, anon;
revoke all on function public.create_custom_pin(uuid, text, text, double precision, double precision, text, uuid[], text, jsonb) from public, anon;
revoke all on function public.save_place_pin(uuid, text, text, double precision, double precision, text, uuid[], jsonb) from public, anon;
revoke all on function public.add_to_collab(uuid, uuid, text, text, double precision, double precision, text, text, jsonb) from public, anon;
grant execute on function public.pin_source_valid(jsonb) to authenticated;
grant execute on function public.create_custom_pin(uuid, text, text, double precision, double precision, text, uuid[], text, jsonb) to authenticated;
grant execute on function public.save_place_pin(uuid, text, text, double precision, double precision, text, uuid[], jsonb) to authenticated;
grant execute on function public.add_to_collab(uuid, uuid, text, text, double precision, double precision, text, text, jsonb) to authenticated;
