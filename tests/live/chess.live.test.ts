/**
 * LIVE: online chess authority (chess-move Edge Function + RPCs + RLS) and the
 * route function, against the linked project with real test accounts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LIVE, liveConfigured, signedIn } from './env';

const RUN = Date.now().toString(36);
const cleanup: (() => PromiseLike<unknown>)[] = [];
let A: SupabaseClient, B: SupabaseClient, C: SupabaseClient;
let aId: string, bId: string;

async function call(c: SupabaseClient | null, body: unknown) {
  const token = c ? (await c.auth.getSession()).data.session!.access_token : LIVE.anonKey;
  const res = await fetch(`${LIVE.url}/functions/v1/chess-move`, {
    method: 'POST', headers: { apikey: LIVE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

describe.skipIf(!liveConfigured)('online chess (live)', () => {
  beforeAll(async () => {
    ({ client: A, userId: aId } = await signedIn('A'));
    ({ client: B, userId: bId } = await signedIn('B'));
    ({ client: C } = await signedIn('C'));
    // A and B share a collaboration map, which makes them eligible opponents.
    const map = (await A.rpc('create_collab_map', { p_name: `Chess ${RUN}` })).data as string;
    cleanup.push(() => A.from('collab_maps').delete().eq('id', map));
    const inv = (await A.rpc('create_collab_invitation', { p_map_id: map, p_role: 'viewer', p_expires_in_hours: 1 })).data[0];
    await B.rpc('accept_collab_invitation', { p_token: inv.token });
  });
  afterAll(async () => { for (const fn of cleanup.reverse()) await Promise.resolve(fn()).catch(() => undefined); });

  it('validates every move on the server and finishes on checkmate', async () => {
    const { data: gameId, error } = await A.rpc('create_chess_challenge', { p_opponent: bId, p_color: 'white', p_venue_ref: 'osm:node/9209122821' });
    expect(error).toBeNull();
    cleanup.push(() => A.rpc('resign_chess_game', { p_game_id: gameId }));
    expect((await call(A, { gameId, action: 'move', expectedPly: 0, move: { from: 'e2', to: 'e4' } })).body.error).toBe('not_active'); // not accepted yet
    await B.rpc('respond_chess_challenge', { p_game_id: gameId, p_accept: true });

    expect((await call(null, { gameId, action: 'move', expectedPly: 0, move: { from: 'f2', to: 'f3' } })).status).toBe(401);
    expect((await call(C, { gameId, action: 'move', expectedPly: 0, move: { from: 'f2', to: 'f3' } })).status).toBe(404);
    expect((await call(B, { gameId, action: 'move', expectedPly: 0, move: { from: 'e7', to: 'e5' } })).body.error).toBe('not_your_turn');
    expect((await call(A, { gameId, action: 'move', expectedPly: 0, move: { from: 'e2', to: 'e5' } })).body.error).toBe('illegal_move');
    expect((await call(A, { gameId, action: 'move', expectedPly: 0, move: { from: 'f2', to: 'f3' } })).body).toMatchObject({ ok: true, ply: 1, san: 'f3' });
    expect((await call(A, { gameId, action: 'move', expectedPly: 0, move: { from: 'g2', to: 'g4' } })).body.error).toBe('stale'); // double submit
    expect((await call(B, { gameId, action: 'move', expectedPly: 1, move: { from: 'e7', to: 'e5' } })).body.ok).toBe(true);
    expect((await call(B, { gameId, action: 'claim_draw', expectedPly: 2 })).body.error).toBe('no_draw_to_claim');
    expect((await call(A, { gameId, action: 'move', expectedPly: 2, move: { from: 'g2', to: 'g4' } })).body.ok).toBe(true);
    const mate = await call(B, { gameId, action: 'move', expectedPly: 3, move: { from: 'd8', to: 'h4' } });
    expect(mate.body).toMatchObject({ ok: true, san: 'Qh4#', outcome: { result: '0-1', termination: 'checkmate' } });

    const { data: g } = await A.from('chess_games').select('status, result, termination, ply').eq('id', gameId).single();
    expect(g).toEqual({ status: 'finished', result: '0-1', termination: 'checkmate', ply: 4 });
    expect((await A.from('chess_moves').select('san').eq('game_id', gameId).order('ply')).data!.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    // Clients can't forge results or read others' games.
    await A.from('chess_games').update({ result: '1-0' }).eq('id', gameId);
    expect((await A.from('chess_games').select('result').eq('id', gameId).single()).data!.result).toBe('0-1');
    expect((await C.from('chess_games').select('id').eq('id', gameId)).data).toEqual([]);
    expect((await call(A, { gameId, action: 'move', expectedPly: 4, move: { from: 'a2', to: 'a3' } })).body.error).toBe('not_active');
  });

  it('strangers cannot be challenged', async () => {
    const { data: me } = await C.auth.getUser();
    expect((await A.rpc('create_chess_challenge', { p_opponent: me.user!.id })).error?.message).toMatch(/only challenge friends/);
    void aId;
  });
});

describe.skipIf(!liveConfigured)('route function (live)', () => {
  it('returns real network distance/time, and reports unreachable or invalid requests honestly', async () => {
    const post = (body: unknown) => fetch(`${LIVE.url}/functions/v1/route`, { method: 'POST', headers: { apikey: LIVE.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ok = await post({ from: { lat: 38.6448, lng: -90.2615 }, to: { lat: 38.627, lng: -90.1994 }, mode: 'driving' });
    const r = await ok.json();
    expect(ok.status).toBe(200);
    expect(r.distanceMeters).toBeGreaterThan(5000); // further than the 5.6 km straight line
    expect(r.durationSeconds).toBeGreaterThan(0);
    expect(r.geometry.length).toBeGreaterThan(1);
    expect((await post({ from: { lat: 38.6, lng: -90.2 }, to: { lat: 48.85, lng: 2.35 }, mode: 'walking' })).status).toBe(400);
    expect((await post({ mode: 'walking' })).status).toBe(400);
  });
});
