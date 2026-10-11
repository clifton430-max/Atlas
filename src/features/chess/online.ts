/**
 * Online chess client. Reads games/moves through RLS; challenges, responses,
 * resignation and draw offers are RPCs; moves and draw claims go to the
 * `chess-move` Edge Function, which validates them with the rules engine.
 * Realtime only signals "something changed" — the client then refetches the
 * authoritative state, so refresh / reconnect always resume correctly.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase, unwrap } from '@/lib/supabase';
import { useAuth } from '@/app/AuthProvider';
import type { Outcome, Result, Termination } from '../../../supabase/functions/_shared/chessGame';

export type GameStatus = 'invited' | 'active' | 'finished' | 'declined' | 'cancelled';
export interface Player { id: string; name: string }
export interface OnlineGame {
  id: string; white: Player; black: Player; createdBy: string; status: GameStatus; fen: string; ply: number;
  result: Result | null; termination: Termination | null; drawOfferedBy: string | null; venueRef: string | null; updatedAt: string;
}
export interface GameMove { ply: number; san: string; uci: string }

type Row = Record<string, unknown>;
const name = (p: Row | null) => (p ? String(p.display_name || p.username) : 'Former player');
const SELECT = `id, white_id, black_id, created_by, status, fen, ply, result, termination, draw_offered_by, venue_ref, updated_at,
  white:profiles!chess_games_white_id_fkey(username, display_name), black:profiles!chess_games_black_id_fkey(username, display_name)`;
const toGame = (r: Row): OnlineGame => ({
  id: String(r.id), white: { id: String(r.white_id), name: name(r.white as Row) }, black: { id: String(r.black_id), name: name(r.black as Row) },
  createdBy: String(r.created_by), status: r.status as GameStatus, fen: String(r.fen), ply: Number(r.ply),
  result: (r.result as Result) ?? null, termination: (r.termination as Termination) ?? null,
  drawOfferedBy: (r.draw_offered_by as string) ?? null, venueRef: (r.venue_ref as string) ?? null, updatedAt: String(r.updated_at),
});

export const gamesKey = ['chess', 'games'] as const;
export const gameKey = (id: string) => ['chess', 'game', id] as const;

export function useMyGames() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user || !supabase) return;
    const sb = supabase;
    const refetch = () => void qc.invalidateQueries({ queryKey: ['chess'] });
    // Two filtered subscriptions: games where I'm white, and where I'm black.
    const ch = sb.channel(`chess-games:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chess_games', filter: `white_id=eq.${user.id}` }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chess_games', filter: `black_id=eq.${user.id}` }, refetch)
      .subscribe((s) => { if (s === 'SUBSCRIBED') refetch(); });
    return () => { void sb.removeChannel(ch); };
  }, [user, qc]);
  return useQuery({
    queryKey: gamesKey,
    enabled: !!user,
    queryFn: async () => (unwrap(await requireSupabase().from('chess_games').select(SELECT).order('updated_at', { ascending: false }).limit(30)) as Row[]).map(toGame),
  });
}

export function useGame(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id || !supabase) return;
    const sb = supabase;
    const refetch = () => void qc.invalidateQueries({ queryKey: gameKey(id) });
    const ch = sb.channel(`chess-game:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chess_games', filter: `id=eq.${id}` }, refetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chess_moves', filter: `game_id=eq.${id}` }, refetch)
      .subscribe((s) => { if (s === 'SUBSCRIBED') refetch(); }); // also resyncs after reconnects
    return () => { void sb.removeChannel(ch); };
  }, [id, qc]);
  return useQuery({
    queryKey: gameKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const sb = requireSupabase();
      const [g, m] = await Promise.all([
        sb.from('chess_games').select(SELECT).eq('id', id!).maybeSingle(),
        sb.from('chess_moves').select('ply, san, uci').eq('game_id', id!).order('ply'),
      ]);
      const row = unwrap(g) as Row | null;
      return row ? { game: toGame(row), moves: (unwrap(m) as Row[]).map((x) => ({ ply: Number(x.ply), san: String(x.san), uci: String(x.uci) })) } : null;
    },
  });
}

export function useOpponents(enabled: boolean) {
  return useQuery({
    queryKey: ['chess', 'opponents'],
    enabled,
    queryFn: async () => (unwrap(await requireSupabase().rpc('chess_opponents')) as Row[]).map((r) => ({ id: String(r.id), name: String(r.display_name || r.username) })),
  });
}

const MOVE_ERRORS: Record<string, string> = {
  illegal_move: 'That move isn’t legal.', not_your_turn: 'It isn’t your turn.', stale: 'The game moved on — showing the latest position.',
  not_active: 'This game isn’t in progress.', no_draw_to_claim: 'There’s no threefold repetition or fifty-move draw to claim.',
  rate_limited: 'Too many requests — wait a moment.', not_signed_in: 'Sign in to play online.',
};
export class ChessMoveError extends Error {}

async function callAuthority(body: Record<string, unknown>) {
  const { data, error } = await requireSupabase().functions.invoke<{ ok: boolean; outcome?: Outcome | null }>('chess-move', { body, timeout: 15_000 });
  if (error || !data?.ok) {
    let code = '';
    try { code = ((await (error as { context?: Response })?.context?.json()) as { error?: string })?.error ?? ''; } catch { /* not json */ }
    throw new ChessMoveError(MOVE_ERRORS[code] ?? 'The move couldn’t be sent. Check your connection and try again.');
  }
  return data;
}

export function useChessActions(gameId?: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['chess'] });
  const rpc = (fn: string) => async (args: Record<string, unknown>) => unwrap(await requireSupabase().rpc(fn as never, args as never));
  return {
    challenge: useMutation({ mutationFn: (a: { opponent: string; color: 'white' | 'black' | 'random'; venueRef: string | null }) =>
      rpc('create_chess_challenge')({ p_opponent: a.opponent, p_color: a.color, p_venue_ref: a.venueRef ?? undefined }) as Promise<string>, onSettled: refresh }),
    respond: useMutation({ mutationFn: (a: { id: string; accept: boolean }) => rpc('respond_chess_challenge')({ p_game_id: a.id, p_accept: a.accept }), onSettled: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => rpc('cancel_chess_challenge')({ p_game_id: id }), onSettled: refresh }),
    resign: useMutation({ mutationFn: (id: string) => rpc('resign_chess_game')({ p_game_id: id }), onSettled: refresh }),
    offerDraw: useMutation({ mutationFn: (id: string) => rpc('offer_or_accept_draw')({ p_game_id: id }) as Promise<string>, onSettled: refresh }),
    declineDraw: useMutation({ mutationFn: (id: string) => rpc('decline_draw')({ p_game_id: id }), onSettled: refresh }),
    move: useMutation({
      mutationFn: (a: { expectedPly: number; move: { from: string; to: string; promotion?: string } }) => callAuthority({ gameId, action: 'move', ...a }),
      onSettled: refresh,
    }),
    claimDraw: useMutation({ mutationFn: (expectedPly: number) => callAuthority({ gameId, action: 'claim_draw', expectedPly }), onSettled: refresh }),
  };
}
