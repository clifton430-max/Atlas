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
insert into public.collectible_defs (id, kind, rarity, name, metadata) values
  ('monument:stonehenge', 'monument', 'common', 'Stonehenge', '{"region":"Europe","wikidata":"Q39671","latitude":51.17889,"longitude":-1.82611,"model":"/models/monuments/stonehenge.glb"}'::jsonb),
  ('monument:ahu-tongariki', 'monument', 'common', 'Ahu Tongariki', '{"region":"Oceania","wikidata":"Q3448354","latitude":-27.12583,"longitude":-109.27694,"model":"/models/monuments/ahu-tongariki.glb"}'::jsonb),
  ('monument:arc-de-triomphe', 'monument', 'common', 'Arc de Triomphe', '{"region":"Europe","wikidata":"Q64436","latitude":48.87378,"longitude":2.29504,"model":"/models/monuments/arc-de-triomphe.glb"}'::jsonb),
  ('monument:leaning-tower-of-pisa', 'monument', 'uncommon', 'Leaning Tower of Pisa', '{"region":"Europe","wikidata":"Q39054","latitude":43.72301,"longitude":10.39662,"model":"/models/monuments/leaning-tower-of-pisa.glb"}'::jsonb),
  ('monument:big-ben', 'monument', 'uncommon', 'Big Ben', '{"region":"Europe","wikidata":"Q41225","latitude":51.50067,"longitude":-0.12457,"model":"/models/monuments/big-ben.glb"}'::jsonb),
  ('monument:parthenon', 'monument', 'uncommon', 'Parthenon', '{"region":"Europe","wikidata":"Q10288","latitude":37.97153,"longitude":23.7266,"model":"/models/monuments/parthenon.glb"}'::jsonb),
  ('monument:statue-of-liberty', 'monument', 'rare', 'Statue of Liberty', '{"region":"North America","wikidata":"Q9202","latitude":40.68921,"longitude":-74.04443,"model":"/models/monuments/statue-of-liberty.glb"}'::jsonb),
  ('monument:neuschwanstein', 'monument', 'rare', 'Neuschwanstein Castle', '{"region":"Europe","wikidata":"Q4152","latitude":47.55749,"longitude":10.74944,"model":"/models/monuments/neuschwanstein.glb"}'::jsonb),
  ('monument:el-castillo', 'monument', 'rare', 'El Castillo (Temple of Kukulcan)', '{"region":"North America","wikidata":"Q1128327","latitude":20.68289,"longitude":-88.56861,"model":"/models/monuments/el-castillo.glb"}'::jsonb),
  ('monument:colosseum', 'monument', 'epic', 'Colosseum', '{"region":"Europe","wikidata":"Q10285","latitude":41.89028,"longitude":12.49222,"model":"/models/monuments/colosseum.glb"}'::jsonb),
  ('monument:petra-treasury', 'monument', 'epic', 'Al-Khazneh (The Treasury)', '{"region":"Asia","wikidata":"Q1259626","latitude":30.32206,"longitude":35.45145,"model":"/models/monuments/petra-treasury.glb"}'::jsonb),
  ('monument:saint-basils', 'monument', 'epic', 'St. Basil’s Cathedral', '{"region":"Europe","wikidata":"Q129846","latitude":55.7525,"longitude":37.62306,"model":"/models/monuments/saint-basils.glb"}'::jsonb),
  ('monument:eiffel-tower', 'monument', 'legendary', 'Eiffel Tower', '{"region":"Europe","wikidata":"Q243","latitude":48.8583,"longitude":2.29448,"model":"/models/monuments/eiffel-tower.glb"}'::jsonb),
  ('monument:taj-mahal', 'monument', 'legendary', 'Taj Mahal', '{"region":"Asia","wikidata":"Q9141","latitude":27.175,"longitude":78.04194,"model":"/models/monuments/taj-mahal.glb"}'::jsonb),
  ('monument:angkor-wat', 'monument', 'legendary', 'Angkor Wat', '{"region":"Asia","wikidata":"Q43473","latitude":13.4125,"longitude":103.86667,"model":"/models/monuments/angkor-wat.glb"}'::jsonb),
  ('monument:great-pyramid', 'monument', 'mythic', 'Great Pyramid of Giza', '{"region":"Africa","wikidata":"Q37200","latitude":29.97915,"longitude":31.13422,"model":"/models/monuments/great-pyramid.glb"}'::jsonb),
  ('monument:machu-picchu', 'monument', 'mythic', 'Machu Picchu', '{"region":"South America","wikidata":"Q676203","latitude":-13.16333,"longitude":-72.54556,"model":"/models/monuments/machu-picchu.glb"}'::jsonb),
  ('monument:hagia-sophia', 'monument', 'mythic', 'Hagia Sophia', '{"region":"Asia","wikidata":"Q12506","latitude":41.00833,"longitude":28.98,"model":"/models/monuments/hagia-sophia.glb"}'::jsonb),
  ('monument:great-torii', 'monument', 'common', 'Great Torii of Itsukushima', '{"region":"Asia","wikidata":"Q191763","latitude":34.29577,"longitude":132.32011,"model":"/models/monuments/great-torii.glb"}'::jsonb),
  ('monument:kinderdijk-windmills', 'monument', 'common', 'Windmills of Kinderdijk', '{"region":"Europe","wikidata":"Q740066","latitude":51.88333,"longitude":4.63333,"model":"/models/monuments/kinderdijk-windmills.glb"}'::jsonb),
  ('monument:wayfinders-cairn', 'monument', 'common', 'Wayfinder’s Cairn', '{"region":"Atlas Originals","fictional":true,"model":"/models/monuments/wayfinders-cairn.glb"}'::jsonb),
  ('monument:brandenburg-gate', 'monument', 'uncommon', 'Brandenburg Gate', '{"region":"Europe","wikidata":"Q82425","latitude":52.51627,"longitude":13.37772,"model":"/models/monuments/brandenburg-gate.glb"}'::jsonb),
  ('monument:tower-of-hercules', 'monument', 'uncommon', 'Tower of Hercules', '{"region":"Europe","wikidata":"Q245151","latitude":43.38583,"longitude":-8.40639,"model":"/models/monuments/tower-of-hercules.glb"}'::jsonb),
  ('monument:lantern-lighthouse', 'monument', 'uncommon', 'Lantern Lighthouse', '{"region":"Atlas Originals","fictional":true,"model":"/models/monuments/lantern-lighthouse.glb"}'::jsonb),
  ('monument:golden-gate-bridge', 'monument', 'rare', 'Golden Gate Bridge', '{"region":"North America","wikidata":"Q44440","latitude":37.81972,"longitude":-122.47861,"model":"/models/monuments/golden-gate-bridge.glb"}'::jsonb),
  ('monument:himeji-castle', 'monument', 'rare', 'Himeji Castle', '{"region":"Asia","wikidata":"Q188754","latitude":34.83944,"longitude":134.69361,"model":"/models/monuments/himeji-castle.glb"}'::jsonb),
  ('monument:floating-observatory', 'monument', 'rare', 'Floating Observatory', '{"region":"Atlas Originals","fictional":true,"model":"/models/monuments/floating-observatory.glb"}'::jsonb),
  ('monument:temple-of-heaven', 'monument', 'epic', 'Temple of Heaven', '{"region":"Asia","wikidata":"Q125445","latitude":39.8822,"longitude":116.4066,"model":"/models/monuments/temple-of-heaven.glb"}'::jsonb),
  ('monument:notre-dame', 'monument', 'epic', 'Notre-Dame de Paris', '{"region":"Europe","wikidata":"Q2981","latitude":48.853,"longitude":2.3498,"model":"/models/monuments/notre-dame.glb"}'::jsonb),
  ('monument:clockwork-compass', 'monument', 'epic', 'Clockwork Compass Tower', '{"region":"Atlas Originals","fictional":true,"model":"/models/monuments/clockwork-compass.glb"}'::jsonb),
  ('monument:great-sphinx', 'monument', 'legendary', 'Great Sphinx of Giza', '{"region":"Africa","wikidata":"Q130958","latitude":29.97527,"longitude":31.13768,"model":"/models/monuments/great-sphinx.glb"}'::jsonb),
  ('monument:potala-palace', 'monument', 'legendary', 'Potala Palace', '{"region":"Asia","wikidata":"Q71229","latitude":29.65778,"longitude":91.11694,"model":"/models/monuments/potala-palace.glb"}'::jsonb),
  ('monument:skyward-harbour', 'monument', 'legendary', 'Skyward Harbour', '{"region":"Atlas Originals","fictional":true,"model":"/models/monuments/skyward-harbour.glb"}'::jsonb),
  ('monument:borobudur', 'monument', 'mythic', 'Borobudur', '{"region":"Asia","wikidata":"Q42798","latitude":-7.60793,"longitude":110.20384,"model":"/models/monuments/borobudur.glb"}'::jsonb),
  ('monument:crystal-spire', 'monument', 'mythic', 'Crystal Spire of the Cartographers', '{"region":"Atlas Originals","fictional":true,"model":"/models/monuments/crystal-spire.glb"}'::jsonb),
  ('monument:farnese-atlas', 'monument', 'celestial', 'Farnese Atlas', '{"region":"Europe","wikidata":"Q2555479","latitude":40.8534,"longitude":14.2505,"model":"/models/monuments/farnese-atlas.glb"}'::jsonb),
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
  ('skin:worldmakers-atlas', 'skin', 'mythic', 'Worldmaker’s Atlas', '{}'::jsonb),
  ('skin:paper-sketch', 'skin', 'common', 'Paper Sketch', '{}'::jsonb),
  ('skin:mint-transit', 'skin', 'common', 'Mint Transit', '{}'::jsonb),
  ('skin:harvest-fields', 'skin', 'common', 'Harvest Fields', '{}'::jsonb),
  ('skin:cherry-blossom', 'skin', 'uncommon', 'Cherry Blossom', '{}'::jsonb),
  ('skin:nordic-frost', 'skin', 'uncommon', 'Nordic Frost', '{}'::jsonb),
  ('skin:terracotta-villa', 'skin', 'uncommon', 'Terracotta Villa', '{}'::jsonb),
  ('skin:blueprint', 'skin', 'rare', 'Blueprint', '{}'::jsonb),
  ('skin:autumn-ember', 'skin', 'rare', 'Autumn Ember', '{}'::jsonb),
  ('skin:tropical-lagoon', 'skin', 'rare', 'Tropical Lagoon', '{}'::jsonb),
  ('skin:neon-metropolis', 'skin', 'epic', 'Neon Metropolis', '{}'::jsonb),
  ('skin:jade-dynasty', 'skin', 'epic', 'Jade Dynasty', '{}'::jsonb),
  ('skin:arctic-aurora', 'skin', 'epic', 'Arctic Aurora', '{}'::jsonb),
  ('skin:volcanic-forge', 'skin', 'legendary', 'Volcanic Forge', '{}'::jsonb),
  ('skin:sunken-atlantis', 'skin', 'legendary', 'Sunken Atlantis', '{}'::jsonb),
  ('skin:samurai-ink', 'skin', 'legendary', 'Samurai Ink', '{}'::jsonb),
  ('skin:dragons-hoard', 'skin', 'mythic', 'Dragon’s Hoard', '{}'::jsonb),
  ('skin:eternal-garden', 'skin', 'mythic', 'Eternal Garden', '{}'::jsonb),
  ('skin:clockmakers-chart', 'skin', 'mythic', 'Clockmaker’s Chart', '{}'::jsonb),
  ('skin:atlas-of-the-heavens', 'skin', 'celestial', 'Atlas of the Heavens', '{}'::jsonb)
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, name = excluded.name, metadata = excluded.metadata;

-- Publish version 2 odds; version 1 stays for the record (rolls keep their config_version).
update public.crate_configs set active = false where crate in ('monument', 'skin') and version = 1 and active;
insert into public.crate_configs (crate, version, weights, daily_free_rolls, active) values
  ('monument', 2, '{"common":2990,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100,"celestial":10}', 3, true),
  ('skin', 2, '{"common":2990,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100,"celestial":10}', 3, true)
on conflict (crate, version) do nothing;
