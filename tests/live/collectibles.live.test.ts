/**
 * LIVE: collectibles economy against the linked project (dedicated test accounts).
 * Before running, the test accounts' crate_rolls are cleared so the daily
 * free-roll allowance is available (test data only).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { liveConfigured, signedIn, withAdmin } from './env';

let A: SupabaseClient, B: SupabaseClient;
let aId: string, bId: string;
const cleanup: (() => PromiseLike<unknown>)[] = [];

describe.skipIf(!liveConfigured)('collectibles (live)', () => {
  beforeAll(async () => {
    ({ client: A, userId: aId } = await signedIn('A'));
    ({ client: B, userId: bId } = await signedIn('B'));
    await withAdmin(async (admin) => { await admin.from('crate_rolls').delete().in('user_id', [aId, bId]); });
  });
  afterAll(async () => { for (const fn of cleanup.reverse()) await Promise.resolve(fn()).catch(() => undefined); });

  it('publishes exactly the odds the server uses (sum 100%, Mythic 1%)', async () => {
    for (const crate of ['monument', 'skin']) {
      const { data } = await A.rpc('crate_status', { p_crate: crate });
      expect(data[0].weights).toEqual({ common: 3000, uncommon: 2500, rare: 2000, epic: 1400, legendary: 1000, mythic: 100 });
      expect(data[0].rolls_left).toBe(3);
    }
  });

  it('rolls are server-decided, idempotent, limited per day, and counted in the inventory', async () => {
    const key = crypto.randomUUID();
    const first = (await A.rpc('open_crate', { p_crate: 'monument', p_idempotency_key: key })).data[0];
    expect(first.def_id).toMatch(/^monument:/);
    const retry = (await A.rpc('open_crate', { p_crate: 'monument', p_idempotency_key: key })).data[0];
    expect(retry).toMatchObject({ def_id: first.def_id, replayed: true, roll: first.roll });
    await A.rpc('open_crate', { p_crate: 'monument', p_idempotency_key: crypto.randomUUID() });
    await A.rpc('open_crate', { p_crate: 'monument', p_idempotency_key: crypto.randomUUID() });
    const fourth = await A.rpc('open_crate', { p_crate: 'monument', p_idempotency_key: crypto.randomUUID() });
    expect(fourth.error?.message).toMatch(/No free rolls left today/);
    const { data: rolls } = await A.from('crate_rolls').select('def_id').eq('crate', 'monument');
    expect(rolls).toHaveLength(3);
    const { data: inv } = await A.from('user_collectibles').select('def_id, copies').eq('def_id', first.def_id).single();
    expect(inv!.copies).toBeGreaterThanOrEqual(1);
  });

  it('clients cannot forge rewards, odds or other people’s data', async () => {
    await A.from('user_collectibles').insert({ user_id: aId, def_id: 'monument:great-pyramid', copies: 99 });
    expect((await A.from('user_collectibles').select('copies').eq('def_id', 'monument:great-pyramid').maybeSingle()).data?.copies ?? 0).not.toBe(99);
    await A.from('crate_configs').update({ weights: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 10000 } }).eq('crate', 'monument');
    expect((await A.rpc('crate_status', { p_crate: 'monument' })).data[0].weights.mythic).toBe(100);
    expect((await B.from('user_collectibles').select('def_id').eq('user_id', aId)).data).toEqual([]);
  });

  it('placements: only owned monuments, only on your own map, invisible to others', async () => {
    const { data: owned } = await A.from('user_collectibles').select('def_id').like('def_id', 'monument:%').limit(1).single();
    const { data: aMap } = await A.from('maps').select('id').limit(1).single();
    const { data: bMap } = await B.from('maps').select('id').limit(1).single();
    const { data: placed, error } = await A.from('monument_placements').insert({ map_id: aMap!.id, def_id: owned!.def_id, latitude: 38.62, longitude: -90.18, rotation_deg: 30, scale: 1.2 }).select('id').single();
    expect(error).toBeNull();
    cleanup.push(() => A.from('monument_placements').delete().eq('id', placed!.id));
    expect((await A.from('monument_placements').insert({ map_id: bMap!.id, def_id: owned!.def_id, latitude: 1, longitude: 1 })).error?.message).toMatch(/row-level security/);
    const notOwned = (await A.from('collectible_defs').select('id').like('id', 'monument:%')).data!.map((d) => d.id)
      .find((id) => id !== owned!.def_id && id !== 'monument:great-pyramid');
    const { data: mine } = await A.from('user_collectibles').select('def_id');
    if (!mine!.some((m) => m.def_id === notOwned)) {
      expect((await A.from('monument_placements').insert({ map_id: aMap!.id, def_id: notOwned, latitude: 1, longitude: 1 })).error?.message).toMatch(/row-level security/);
    }
    expect((await B.from('monument_placements').select('id').eq('id', placed!.id)).data).toEqual([]);
    await B.from('monument_placements').delete().eq('id', placed!.id);
    expect((await A.from('monument_placements').select('id').eq('id', placed!.id)).data).toHaveLength(1);
  });
});
