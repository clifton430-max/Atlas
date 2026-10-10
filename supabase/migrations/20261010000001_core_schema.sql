-- =============================================================================
-- Atlas core schema
--
-- Entity overview (see README "Data model" for a diagram):
--
--   auth.users 1─1 profiles
--   profiles   1─* maps            (private personal maps)
--   maps       1─* pins            (saved-event pins and custom pins)
--   events     1─* pins            (a saved event REFERENCES the public event; never cloned)
--   profiles   1─* groups          (account-level, color-coded collections)
--   pins       *─* groups          via pin_groups (one pin, many groups, no duplicates)
--   profiles   1─* pin_images      (metadata only; bytes live in Storage bucket `pin-images`)
--   profiles   *─* profiles        via friendships (request state machine; grants NO map access)
--   collab_maps 1─* collab_members (owner/editor/viewer roles)
--   collab_maps 1─* collab_invitations (hashed, revocable, expiring tokens)
--   collab_maps 1─* shared_pins    (independent snapshot representations of private pins)
--
-- Privacy invariants enforced here and in the RLS migration:
--   * events are the ONLY table readable by anonymous users (Discover).
--   * pins / notes / maps / groups / memberships are owner-only.
--   * shared_pins are a separate table: sharing never changes the original pin's visibility,
--     and deleting a shared representation never touches the original pin or image.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.pin_kind as enum ('event', 'custom');
create type public.pin_shape as enum ('circle', 'square', 'rounded', 'diamond', 'star');
create type public.image_mask as enum ('circle', 'rounded', 'square');
create type public.friendship_status as enum ('pending', 'accepted', 'declined', 'revoked');
create type public.collab_role as enum ('owner', 'editor', 'viewer');

-- ---------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created by trigger on signup.
-- friend_code is a private, regenerable secret used for friend links / QR codes;
-- column privileges (RLS migration) prevent other users from reading it.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null default '' check (char_length(display_name) <= 80),
  -- When false, the profile is hidden from user search; only friends,
  -- pending-request counterparts and collaboration co-members can see it.
  discoverable boolean not null default true,
  friend_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  map_style text not null default 'positron' check (map_style in ('positron', 'bright', 'liberty')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Public events (Discover). Normalized from providers such as Ticketmaster.
-- (provider, external_id) is unique so the same provider event is never duplicated,
-- and many users saving it all reference this single row.
--
-- Time fields are deliberately distinct and never inferred from each other:
--   starts_at / ends_at              -> event start / end instants (UTC)
--   start_local_date/start_local_time -> provider-supplied local wall-clock start
--   venue_open_time / venue_close_time -> venue hours (local wall-clock); unknown = NULL
--   timezone                          -> IANA zone of the event / venue
-- Unknown prices stay NULL (never 0). Unknown coordinates stay NULL (never mapped).
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 1 and 40),
  external_id text not null check (char_length(external_id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 300),
  description text,
  image_url text,
  category text,
  genre text,
  venue_name text,
  address text,
  city text,
  region text,
  country text,
  postal_code text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  starts_at timestamptz,
  ends_at timestamptz,
  start_local_date date,
  start_local_time time,
  timezone text,
  venue_open_time time,
  venue_close_time time,
  price_min numeric(12, 2) check (price_min is null or price_min >= 0),
  price_max numeric(12, 2) check (price_max is null or price_max >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  ticket_url text check (ticket_url is null or ticket_url ~* '^https://'),
  source_url text check (source_url is null or source_url ~* '^https://'),
  source_name text,
  status text,
  -- Development fixtures are clearly flagged so the UI can label them.
  is_dev_fixture boolean not null default false,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id),
  check ((latitude is null) = (longitude is null)),
  check (price_min is null or price_max is null or price_max >= price_min),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

-- Bounding-box queries (Discover viewport) filter on latitude/longitude ranges.
-- PostGIS is intentionally not required; a composite btree serves bbox scans well
-- at Atlas's scale. Swap for a GiST index on a geography column if volume grows.
create index events_lat_lng_idx on public.events (latitude, longitude);
create index events_starts_at_idx on public.events (starts_at);
create index events_category_idx on public.events (category);

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Personal maps (private by default; there is no public flag at all).
-- ---------------------------------------------------------------------------
create table public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maps_owner_idx on public.maps (owner_id);
create trigger maps_touch before update on public.maps
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Groups: account-level, color-coded collections that pins join via pin_groups.
-- They are account-level (not per-map) so a user can reuse "Concerts" across
-- maps; the group filter only ever shows pins of the *current* map.
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#525252' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (icon is null or char_length(icon) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index groups_owner_name_uniq on public.groups (owner_id, lower(btrim(name)));
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pin images: metadata/reference only. The file lives in Storage at
-- `pin-images/<owner_id>/<uuid>.<ext>`. Pins and shared pins reference these rows
-- with ON DELETE NO ACTION, so a row (and therefore its file) can never be
-- removed while anything still uses it.
-- ---------------------------------------------------------------------------
create table public.pin_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 2097152),
  width integer check (width is null or width between 1 and 4096),
  height integer check (height is null or height between 1 and 4096),
  created_at timestamptz not null default now(),
  -- The path must live in the owner's folder, mirroring the Storage policy.
  check (storage_path like owner_id::text || '/%')
);
create index pin_images_owner_idx on public.pin_images (owner_id);

-- ---------------------------------------------------------------------------
-- Pins: a user-owned point on one personal map.
--   kind = 'event'  -> references a public event; location comes from the event.
--   kind = 'custom' -> a private custom location with its own coordinates.
-- `note` is private and never leaves this table except through an explicit,
-- opt-in share (see share_pin()).
-- Appearance columns are NULL/default when the pin uses the default look.
-- ---------------------------------------------------------------------------
create table public.pins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete cascade,
  kind public.pin_kind not null,
  event_id uuid references public.events (id),
  title text check (title is null or char_length(btrim(title)) between 1 and 120),
  note text check (note is null or char_length(note) <= 5000),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  address text check (address is null or char_length(address) <= 300),
  -- Appearance
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  shape public.pin_shape not null default 'circle',
  icon text check (icon is null or char_length(icon) <= 40),
  size smallint not null default 32 check (size between 20 and 72),
  border_color text check (border_color is null or border_color ~ '^#[0-9a-fA-F]{6}$'),
  border_width smallint not null default 2 check (border_width between 0 and 6),
  image_id uuid references public.pin_images (id),
  image_mask public.image_mask not null default 'circle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'event' and event_id is not null and latitude is null and longitude is null)
    or
    (kind = 'custom' and event_id is null and title is not null and latitude is not null and longitude is not null)
  )
);
-- One saved-event pin per (map, event): saving again updates memberships instead.
create unique index pins_map_event_uniq on public.pins (map_id, event_id) where kind = 'event';
create index pins_owner_idx on public.pins (owner_id);
create index pins_map_idx on public.pins (map_id);
create index pins_image_idx on public.pins (image_id) where image_id is not null;
create trigger pins_touch before update on public.pins
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pin <-> group membership join. Composite PK prevents duplicate memberships;
-- a pin may belong to many groups without being duplicated.
-- ---------------------------------------------------------------------------
create table public.pin_groups (
  pin_id uuid not null references public.pins (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pin_id, group_id)
);
create index pin_groups_group_idx on public.pin_groups (group_id);

-- Defense in depth (applies even to privileged roles): the pin, the group and
-- the membership row must all belong to the same user. This blocks adding
-- another user's private pin to your group, or your pin to their group.
create or replace function public.enforce_pin_group_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin_owner uuid;
  v_group_owner uuid;
begin
  select owner_id into v_pin_owner from public.pins where id = new.pin_id;
  select owner_id into v_group_owner from public.groups where id = new.group_id;
  if v_pin_owner is null or v_group_owner is null
     or v_pin_owner <> new.owner_id or v_group_owner <> new.owner_id then
    raise exception 'Pin and group must belong to the same owner' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger pin_groups_owner_check before insert or update on public.pin_groups
  for each row execute function public.enforce_pin_group_owner();

-- ---------------------------------------------------------------------------
-- Friendships: one row per unordered pair. State transitions happen only via
-- RPCs (see rpc migration). Friendship never grants map or pin access.
-- ---------------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_uniq on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);
create trigger friendships_touch before update on public.friendships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Collaboration maps, members and roles.
-- ---------------------------------------------------------------------------
create table public.collab_maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger collab_maps_touch before update on public.collab_maps
  for each row execute function public.touch_updated_at();

create table public.collab_members (
  map_id uuid not null references public.collab_maps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.collab_role not null,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (map_id, user_id)
);
create unique index collab_members_one_owner on public.collab_members (map_id) where role = 'owner';
create index collab_members_user_idx on public.collab_members (user_id);

-- The creator of a collaboration map automatically becomes its owner member.
create or replace function public.add_collab_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.collab_members (map_id, user_id, role, added_by)
  values (new.id, new.owner_id, 'owner', new.owner_id);
  return new;
end;
$$;
create trigger collab_maps_owner_member after insert on public.collab_maps
  for each row execute function public.add_collab_owner_member();

-- Invitations store only a SHA-256 hash of the token. The raw token is returned
-- once to the creator and embedded in the invite URL / QR code.
create table public.collab_invitations (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.collab_maps (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  role public.collab_role not null check (role in ('editor', 'viewer')),
  -- Optional intended recipient. When set, only that user may accept.
  recipient_id uuid references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses between 1 and 1000),
  use_count integer not null default 0,
  revoked_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now()
);
create index collab_invitations_map_idx on public.collab_invitations (map_id);
create index collab_invitations_recipient_idx on public.collab_invitations (recipient_id);

-- ---------------------------------------------------------------------------
-- Shared pins: an independent, authorized REPRESENTATION of a private pin inside
-- a collaboration map. Fields are snapshotted at share time; the note is copied
-- only when the sharer explicitly opts in. source_pin_id is informational (lets
-- the sharer see where a pin is shared) and grants no access to the original.
-- ---------------------------------------------------------------------------
create table public.shared_pins (
  id uuid primary key default gen_random_uuid(),
  collab_map_id uuid not null references public.collab_maps (id) on delete cascade,
  shared_by uuid not null references public.profiles (id) on delete cascade,
  source_pin_id uuid references public.pins (id) on delete set null,
  event_id uuid references public.events (id),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  note text check (note is null or char_length(note) <= 5000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  shape public.pin_shape not null default 'circle',
  icon text,
  size smallint not null default 32 check (size between 20 and 72),
  border_color text check (border_color is null or border_color ~ '^#[0-9a-fA-F]{6}$'),
  border_width smallint not null default 2 check (border_width between 0 and 6),
  image_id uuid references public.pin_images (id),
  image_mask public.image_mask not null default 'circle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shared_pins_source_uniq on public.shared_pins (collab_map_id, source_pin_id)
  where source_pin_id is not null;
create index shared_pins_map_idx on public.shared_pins (collab_map_id);
create index shared_pins_image_idx on public.shared_pins (image_id) where image_id is not null;
create trigger shared_pins_touch before update on public.shared_pins
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New-user bootstrap: create the profile and a first private map.
-- Username comes from signup metadata when valid and free, else is generated.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_display text := left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80);
begin
  if v_username !~ '^[a-z0-9_]{3,30}$'
     or exists (select 1 from public.profiles where username = v_username) then
    v_username := 'user_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_display);

  insert into public.maps (owner_id, name) values (new.id, 'My Map');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
