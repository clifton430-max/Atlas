-- Meetups on collaboration-map pins, attendance, notifications, realtime.
-- Additive only. All writes go through SECURITY DEFINER RPCs that re-check
-- membership and roles; tables are read through RLS.
--
-- Meetups are USER-CREATED plans at a shared pin. They are distinct from
-- official event schedules (public.events) and are always labelled as such.

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  collab_map_id uuid not null references public.collab_maps (id) on delete cascade,
  shared_pin_id uuid not null references public.shared_pins (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- IANA zone the organiser chose, for display ("7:30 PM EDT"); instants are UTC.
  timezone text not null check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' and char_length(timezone) <= 60),
  description text check (description is null or char_length(description) <= 1000),
  capacity integer check (capacity is null or capacity between 1 and 500),
  -- 'members': every map member sees who's going. 'private_attendees': members
  -- see the count; names only to the organiser, the map owner and each attendee.
  visibility text not null default 'members' check (visibility in ('members', 'private_attendees')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
);
create index meetups_map_idx on public.meetups (collab_map_id, starts_at);
create index meetups_pin_idx on public.meetups (shared_pin_id);
create trigger meetups_touch before update on public.meetups for each row execute function public.touch_updated_at();

create table public.meetup_attendees (
  meetup_id uuid not null references public.meetups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Denormalized so realtime subscriptions can filter by map.
  collab_map_id uuid not null references public.collab_maps (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);
create index meetup_attendees_map_idx on public.meetup_attendees (collab_map_id);
create index meetup_attendees_user_idx on public.meetup_attendees (user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('shared_pin_added', 'meetup_created', 'meetup_rescheduled', 'meetup_cancelled', 'meetup_joined')),
  actor_id uuid references public.profiles (id) on delete set null,
  collab_map_id uuid references public.collab_maps (id) on delete cascade,
  shared_pin_id uuid references public.shared_pins (id) on delete cascade,
  meetup_id uuid references public.meetups (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  -- Same logical notification is stored once per recipient.
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.meetups enable row level security;
alter table public.meetup_attendees enable row level security;
alter table public.notifications enable row level security;

-- Reads ------------------------------------------------------------------------
create policy meetups_select_members on public.meetups for select to authenticated
  using (public.is_collab_member(collab_map_id));

create policy meetup_attendees_select on public.meetup_attendees for select to authenticated
  using (
    public.is_collab_member(collab_map_id) and (
      user_id = (select auth.uid())
      or exists (select 1 from public.meetups m where m.id = meetup_id and (
        m.visibility = 'members' or m.created_by = (select auth.uid())
        or public.my_collab_role(m.collab_map_id) = 'owner'))
    )
  );

-- Only your own notifications, and only while you can still see that map.
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (collab_map_id is null or public.is_collab_member(collab_map_id)));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.meetups, public.meetup_attendees, public.notifications from anon;
revoke insert, update, delete on public.meetups, public.meetup_attendees from authenticated;
grant select on public.meetups, public.meetup_attendees to authenticated;
revoke insert, update on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Notification fan-out (definer; never callable directly) ----------------------
create or replace function public.notify_map_members(
  p_map uuid, p_actor uuid, p_kind text, p_title text, p_pin uuid, p_meetup uuid, p_key text, p_only uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, actor_id, collab_map_id, shared_pin_id, meetup_id, title, dedupe_key)
  select m.user_id, p_kind, p_actor, p_map, p_pin, p_meetup, left(p_title, 300), p_key
    from public.collab_members m
   where m.map_id = p_map and m.user_id is distinct from p_actor
     and (p_only is null or m.user_id = p_only)
  on conflict (user_id, dedupe_key) do nothing;
$$;
revoke all on function public.notify_map_members(uuid, uuid, text, text, uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.trg_shared_pin_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_map_members(new.collab_map_id, new.shared_by, 'shared_pin_added',
    new.title, new.id, null, 'pin:' || new.id::text);
  return new;
end; $$;
create trigger shared_pins_notify after insert on public.shared_pins
  for each row execute function public.trg_shared_pin_notify();

-- RPCs --------------------------------------------------------------------------
create or replace function public.meetup_validate(p_starts timestamptz, p_ends timestamptz, p_tz text, p_capacity integer, p_visibility text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception 'The meetup must end after it starts' using errcode = '22023';
  end if;
  if p_ends > p_starts + interval '7 days' then
    raise exception 'Meetups can last at most 7 days' using errcode = '22023';
  end if;
  if p_tz is null or p_tz !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' then
    raise exception 'Invalid time zone' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity not between 1 and 500 then
    raise exception 'Capacity must be between 1 and 500' using errcode = '22023';
  end if;
  if p_visibility not in ('members', 'private_attendees') then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;
end; $$;

create or replace function public.create_meetup(
  p_shared_pin_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text,
  p_description text default null, p_capacity integer default null, p_visibility text default 'members',
  p_join boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_pin public.shared_pins;
  v_role public.collab_role;
  v_id uuid;
begin
  select * into v_pin from public.shared_pins where id = p_shared_pin_id;
  if not found then raise exception 'Pin not found' using errcode = 'P0002'; end if;
  v_role := public.collab_role_of(v_pin.collab_map_id, v_me);
  if v_role is null or v_role = 'viewer' then
    raise exception 'You need editor access to plan meetups on this map' using errcode = '42501';
  end if;
  perform public.meetup_validate(p_starts_at, p_ends_at, p_timezone, p_capacity, p_visibility);
  if p_ends_at < now() then raise exception 'This meetup would already be over' using errcode = '22023'; end if;
  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Descriptions are limited to 1000 characters' using errcode = '22023';
  end if;
  insert into public.meetups (collab_map_id, shared_pin_id, created_by, starts_at, ends_at, timezone, description, capacity, visibility)
  values (v_pin.collab_map_id, v_pin.id, v_me, p_starts_at, p_ends_at, p_timezone, nullif(btrim(p_description), ''), p_capacity, p_visibility)
  returning id into v_id;
  if p_join then
    insert into public.meetup_attendees (meetup_id, user_id, collab_map_id) values (v_id, v_me, v_pin.collab_map_id);
  end if;
  perform public.notify_map_members(v_pin.collab_map_id, v_me, 'meetup_created', 'Meetup at ' || v_pin.title, v_pin.id, v_id, 'meetup:' || v_id::text);
  return v_id;
end;
$$;

-- Organiser or map owner may edit / reschedule.
create or replace function public.update_meetup(
  p_meetup_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text,
  p_description text, p_capacity integer, p_visibility text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_m public.meetups;
  v_count integer;
  v_title text;
begin
  select * into v_m from public.meetups where id = p_meetup_id for update;
  if not found or not exists (select 1 from public.collab_members where map_id = v_m.collab_map_id and user_id = v_me) then
    raise exception 'Meetup not found' using errcode = 'P0002';
  end if;
  if v_m.created_by <> v_me and public.collab_role_of(v_m.collab_map_id, v_me) <> 'owner' then
    raise exception 'Only the organiser or the map owner can change this meetup' using errcode = '42501';
  end if;
  if v_m.cancelled_at is not null then raise exception 'This meetup was cancelled' using errcode = '22023'; end if;
  perform public.meetup_validate(p_starts_at, p_ends_at, p_timezone, p_capacity, p_visibility);
  select count(*) into v_count from public.meetup_attendees where meetup_id = p_meetup_id;
  if p_capacity is not null and p_capacity < v_count then
    raise exception 'Capacity can''t be lower than the % people already going', v_count using errcode = '22023';
  end if;
  update public.meetups set starts_at = p_starts_at, ends_at = p_ends_at, timezone = p_timezone,
    description = nullif(btrim(coalesce(p_description, '')), ''), capacity = p_capacity, visibility = p_visibility
   where id = p_meetup_id;
  if p_starts_at is distinct from v_m.starts_at or p_ends_at is distinct from v_m.ends_at then
    select title into v_title from public.shared_pins where id = v_m.shared_pin_id;
    perform public.notify_map_members(v_m.collab_map_id, v_me, 'meetup_rescheduled', 'Meetup at ' || v_title || ' was rescheduled',
      v_m.shared_pin_id, v_m.id, 'meetup-time:' || v_m.id::text || ':' || extract(epoch from p_starts_at)::bigint || ':' || extract(epoch from p_ends_at)::bigint);
  end if;
end;
$$;

create or replace function public.cancel_meetup(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_m public.meetups;
  v_title text;
begin
  select * into v_m from public.meetups where id = p_meetup_id for update;
  if not found or not exists (select 1 from public.collab_members where map_id = v_m.collab_map_id and user_id = v_me) then
    raise exception 'Meetup not found' using errcode = 'P0002';
  end if;
  if v_m.created_by <> v_me and public.collab_role_of(v_m.collab_map_id, v_me) <> 'owner' then
    raise exception 'Only the organiser or the map owner can cancel this meetup' using errcode = '42501';
  end if;
  if v_m.cancelled_at is not null then return; end if;
  update public.meetups set cancelled_at = now() where id = p_meetup_id;
  select title into v_title from public.shared_pins where id = v_m.shared_pin_id;
  perform public.notify_map_members(v_m.collab_map_id, v_me, 'meetup_cancelled', 'Meetup at ' || v_title || ' was cancelled',
    v_m.shared_pin_id, v_m.id, 'meetup-cancel:' || v_m.id::text);
end;
$$;

-- Any member (viewers included) may attend. Capacity is enforced under a row lock.
create or replace function public.join_meetup(p_meetup_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_m public.meetups;
  v_count integer;
  v_title text;
begin
  select * into v_m from public.meetups where id = p_meetup_id for update;
  if not found or not exists (select 1 from public.collab_members where map_id = v_m.collab_map_id and user_id = v_me) then
    raise exception 'Meetup not found' using errcode = 'P0002';
  end if;
  if v_m.cancelled_at is not null then raise exception 'This meetup was cancelled' using errcode = '22023'; end if;
  if v_m.ends_at < now() then raise exception 'This meetup has finished' using errcode = '22023'; end if;
  if exists (select 1 from public.meetup_attendees where meetup_id = p_meetup_id and user_id = v_me) then
    select count(*) into v_count from public.meetup_attendees where meetup_id = p_meetup_id;
    return v_count; -- idempotent
  end if;
  select count(*) into v_count from public.meetup_attendees where meetup_id = p_meetup_id;
  if v_m.capacity is not null and v_count >= v_m.capacity then
    raise exception 'This meetup is full' using errcode = '22023';
  end if;
  insert into public.meetup_attendees (meetup_id, user_id, collab_map_id) values (p_meetup_id, v_me, v_m.collab_map_id);
  select title into v_title from public.shared_pins where id = v_m.shared_pin_id;
  perform public.notify_map_members(v_m.collab_map_id, v_me, 'meetup_joined', 'Someone joined your meetup at ' || v_title,
    v_m.shared_pin_id, v_m.id, 'meetup-join:' || v_m.id::text || ':' || v_me::text, v_m.created_by);
  return v_count + 1;
end;
$$;

create or replace function public.leave_meetup(p_meetup_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_uid();
  v_count integer;
begin
  delete from public.meetup_attendees where meetup_id = p_meetup_id and user_id = v_me;
  select count(*) into v_count from public.meetup_attendees where meetup_id = p_meetup_id;
  return v_count;
end;
$$;

-- Attendance counts for every meetup a member can see (counts are visible
-- even when names are private).
create or replace function public.meetup_counts(p_collab_map_id uuid)
returns table (meetup_id uuid, attendees integer, me_going boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, (select count(*)::int from public.meetup_attendees a where a.meetup_id = m.id),
         exists (select 1 from public.meetup_attendees a where a.meetup_id = m.id and a.user_id = auth.uid())
    from public.meetups m
   where m.collab_map_id = p_collab_map_id and public.is_collab_member(p_collab_map_id);
$$;

revoke all on function public.meetup_validate(timestamptz, timestamptz, text, integer, text) from public, anon;
revoke all on function public.create_meetup(uuid, timestamptz, timestamptz, text, text, integer, text, boolean) from public, anon;
revoke all on function public.update_meetup(uuid, timestamptz, timestamptz, text, text, integer, text) from public, anon;
revoke all on function public.cancel_meetup(uuid) from public, anon;
revoke all on function public.join_meetup(uuid) from public, anon;
revoke all on function public.leave_meetup(uuid) from public, anon;
revoke all on function public.meetup_counts(uuid) from public, anon;
revoke all on function public.trg_shared_pin_notify() from public, anon, authenticated;
grant execute on function public.create_meetup(uuid, timestamptz, timestamptz, text, text, integer, text, boolean) to authenticated;
grant execute on function public.update_meetup(uuid, timestamptz, timestamptz, text, text, integer, text) to authenticated;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.join_meetup(uuid) to authenticated;
grant execute on function public.leave_meetup(uuid) to authenticated;
grant execute on function public.meetup_counts(uuid) to authenticated;

-- Realtime: changes are delivered through RLS (clients refetch on each signal).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shared_pins, public.meetups, public.meetup_attendees, public.notifications;
  end if;
end $$;
