/**
 * Collectibles economy (migration 0017): published odds, server-authoritative
 * rolls, idempotency, free-roll limits, duplicates, inventory integrity,
 * placement and skin permissions.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let t: TestDb;
let alice: string; let bob: string;
const catalog = JSON.parse(readFileSync('src/features/collectibles/catalog.data.json', 'utf8')) as {
  monuments: { id: string; rarity: string; name: string }[]; skins: { id: string; rarity: string; name: string }[];
};
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial'];
const uuid = () => crypto.randomUUID();
const open = (crate: string, key = uuid()) => t.one<{ def_id: string; rarity: string; duplicate: boolean; copies: number; rolls_left: number; replayed: boolean; roll: number }>(
  `select * from public.open_crate($1, $2)`, [crate, key]);

beforeEach(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice'); bob = await t.createUser('bob');
});

describe('catalog and published odds', () => {
  it('database catalog matches the client catalog; ≥3 rewards per regular rarity, exactly 1 Celestial per crate', async () => {
    await t.asAnon();
    const defs = await t.query<{ id: string; kind: string; rarity: string; name: string }>(`select id, kind, rarity, name from public.collectible_defs order by id`);
    const expected = [...catalog.monuments.map((m) => ({ id: `monument:${m.id}`, kind: 'monument', rarity: m.rarity, name: m.name })),
      ...catalog.skins.map((s) => ({ id: `skin:${s.id}`, kind: 'skin', rarity: s.rarity, name: s.name }))].sort((a, b) => a.id.localeCompare(b.id));
    expect(defs).toEqual(expected);
    for (const kind of ['monument', 'skin']) for (const r of RARITIES) {
      const n = defs.filter((d) => d.kind === kind && d.rarity === r).length;
      if (r === 'celestial') expect(n, `${kind}/${r}`).toBe(1);
      else expect(n, `${kind}/${r}`).toBeGreaterThanOrEqual(3);
    }
    // A second Celestial reward in the same crate is refused by the database.
    await t.asAdmin();
    expect(await t.fails(`insert into public.collectible_defs (id, kind, rarity, name) values ('skin:second-star', 'skin', 'celestial', 'Second star')`)).toMatch(/Only one Celestial/);
  });

  it('both crates publish version-2 odds: total exactly 100%, Mythic exactly 1%, Celestial 0.1%; version 1 is kept, inactive', async () => {
    await t.asAnon(); // published odds are readable signed out
    for (const crate of ['monument', 'skin']) {
      const { weights, version } = await t.one<{ weights: Record<string, number>; version: number }>(`select weights, version from public.crate_configs where crate = $1 and active`, [crate]);
      expect(version).toBe(2);
      expect(weights).toEqual({ common: 2990, uncommon: 2500, rare: 2000, epic: 1400, legendary: 1000, mythic: 100, celestial: 10 });
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(10000);
      const v1 = await t.one<{ weights: Record<string, number>; active: boolean }>(`select weights, active from public.crate_configs where crate = $1 and version = 1`, [crate]);
      expect(v1).toEqual({ weights: { common: 3000, uncommon: 2500, rare: 2000, epic: 1400, legendary: 1000, mythic: 100 }, active: false });
    }
  });

  it('invalid odds are rejected by the database', async () => {
    await t.asAdmin();
    for (const w of ['{"common":5000,"uncommon":5000,"rare":0,"epic":0,"legendary":0,"mythic":1}', '{"common":10000}', '{"common":3000.5,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":99.5}']) {
      expect(await t.fails(`insert into public.crate_configs (crate, version, weights) values ('skin', 9, $1::jsonb)`, [w])).toMatch(/check constraint/);
    }
  });

  it('roll → rarity boundaries follow the published weights exactly', async () => {
    await t.asAdmin();
    const w = '{"common":3000,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100}';
    const at = async (roll: number) => (await t.one<{ r: string }>(`select public.rarity_for_roll($1::jsonb, $2) r`, [w, roll])).r;
    expect([await at(0), await at(2999), await at(3000), await at(5499), await at(5500), await at(7499), await at(7500),
      await at(8899), await at(8900), await at(9899), await at(9900), await at(9999)])
      .toEqual(['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary', 'mythic', 'mythic']);
    // Version 2: Celestial is the last 10 rolls (9990..9999).
    const w2 = '{"common":2990,"uncommon":2500,"rare":2000,"epic":1400,"legendary":1000,"mythic":100,"celestial":10}';
    const at2 = async (roll: number) => (await t.one<{ r: string }>(`select public.rarity_for_roll($1::jsonb, $2) r`, [w2, roll])).r;
    expect([await at2(0), await at2(2989), await at2(2990), await at2(9889), await at2(9890), await at2(9989), await at2(9990), await at2(9999)])
      .toEqual(['common', 'common', 'uncommon', 'legendary', 'mythic', 'mythic', 'celestial', 'celestial']);
  });

  it('the CSPRNG is uniform over 0..9999 (statistical check, 40k draws)', async () => {
    await t.asAdmin();
    const rows = await t.query<{ v: number }>(`select public.secure_random_below(10000) v from generate_series(1, 40000)`);
    expect(rows.every((r) => r.v >= 0 && r.v < 10000)).toBe(true);
    const bucket = (lo: number, hi: number) => rows.filter((r) => r.v >= lo && r.v < hi).length / rows.length;
    // 6σ bands around each published probability.
    for (const [lo, hi, p] of [[0, 3000, 0.3], [3000, 5500, 0.25], [5500, 7500, 0.2], [7500, 8900, 0.14], [8900, 9900, 0.1], [9900, 10000, 0.01]]) {
      const sigma = Math.sqrt((p * (1 - p)) / rows.length);
      expect(Math.abs(bucket(lo, hi) - p), `[${lo},${hi})`).toBeLessThan(6 * sigma);
    }
  });
});

describe('opening crates', () => {
  it('server picks a valid reward; idempotent retries; daily free-roll limit; duplicates are counted', async () => {
    await t.as(alice);
    const key = uuid();
    const r1 = await open('monument', key);
    expect(catalog.monuments.map((m) => `monument:${m.id}`)).toContain(r1.def_id);
    expect(catalog.monuments.find((m) => `monument:${m.id}` === r1.def_id)!.rarity).toBe(r1.rarity);
    expect(r1).toMatchObject({ rolls_left: 2, replayed: false, copies: 1, duplicate: false });
    const again = await open('monument', key); // network retry / double click
    expect(again).toMatchObject({ def_id: r1.def_id, replayed: true, roll: r1.roll });
    await open('monument'); await open('monument');
    expect(await t.fails(`select * from public.open_crate('monument', $1)`, [uuid()])).toMatch(/No free rolls left today/);
    expect((await t.one<{ n: number }>(`select count(*)::int n from public.crate_rolls`)).n).toBe(3);
    // Skin crate has its own allowance.
    expect((await open('skin')).def_id).toMatch(/^skin:/);
    // Inventory copies equal the rolls recorded, per reward.
    const inv = await t.query<{ def_id: string; copies: number }>(`select def_id, copies from public.user_collectibles`);
    const rolls = await t.query<{ def_id: string; n: number }>(`select def_id, count(*)::int n from public.crate_rolls group by def_id`);
    expect(inv.sort((a, b) => a.def_id.localeCompare(b.def_id))).toEqual(rolls.map((r) => ({ def_id: r.def_id, copies: r.n })).sort((a, b) => a.def_id.localeCompare(b.def_id)));
  });

  it('duplicates increment copies and are flagged', async () => {
    await t.asAdmin();
    // Only one active monument so every roll hits the same reward.
    await t.query(`update public.collectible_defs set active = false where kind = 'monument'`);
    await t.query(`update public.crate_configs set active = false where crate = 'monument'`);
    await t.query(`insert into public.crate_configs (crate, version, weights, active) values ('monument', 9, '{"common":10000,"uncommon":0,"rare":0,"epic":0,"legendary":0,"mythic":0}', true)`);
    await t.query(`update public.collectible_defs set active = true where id = 'monument:stonehenge'`);
    await t.as(alice);
    expect(await open('monument')).toMatchObject({ def_id: 'monument:stonehenge', duplicate: false, copies: 1 });
    expect(await open('monument')).toMatchObject({ def_id: 'monument:stonehenge', duplicate: true, copies: 2 });
  });

  it('an empty rarity pool blocks the roll without consuming it (never rerolls)', async () => {
    await t.asAdmin();
    await t.query(`update public.collectible_defs set active = false where kind = 'skin' and rarity = 'common'`);
    await t.query(`update public.crate_configs set active = false where crate = 'skin'`);
    await t.query(`insert into public.crate_configs (crate, version, weights, active) values ('skin', 9, '{"common":10000,"uncommon":0,"rare":0,"epic":0,"legendary":0,"mythic":0}', true)`);
    await t.as(alice);
    expect(await t.fails(`select * from public.open_crate('skin', $1)`, [uuid()])).toMatch(/blocked and not used/);
    expect(await t.query(`select * from public.crate_rolls`)).toEqual([]);
    expect((await t.one<{ rolls_left: number }>(`select rolls_left from public.crate_status('skin')`)).rolls_left).toBe(3);
  });

  it('clients cannot forge inventory, rolls or odds', async () => {
    await t.as(alice);
    expect(await t.fails(`insert into public.user_collectibles (user_id, def_id, copies) values ($1, 'monument:great-pyramid', 1)`, [alice])).toMatch(/permission denied/);
    expect(await t.fails(`insert into public.crate_rolls (user_id, crate, idempotency_key, config_version, roll, rarity, def_id, duplicate, copies_after) values ($1, 'monument', $2, 1, 9999, 'mythic', 'monument:great-pyramid', false, 1)`, [alice, uuid()])).toMatch(/permission denied/);
    expect(await t.fails(`update public.crate_configs set weights = '{"common":0,"uncommon":0,"rare":0,"epic":0,"legendary":0,"mythic":10000}'`)).toMatch(/permission denied/);
    expect(await t.fails(`select public.secure_random_below(2)`)).toMatch(/permission denied/);
    await open('monument');
    await t.as(bob);
    expect(await t.query(`select * from public.user_collectibles`)).toEqual([]);
    expect(await t.query(`select * from public.crate_rolls`)).toEqual([]);
    await t.asAnon();
    expect(await t.fails(`select * from public.open_crate('monument', $1)`, [uuid()])).toMatch(/permission denied/);
  });
});

describe('placements and skins', () => {
  async function ownOne(user: string, crate: 'monument' | 'skin') {
    await t.as(user);
    return (await open(crate)).def_id;
  }
  const mapOf = async (user: string) => { await t.asAdmin(); return (await t.one<{ id: string }>(`select id from public.maps where owner_id = $1`, [user])).id; };

  it('only owned monuments on own maps; owner-only edits; inventory unchanged by placing', async () => {
    const def = await ownOne(alice, 'monument');
    const aMap = await mapOf(alice); const bMap = await mapOf(bob);
    await t.as(alice);
    const { id } = await t.one<{ id: string }>(`insert into public.monument_placements (map_id, def_id, latitude, longitude, rotation_deg, scale) values ($1, $2, 48.85, 2.29, 45, 1.5) returning id`, [aMap, def]);
    await t.query(`insert into public.monument_placements (map_id, def_id, latitude, longitude) values ($1, $2, 48.86, 2.3)`, [aMap, def]); // multiple placements allowed
    expect((await t.one<{ copies: number }>(`select copies from public.user_collectibles where def_id = $1`, [def])).copies).toBe(1);
    const unowned = catalog.monuments.map((m) => `monument:${m.id}`).find((x) => x !== def)!;
    expect(await t.fails(`insert into public.monument_placements (map_id, def_id, latitude, longitude) values ($1, $2, 1, 1)`, [aMap, unowned])).toMatch(/row-level security/);
    expect(await t.fails(`insert into public.monument_placements (map_id, def_id, latitude, longitude) values ($1, $2, 1, 1)`, [bMap, def])).toMatch(/row-level security/);
    expect(await t.fails(`update public.monument_placements set scale = 9 where id = $1`, [id])).toMatch(/check constraint/);
    await t.query(`update public.monument_placements set rotation_deg = 90, latitude = 48.851 where id = $1`, [id]);
    await t.as(bob);
    expect(await t.query(`select * from public.monument_placements`)).toEqual([]);
    await t.query(`delete from public.monument_placements where id = $1`, [id]); // silently affects nothing
    await t.as(alice);
    expect((await t.query(`select id from public.monument_placements`)).length).toBe(2);
  });

  it('skins: equip only owned skins on own personal maps', async () => {
    const skin = await ownOne(alice, 'skin');
    const aMap = await mapOf(alice); const bMap = await mapOf(bob);
    await t.as(alice);
    await t.query(`insert into public.map_skins (map_id, def_id) values ($1, $2)`, [aMap, skin]);
    const other = catalog.skins.map((s) => `skin:${s.id}`).find((x) => x !== skin)!;
    expect(await t.fails(`update public.map_skins set def_id = $2 where map_id = $1`, [aMap, other])).toMatch(/row-level security/);
    expect(await t.fails(`insert into public.map_skins (map_id, def_id) values ($1, $2)`, [bMap, skin])).toMatch(/row-level security/);
    expect(await t.fails(`insert into public.map_skins (map_id, def_id) values ($1, 'monument:stonehenge')`, [aMap])).toMatch(/check constraint|row-level/);
    await t.query(`delete from public.map_skins where map_id = $1`, [aMap]); // restore default
    expect(await t.query(`select * from public.map_skins`)).toEqual([]);
  });
});
