#!/bin/sh
# Regenerates supabase/migrations/20261010000020_celestial_tier_catalog_v2.sql (before it is applied).
set -e
cd "$(dirname "$0")/../.."
OUT=supabase/migrations/20261010000020_celestial_tier_catalog_v2.sql
cat > $OUT <<'SQL'
-- Celestial rarity (above Mythic) and catalog v2: 18 more monuments and 19
-- more map skins.
--
-- NON-DESTRUCTIVE: existing inventories, rolls, placements and equipped skins
-- are untouched; the old odds (version 1) stay in the table for the record
-- and are simply marked inactive when version 2 is published.
--
--   * collectible_defs.rarity also accepts 'celestial'.
--   * crate_weights_valid accepts the original 6-rarity table (version 1) or
--     the 7-rarity table; both must total exactly 10000 basis points.
--   * rarity_for_roll walks common → … → mythic → celestial (missing keys
--     count as 0, so version-1 weights behave exactly as before).
--   * Celestial holds exactly ONE reward per crate (checked by a trigger).
--   * Version 2 odds (both crates): Common 29.9 %, Uncommon 25 %, Rare 20 %,
--     Epic 14 %, Legendary 10 %, Mythic 1 %, Celestial 0.1 %.

alter table public.collectible_defs drop constraint if exists collectible_defs_rarity_check;
alter table public.collectible_defs add constraint collectible_defs_rarity_check
  check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial'));

create or replace function public.crate_weights_valid(w jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(w) = 'object'
     and (select array_agg(k order by k) from jsonb_object_keys(w) k) in (
           array['common','epic','legendary','mythic','rare','uncommon'],
           array['celestial','common','epic','legendary','mythic','rare','uncommon'])
     and (select bool_and(jsonb_typeof(w->k) = 'number' and (w->>k)::numeric = floor((w->>k)::numeric) and (w->>k)::int >= 0) from jsonb_object_keys(w) k)
     and (select sum((w->>k)::int) from jsonb_object_keys(w) k) = 10000;
$$;

create or replace function public.rarity_for_roll(p_weights jsonb, p_roll integer)
returns text language plpgsql immutable set search_path = '' as $$
declare r text; acc integer := 0;
begin
  foreach r in array array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial'] loop
    acc := acc + coalesce((p_weights->>r)::integer, 0);
    if p_roll < acc then return r; end if;
  end loop;
  raise exception 'weights do not cover roll %', p_roll;
end; $$;

-- Exactly one active Celestial reward per crate kind.
create or replace function public.trg_one_celestial_per_kind()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.collectible_defs d where d.rarity = 'celestial' and d.active and d.kind = new.kind) > 1 then
    raise exception 'Only one Celestial reward is allowed per crate' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function public.trg_one_celestial_per_kind() from public, anon, authenticated;
drop trigger if exists collectible_defs_one_celestial on public.collectible_defs;
create constraint trigger collectible_defs_one_celestial after insert or update on public.collectible_defs
  deferrable initially deferred for each row when (new.rarity = 'celestial') execute function public.trg_one_celestial_per_kind();

-- Catalog (src/features/collectibles/catalog.data.json; tests assert they match).
SQL
node scripts/models/gen-catalog-sql.mjs >> $OUT
cat >> $OUT <<'SQL'

-- Publish version 2 odds; version 1 stays for the record (rolls keep their config_version).
update public.crate_configs set active = false where crate in ('monument', 'skin') and version = 1 and active;
insert into public.crate_configs (crate, version, weights, daily_free_rolls, active) values
  ('monument', 2, '{"common":2990,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100,"celestial":10}', 3, true),
  ('skin', 2, '{"common":2990,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100,"celestial":10}', 3, true)
on conflict (crate, version) do nothing;
SQL
echo "wrote $OUT"
