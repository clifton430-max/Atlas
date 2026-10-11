/**
 * Online chess authorization (migration 0016). Rule validation itself lives in
 * the chess-move Edge Function (tests/unit/chess.test.ts covers the rules);
 * here we prove clients can't forge games, moves or results.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

let t: TestDb;
let alice: string; let bob: string; let carol: string;

async function befriend(a: string, b: string) {
  await t.as(a);
  const { send_friend_request: id } = await t.one<{ send_friend_request: string }>(`select public.send_friend_request($1)`, [b]);
  await t.as(b);
  await t.query(`select public.respond_friend_request($1, true)`, [id]);
}
const asService = async () => { await t.asAdmin(); await t.db.exec('set role service_role'); };

beforeEach(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice'); bob = await t.createUser('bob'); carol = await t.createUser('carol');
  await befriend(alice, bob);
});

describe('online chess', () => {
  it('only friends/collaborators can be challenged; only the challenged player responds', async () => {
    await t.as(alice);
    expect(await t.fails(`select public.create_chess_challenge($1)`, [carol])).toMatch(/only challenge friends/);
    expect(await t.query(`select id from public.chess_opponents()`)).toEqual([{ id: bob }]);
    const { create_chess_challenge: g } = await t.one<{ create_chess_challenge: string }>(`select public.create_chess_challenge($1, 'white', 'osm:node/9209122821')`, [bob]);
    expect(await t.fails(`select public.respond_chess_challenge($1, true)`, [g])).toMatch(/challenged player/);
    await t.as(carol);
    expect(await t.fails(`select public.respond_chess_challenge($1, true)`, [g])).toMatch(/not found/);
    expect(await t.query(`select id from public.chess_games`)).toEqual([]);
    await t.as(bob);
    expect((await t.one<{ kind: string }>(`select kind from public.notifications`)).kind).toBe('chess_challenge');
    await t.query(`select public.respond_chess_challenge($1, true)`, [g]);
    expect(await t.one(`select status, white_id = $2 as alice_white from public.chess_games where id = $1`, [g, alice])).toEqual({ status: 'active', alice_white: true });
  });

  it('clients cannot write games or moves, claim wins, or call the move authority', async () => {
    await t.as(alice);
    const { create_chess_challenge: g } = await t.one<{ create_chess_challenge: string }>(`select public.create_chess_challenge($1, 'white')`, [bob]);
    await t.as(bob);
    await t.query(`select public.respond_chess_challenge($1, true)`, [g]);
    expect(await t.fails(`update public.chess_games set result = '0-1', status = 'finished' where id = $1`, [g])).toMatch(/permission denied/);
    expect(await t.fails(`insert into public.chess_moves (game_id, ply, san, uci, fen_after, played_by) values ($1, 1, 'e4', 'e2e4', 'x', $2)`, [g, bob])).toMatch(/permission denied/);
    expect(await t.fails(`select public.apply_chess_move($1, $2, 0, 'e4', 'e2e4', 'x')`, [g, bob])).toMatch(/permission denied/);
    expect(await t.fails(`select public.finish_chess_game($1, $2, 0, '0-1', 'checkmate')`, [g, bob])).toMatch(/permission denied/);
  });

  it('the move authority enforces turn order and optimistic concurrency', async () => {
    await t.as(alice);
    const { create_chess_challenge: g } = await t.one<{ create_chess_challenge: string }>(`select public.create_chess_challenge($1, 'white')`, [bob]);
    await t.as(bob);
    await t.query(`select public.respond_chess_challenge($1, true)`, [g]);
    await asService();
    const fen1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(await t.fails(`select public.apply_chess_move($1, $2, 0, 'e5', 'e7e5', 'x')`, [g, bob])).toMatch(/your turn/); // black can't start
    expect((await t.one<{ apply_chess_move: number }>(`select public.apply_chess_move($1, $2, 0, 'e4', 'e2e4', $3)`, [g, alice, fen1])).apply_chess_move).toBe(1);
    expect(await t.fails(`select public.apply_chess_move($1, $2, 0, 'd4', 'd2d4', 'x')`, [g, alice])).toMatch(/moved on/); // stale / double submit
    expect(await t.fails(`select public.apply_chess_move($1, $2, 1, 'd4', 'd2d4', 'x')`, [g, alice])).toMatch(/your turn/); // white twice
    await t.as(bob);
    expect(await t.query(`select ply, san from public.chess_moves where game_id = $1`, [g])).toEqual([{ ply: 1, san: 'e4' }]);
    expect((await t.query<{ kind: string }>(`select kind from public.notifications order by created_at`)).map((n) => n.kind)).toContain('chess_your_turn');
    await t.as(carol);
    expect(await t.query(`select * from public.chess_moves where game_id = $1`, [g])).toEqual([]);
  });

  it('resignation and draw by agreement', async () => {
    await t.as(alice);
    const { create_chess_challenge: g } = await t.one<{ create_chess_challenge: string }>(`select public.create_chess_challenge($1, 'black')`, [bob]);
    await t.as(bob);
    await t.query(`select public.respond_chess_challenge($1, true)`, [g]);
    expect((await t.one<{ offer_or_accept_draw: string }>(`select public.offer_or_accept_draw($1)`, [g])).offer_or_accept_draw).toBe('offered');
    await t.as(alice);
    expect((await t.one<{ offer_or_accept_draw: string }>(`select public.offer_or_accept_draw($1)`, [g])).offer_or_accept_draw).toBe('drawn');
    expect(await t.one(`select result, termination from public.chess_games where id = $1`, [g])).toEqual({ result: '1/2-1/2', termination: 'draw_agreement' });
    expect(await t.fails(`select public.resign_chess_game($1)`, [g])).toMatch(/in progress/);
    const { create_chess_challenge: g2 } = await t.one<{ create_chess_challenge: string }>(`select public.create_chess_challenge($1, 'black')`, [bob]);
    await t.as(bob);
    await t.query(`select public.respond_chess_challenge($1, true)`, [g2]);
    await t.as(alice); // alice is black
    await t.query(`select public.resign_chess_game($1)`, [g2]);
    expect(await t.one(`select result from public.chess_games where id = $1`, [g2])).toEqual({ result: '1-0' });
  });
});
