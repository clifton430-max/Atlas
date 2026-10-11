-- Collectibles: Monument Crates and Map Skin Crates (additive, non-monetized).
--
-- SERVER-AUTHORITATIVE: open_crate() decides every reward. It
--   1. authenticates and serializes the user's rolls (advisory lock),
--   2. honours an idempotency key (retries/double-clicks return the same roll),
--   3. consumes one of today's free rolls (no paid currency exists),
--   4. draws a uniform number 0..9999 from the CSPRNG (gen_random_uuid ->
--      pg_strong_random, rejection-sampled: no modulo bias),
--   5. maps it to a rarity with the ACTIVE versioned weights (basis points,
--      validated to total exactly 10000), THEN picks a reward uniformly from
--      that rarity's pool (an empty pool BLOCKS the roll; nothing rerolls),
--   6. records the roll and increments the inventory (duplicates counted).
-- Clients cannot write inventory, rolls or configuration.

create table public.collectible_defs (
  id text primary key check (id ~ '^(monument|skin):[a-z0-9-]{2,40}$'),
  kind text not null check (kind in ('monument', 'skin')),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  check (split_part(id, ':', 1) = kind)
);

create or replace function public.crate_weights_valid(w jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(w) = 'object'
     and (select array_agg(k order by k) from jsonb_object_keys(w) k) = array['common','epic','legendary','mythic','rare','uncommon']
     and (select bool_and(jsonb_typeof(w->k) = 'number' and (w->>k)::numeric = floor((w->>k)::numeric) and (w->>k)::int >= 0) from jsonb_object_keys(w) k)
     and (select sum((w->>k)::int) from jsonb_object_keys(w) k) = 10000;
$$;

create table public.crate_configs (
  crate text not null check (crate in ('monument', 'skin')),
  version integer not null check (version >= 1),
  -- Basis points per rarity; must total exactly 10000 (100%).
  weights jsonb not null check (public.crate_weights_valid(weights)),
  daily_free_rolls integer not null default 3 check (daily_free_rolls between 0 and 50),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (crate, version)
);
create unique index crate_configs_one_active on public.crate_configs (crate) where active;

create table public.user_collectibles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  def_id text not null references public.collectible_defs (id),
  copies integer not null check (copies >= 1),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, def_id)
);

create table public.crate_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  crate text not null check (crate in ('monument', 'skin')),
  idempotency_key uuid not null,
  config_version integer not null,
  roll integer not null check (roll between 0 and 9999),
  rarity text not null,
  def_id text not null references public.collectible_defs (id),
  duplicate boolean not null,
  copies_after integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index crate_rolls_user_day on public.crate_rolls (user_id, crate, created_at desc);

-- 3D monuments placed on PERSONAL maps (private, like the maps themselves).
create table public.monument_placements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete cascade,
  def_id text not null references public.collectible_defs (id),
  latitude double precision not null check (latitude between -85 and 85),
  longitude double precision not null check (longitude between -180 and 180),
  rotation_deg real not null default 0 check (rotation_deg >= 0 and rotation_deg < 360),
  scale real not null default 1 check (scale between 0.25 and 4),
  -- Supported visual overrides only.
  tint text check (tint is null or tint ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (def_id like 'monument:%')
);
create index monument_placements_map_idx on public.monument_placements (map_id);
create trigger monument_placements_touch before update on public.monument_placements for each row execute function public.touch_updated_at();

-- Equipped skin per personal map (never affects collaboration maps).
create table public.map_skins (
  map_id uuid primary key references public.maps (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  def_id text not null references public.collectible_defs (id) check (def_id like 'skin:%'),
  updated_at timestamptz not null default now()
);
create trigger map_skins_touch before update on public.map_skins for each row execute function public.touch_updated_at();

alter table public.collectible_defs enable row level security;
alter table public.crate_configs enable row level security;
alter table public.user_collectibles enable row level security;
alter table public.crate_rolls enable row level security;
alter table public.monument_placements enable row level security;
alter table public.map_skins enable row level security;

-- Catalog and published odds are public.
create policy collectible_defs_read on public.collectible_defs for select to anon, authenticated using (true);
create policy crate_configs_read on public.crate_configs for select to anon, authenticated using (true);
create policy user_collectibles_own on public.user_collectibles for select to authenticated using (user_id = (select auth.uid()));
create policy crate_rolls_own on public.crate_rolls for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.owns_collectible(p_def text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_collectibles where user_id = auth.uid() and def_id = p_def);
$$;
create or replace function public.owns_personal_map(p_map uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.maps where id = p_map and owner_id = auth.uid());
$$;

create policy placements_select_own on public.monument_placements for select to authenticated
  using (owner_id = (select auth.uid()));
create policy placements_insert_own on public.monument_placements for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_personal_map(map_id) and public.owns_collectible(def_id));
create policy placements_update_own on public.monument_placements for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_personal_map(map_id) and public.owns_collectible(def_id));
create policy placements_delete_own on public.monument_placements for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy map_skins_select_own on public.map_skins for select to authenticated using (owner_id = (select auth.uid()));
create policy map_skins_insert_own on public.map_skins for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.owns_personal_map(map_id) and public.owns_collectible(def_id));
create policy map_skins_update_own on public.map_skins for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_personal_map(map_id) and public.owns_collectible(def_id));
create policy map_skins_delete_own on public.map_skins for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.collectible_defs, public.crate_configs, public.user_collectibles, public.crate_rolls, public.monument_placements, public.map_skins from anon;
grant select on public.collectible_defs, public.crate_configs to anon;
revoke insert, update, delete on public.collectible_defs, public.crate_configs, public.user_collectibles, public.crate_rolls from authenticated;
grant select on public.collectible_defs, public.crate_configs, public.user_collectibles, public.crate_rolls to authenticated;
grant select, insert, update, delete on public.monument_placements, public.map_skins to authenticated;

-- Placement limit per map (keeps rendering fast and storage bounded).
create or replace function public.trg_placement_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.monument_placements where map_id = new.map_id) >= 100 then
    raise exception 'A map can hold at most 100 monuments' using errcode = '22023';
  end if;
  return new;
end; $$;
create trigger monument_placements_limit before insert on public.monument_placements
  for each row execute function public.trg_placement_limit();

-- Uniform integer in [0, n) from the CSPRNG behind gen_random_uuid()
-- (pg_strong_random). The first 4 bytes of a v4 UUID are fully random;
-- values at or above the largest multiple of n are rejected (no modulo bias).
create or replace function public.secure_random_below(n integer)
returns integer language plpgsql volatile set search_path = '' as $$
declare v bigint; lim bigint;
begin
  if n is null or n < 1 then raise exception 'n must be >= 1'; end if;
  lim := (4294967296 / n) * n;
  loop
    v := ('x' || encode(substring(uuid_send(gen_random_uuid()) from 1 for 4), 'hex'))::bit(32)::bigint;
    exit when v < lim;
  end loop;
  return (v % n)::integer;
end; $$;

create or replace function public.rarity_for_roll(p_weights jsonb, p_roll integer)
returns text language plpgsql immutable set search_path = '' as $$
declare r text; acc integer := 0;
begin
  foreach r in array array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] loop
    acc := acc + (p_weights->>r)::integer;
    if p_roll < acc then return r; end if;
  end loop;
  raise exception 'weights do not cover roll %', p_roll;
end; $$;

create or replace function public.crate_rolls_today(p_user uuid, p_crate text)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.crate_rolls
   where user_id = p_user and crate = p_crate and created_at >= date_trunc('day', now(), 'UTC');
$$;

create or replace function public.open_crate(p_crate text, p_idempotency_key uuid)
returns table (roll_id uuid, def_id text, rarity text, roll integer, duplicate boolean, copies integer, rolls_left integer, config_version integer, replayed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_me uuid := public.require_uid();
  v_prev public.crate_rolls;
  v_cfg public.crate_configs;
  v_used integer;
  v_roll integer;
  v_rarity text;
  v_pool integer;
  v_def text;
  v_copies integer;
  v_id uuid;
begin
  if p_crate not in ('monument', 'skin') then raise exception 'Unknown crate' using errcode = '22023'; end if;
  if p_idempotency_key is null then raise exception 'An idempotency key is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_me::text || ':crate', 0));

  select * into v_prev from public.crate_rolls r where r.user_id = v_me and r.idempotency_key = p_idempotency_key;
  if found then
    if v_prev.crate <> p_crate then raise exception 'Idempotency key reused for another crate' using errcode = '22023'; end if;
    select c.daily_free_rolls into v_used from public.crate_configs c where c.crate = p_crate and c.active;
    return query select v_prev.id, v_prev.def_id, v_prev.rarity, v_prev.roll, v_prev.duplicate, v_prev.copies_after,
      greatest(0, coalesce(v_used, 0) - public.crate_rolls_today(v_me, p_crate)), v_prev.config_version, true;
    return;
  end if;

  select * into v_cfg from public.crate_configs c where c.crate = p_crate and c.active;
  if not found then raise exception 'This crate isn''t available right now' using errcode = '22023'; end if;
  v_used := public.crate_rolls_today(v_me, p_crate);
  if v_used >= v_cfg.daily_free_rolls then
    raise exception 'No free rolls left today — they refresh at midnight UTC' using errcode = '22023';
  end if;

  v_roll := public.secure_random_below(10000);
  v_rarity := public.rarity_for_roll(v_cfg.weights, v_roll);
  select count(*) into v_pool from public.collectible_defs d where d.kind = p_crate and d.rarity = v_rarity and d.active;
  if v_pool = 0 then
    -- Blocked, not rerolled: rerolling would change the published odds.
    raise exception 'No % rewards are configured, so this roll was blocked and not used', v_rarity using errcode = '22023';
  end if;
  select d.id into v_def from public.collectible_defs d where d.kind = p_crate and d.rarity = v_rarity and d.active
   order by d.id offset public.secure_random_below(v_pool) limit 1;

  insert into public.user_collectibles as uc (user_id, def_id, copies) values (v_me, v_def, 1)
  on conflict (user_id, def_id) do update set copies = uc.copies + 1, last_at = now()
  returning uc.copies into v_copies;
  insert into public.crate_rolls (user_id, crate, idempotency_key, config_version, roll, rarity, def_id, duplicate, copies_after)
  values (v_me, p_crate, p_idempotency_key, v_cfg.version, v_roll, v_rarity, v_def, v_copies > 1, v_copies)
  returning id into v_id;
  return query select v_id, v_def, v_rarity, v_roll, v_copies > 1, v_copies, v_cfg.daily_free_rolls - v_used - 1, v_cfg.version, false;
end; $$;

create or replace function public.crate_status(p_crate text)
returns table (config_version integer, weights jsonb, daily_free_rolls integer, rolls_left integer)
language sql stable security definer set search_path = '' as $$
  select c.version, c.weights, c.daily_free_rolls,
         case when auth.uid() is null then null else greatest(0, c.daily_free_rolls - public.crate_rolls_today(auth.uid(), p_crate)) end
    from public.crate_configs c where c.crate = p_crate and c.active;
$$;

revoke all on function public.crate_weights_valid(jsonb) from public, anon;
revoke all on function public.owns_collectible(text) from public, anon;
revoke all on function public.owns_personal_map(uuid) from public, anon;
revoke all on function public.trg_placement_limit() from public, anon, authenticated;
revoke all on function public.secure_random_below(integer) from public, anon, authenticated;
revoke all on function public.rarity_for_roll(jsonb, integer) from public, anon;
revoke all on function public.crate_rolls_today(uuid, text) from public, anon, authenticated;
revoke all on function public.open_crate(text, uuid) from public, anon;
revoke all on function public.crate_status(text) from public;
grant execute on function public.crate_weights_valid(jsonb) to authenticated;
grant execute on function public.owns_collectible(text) to authenticated;
grant execute on function public.owns_personal_map(uuid) to authenticated;
grant execute on function public.rarity_for_roll(jsonb, integer) to authenticated;
grant execute on function public.open_crate(text, uuid) to authenticated;
grant execute on function public.crate_status(text) to anon, authenticated;

-- Catalog (src/features/collectibles/catalog.data.json; tests assert they match).
insert into public.collectible_defs (id, kind, rarity, name, metadata) values
  ('monument:stonehenge', 'monument', 'common', 'Stonehenge', '{"region": "Europe", "wikidata": "Q39671", "latitude": 51.17889, "longitude": -1.82611, "model": "/models/monuments/stonehenge.glb"}'::jsonb),
  ('monument:ahu-tongariki', 'monument', 'common', 'Ahu Tongariki', '{"region": "Oceania", "wikidata": "Q3448354", "latitude": -27.12583, "longitude": -109.27694, "model": "/models/monuments/ahu-tongariki.glb"}'::jsonb),
  ('monument:arc-de-triomphe', 'monument', 'common', 'Arc de Triomphe', '{"region": "Europe", "wikidata": "Q64436", "latitude": 48.87378, "longitude": 2.29504, "model": "/models/monuments/arc-de-triomphe.glb"}'::jsonb),
  ('monument:leaning-tower-of-pisa', 'monument', 'uncommon', 'Leaning Tower of Pisa', '{"region": "Europe", "wikidata": "Q39054", "latitude": 43.72301, "longitude": 10.39662, "model": "/models/monuments/leaning-tower-of-pisa.glb"}'::jsonb),
  ('monument:big-ben', 'monument', 'uncommon', 'Big Ben', '{"region": "Europe", "wikidata": "Q41225", "latitude": 51.50067, "longitude": -0.12457, "model": "/models/monuments/big-ben.glb"}'::jsonb),
  ('monument:parthenon', 'monument', 'uncommon', 'Parthenon', '{"region": "Europe", "wikidata": "Q10288", "latitude": 37.97153, "longitude": 23.7266, "model": "/models/monuments/parthenon.glb"}'::jsonb),
  ('monument:statue-of-liberty', 'monument', 'rare', 'Statue of Liberty', '{"region": "North America", "wikidata": "Q9202", "latitude": 40.68921, "longitude": -74.04443, "model": "/models/monuments/statue-of-liberty.glb"}'::jsonb),
  ('monument:neuschwanstein', 'monument', 'rare', 'Neuschwanstein Castle', '{"region": "Europe", "wikidata": "Q4152", "latitude": 47.55749, "longitude": 10.74944, "model": "/models/monuments/neuschwanstein.glb"}'::jsonb),
  ('monument:el-castillo', 'monument', 'rare', 'El Castillo (Temple of Kukulcan)', '{"region": "North America", "wikidata": "Q1128327", "latitude": 20.68289, "longitude": -88.56861, "model": "/models/monuments/el-castillo.glb"}'::jsonb),
  ('monument:colosseum', 'monument', 'epic', 'Colosseum', '{"region": "Europe", "wikidata": "Q10285", "latitude": 41.89028, "longitude": 12.49222, "model": "/models/monuments/colosseum.glb"}'::jsonb),
  ('monument:petra-treasury', 'monument', 'epic', 'Al-Khazneh (The Treasury)', '{"region": "Asia", "wikidata": "Q1259626", "latitude": 30.32206, "longitude": 35.45145, "model": "/models/monuments/petra-treasury.glb"}'::jsonb),
  ('monument:saint-basils', 'monument', 'epic', 'St. Basil’s Cathedral', '{"region": "Europe", "wikidata": "Q129846", "latitude": 55.7525, "longitude": 37.62306, "model": "/models/monuments/saint-basils.glb"}'::jsonb),
  ('monument:eiffel-tower', 'monument', 'legendary', 'Eiffel Tower', '{"region": "Europe", "wikidata": "Q243", "latitude": 48.8583, "longitude": 2.29448, "model": "/models/monuments/eiffel-tower.glb"}'::jsonb),
  ('monument:taj-mahal', 'monument', 'legendary', 'Taj Mahal', '{"region": "Asia", "wikidata": "Q9141", "latitude": 27.175, "longitude": 78.04194, "model": "/models/monuments/taj-mahal.glb"}'::jsonb),
  ('monument:angkor-wat', 'monument', 'legendary', 'Angkor Wat', '{"region": "Asia", "wikidata": "Q43473", "latitude": 13.4125, "longitude": 103.86667, "model": "/models/monuments/angkor-wat.glb"}'::jsonb),
  ('monument:great-pyramid', 'monument', 'mythic', 'Great Pyramid of Giza', '{"region": "Africa", "wikidata": "Q37200", "latitude": 29.97915, "longitude": 31.13422, "model": "/models/monuments/great-pyramid.glb"}'::jsonb),
  ('monument:machu-picchu', 'monument', 'mythic', 'Machu Picchu', '{"region": "South America", "wikidata": "Q676203", "latitude": -13.16333, "longitude": -72.54556, "model": "/models/monuments/machu-picchu.glb"}'::jsonb),
  ('monument:hagia-sophia', 'monument', 'mythic', 'Hagia Sophia', '{"region": "Asia", "wikidata": "Q12506", "latitude": 41.00833, "longitude": 28.98, "model": "/models/monuments/hagia-sophia.glb"}'::jsonb),
  ('skin:coastal-explorer', 'skin', 'common', 'Coastal Explorer', '{}'::jsonb),
  ('skin:classic-road-atlas', 'skin', 'common', 'Classic Road Atlas', '{}'::jsonb),
  ('skin:soft-terrain', 'skin', 'common', 'Soft Terrain', '{}'::jsonb),
  ('skin:ocean-cartographer', 'skin', 'uncommon', 'Ocean Cartographer', '{}'::jsonb),
  ('skin:woodland-trails', 'skin', 'uncommon', 'Woodland Trails', '{}'::jsonb),
  ('skin:desert-expedition', 'skin', 'uncommon', 'Desert Expedition', '{}'::jsonb),
  ('skin:midnight-navigator', 'skin', 'rare', 'Midnight Navigator', '{}'::jsonb),
  ('skin:vintage-survey', 'skin', 'rare', 'Vintage Survey', '{}'::jsonb),
  ('skin:alpine-explorer', 'skin', 'rare', 'Alpine Explorer', '{}'::jsonb),
  ('skin:golden-cartography', 'skin', 'epic', 'Golden Cartography', '{}'::jsonb),
  ('skin:imperial-atlas', 'skin', 'epic', 'Imperial Atlas', '{}'::jsonb),
  ('skin:celestial-routes', 'skin', 'epic', 'Celestial Routes', '{}'::jsonb),
  ('skin:royal-treasure-map', 'skin', 'legendary', 'Royal Treasure Map', '{}'::jsonb),
  ('skin:deep-sea-navigator', 'skin', 'legendary', 'Deep-Sea Navigator', '{}'::jsonb),
  ('skin:ancient-world-atlas', 'skin', 'legendary', 'Ancient World Atlas', '{}'::jsonb),
  ('skin:living-parchment', 'skin', 'mythic', 'Living Parchment', '{}'::jsonb),
  ('skin:astral-cartographer', 'skin', 'mythic', 'Astral Cartographer', '{}'::jsonb),
  ('skin:worldmakers-atlas', 'skin', 'mythic', 'Worldmaker’s Atlas', '{}'::jsonb)
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, name = excluded.name, metadata = excluded.metadata;

-- Initial published odds (identical for both crates, versioned separately).
insert into public.crate_configs (crate, version, weights, daily_free_rolls, active) values
  ('monument', 1, '{"common":3000,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100}', 3, true),
  ('skin', 1, '{"common":3000,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100}', 3, true)
on conflict (crate, version) do nothing;
