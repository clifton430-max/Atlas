/**
 * Print the collectible_defs upsert for every catalog entry (used to write
 * migration 0020; the DB test asserts the database matches the catalog):
 *   node scripts/models/gen-catalog-sql.mjs
 */
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('../../src/features/collectibles/catalog.data.json', import.meta.url)));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = [];
for (const m of data.monuments) {
  const meta = { region: m.region, ...(m.fictional ? { fictional: true } : { wikidata: m.wikidata, latitude: m.latitude, longitude: m.longitude }), model: `/models/monuments/${m.id}.glb` };
  rows.push(`  (${q(`monument:${m.id}`)}, 'monument', ${q(m.rarity)}, ${q(m.name)}, ${q(JSON.stringify(meta))}::jsonb)`);
}
for (const s of data.skins) rows.push(`  (${q(`skin:${s.id}`)}, 'skin', ${q(s.rarity)}, ${q(s.name)}, '{}'::jsonb)`);
console.log(`insert into public.collectible_defs (id, kind, rarity, name, metadata) values\n${rows.join(',\n')}\non conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, name = excluded.name, metadata = excluded.metadata;`);
