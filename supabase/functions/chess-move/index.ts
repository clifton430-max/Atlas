/**
 * Edge Function: chess-move — the AUTHORITY for online chess.
 *
 * POST { gameId, action: "move", expectedPly, move: { from, to, promotion? } }
 * POST { gameId, action: "claim_draw", expectedPly }
 *
 * 1. Verifies the caller's Supabase session (JWT) — anonymous calls are refused.
 * 2. Loads the game + full move list with the service role and REPLAYS it with
 *    chess.js (same version as the client), so repetition history is exact.
 * 3. Validates turn, legality and game-ending conditions on the server.
 * 4. Applies the result through apply_chess_move()/finish_chess_game(), which
 *    lock the row and check `expectedPly` (no conflicting / double moves).
 * Clients never send a FEN, a result or a winner — only the move.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Chess } from 'npm:chess.js@1.4.0';
import { automaticOutcome, claimableDraw, parseMoveInput, replay, tryMove, type ChessCtor } from '../_shared/chessGame.ts';

const cors = {
  'Access-Control-Allow-Origin': (Deno.env.get('ATLAS_ALLOWED_ORIGINS') ?? '*').split(',')[0].trim() || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: who } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!who?.user) return json({ error: 'not_signed_in' }, 401);
  const me = who.user.id;

  const raw = await req.text();
  if (raw.length > 1024) return json({ error: 'too_large' }, 413);
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_request' }, 400); }
  const gameId = String(body.gameId ?? '');
  const expectedPly = Number(body.expectedPly);
  if (!UUID.test(gameId) || !Number.isInteger(expectedPly) || expectedPly < 0) return json({ error: 'invalid_request' }, 400);

  const { data: limited } = await admin.rpc('edge_consume_rate_limit', { p_bucket: `chess:${me}`, p_limit: 120, p_window_seconds: 60 });
  if (limited === false) return json({ error: 'rate_limited' }, 429);

  const { data: game } = await admin.from('chess_games').select('id, white_id, black_id, status, ply').eq('id', gameId).maybeSingle();
  if (!game || (game.white_id !== me && game.black_id !== me)) return json({ error: 'not_found' }, 404);
  if (game.status !== 'active') return json({ error: 'not_active' }, 409);
  if (game.ply !== expectedPly) return json({ error: 'stale', ply: game.ply }, 409);
  const { data: moves } = await admin.from('chess_moves').select('san').eq('game_id', gameId).order('ply');
  let g;
  try { g = replay(Chess as unknown as ChessCtor, (moves ?? []).map((m) => m.san as string)); } catch (e) {
    console.error('[chess-move] corrupt history', gameId, (e as Error).message);
    return json({ error: 'corrupt_game' }, 500);
  }
  const myColor = game.white_id === me ? 'w' : 'b';

  if (body.action === 'claim_draw') {
    const claim = claimableDraw(g);
    if (!claim) return json({ error: 'no_draw_to_claim' }, 422);
    const { error } = await admin.rpc('finish_chess_game', { p_game_id: gameId, p_player: me, p_expected_ply: expectedPly, p_result: '1/2-1/2', p_termination: claim });
    return error ? json({ error: error.code === '40001' ? 'stale' : 'failed' }, error.code === '40001' ? 409 : 500) : json({ ok: true, termination: claim });
  }
  if (body.action !== 'move') return json({ error: 'invalid_action' }, 400);
  if (g.turn() !== myColor) return json({ error: 'not_your_turn' }, 409);
  const mv = parseMoveInput(body.move);
  if (!mv) return json({ error: 'invalid_move' }, 400);
  const san = tryMove(g, mv);
  if (!san) return json({ error: 'illegal_move' }, 422);
  const outcome = automaticOutcome(g);
  const uci = `${mv.from}${mv.to}${mv.promotion ?? ''}`;
  const { data: ply, error } = await admin.rpc('apply_chess_move', {
    p_game_id: gameId, p_player: me, p_expected_ply: expectedPly, p_san: san, p_uci: uci, p_fen_after: g.fen(),
    p_result: outcome?.result ?? null, p_termination: outcome?.termination ?? null,
  });
  if (error) return json({ error: error.code === '40001' ? 'stale' : error.code === '42501' ? 'not_your_turn' : 'failed' }, error.code === '40001' || error.code === '42501' ? 409 : 500);
  return json({ ok: true, ply, san, fen: g.fen(), outcome, claimable: claimableDraw(g) });
});
