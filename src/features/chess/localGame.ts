/**
 * Local two-player games (same device). Stored only in this browser
 * (localStorage) as the SAN move list so a game survives refresh and works
 * offline once the app has loaded. Never uploaded.
 */
import { Chess } from 'chess.js';
import { automaticOutcome, claimableDraw, replay, tryMove, type ChessCtor, type MoveInput, type Outcome } from '../../../supabase/functions/_shared/chessGame';

import { LOCAL_CHESS_KEY as KEY } from './localMoves';
export interface LocalChess { moves: string[]; outcome: Outcome | null; startedAt: string }

export const newLocalGame = (): LocalChess => ({ moves: [], outcome: null, startedAt: new Date().toISOString() });

export function loadLocalGame(): LocalChess {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && Array.isArray(raw.moves) && raw.moves.every((m: unknown) => typeof m === 'string')) {
      const g = replay(Chess as unknown as ChessCtor, raw.moves); // validates every stored move
      return { moves: raw.moves, outcome: raw.outcome ?? automaticOutcome(g), startedAt: String(raw.startedAt ?? new Date().toISOString()) };
    }
  } catch { /* corrupt -> new game */ }
  return newLocalGame();
}

export function saveLocalGame(g: LocalChess) {
  try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* storage blocked: game still works in memory */ }
}

export function gameFrom(moves: string[]) {
  return replay(Chess as unknown as ChessCtor, moves) as unknown as Chess;
}

/** Apply a move; returns the next state or null if illegal. */
export function playLocal(state: LocalChess, m: MoveInput): LocalChess | null {
  if (state.outcome) return null;
  const g = gameFrom(state.moves);
  const san = tryMove(g as never, m);
  if (!san) return null;
  return { ...state, moves: [...state.moves, san], outcome: automaticOutcome(g as never) };
}

export function claimLocalDraw(state: LocalChess): LocalChess | null {
  const t = claimableDraw(gameFrom(state.moves) as never);
  return t ? { ...state, outcome: { result: '1/2-1/2', termination: t } } : null;
}

/** A local game from a shared position link; null if any move is illegal. */
export function importLocalGame(sans: string[]): LocalChess | null {
  try {
    const g = gameFrom(sans);
    return { moves: sans, outcome: automaticOutcome(g as never), startedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
