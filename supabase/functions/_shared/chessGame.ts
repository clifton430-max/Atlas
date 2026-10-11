/**
 * Chess game rules wrapper shared by the client (local games, UI hints) and
 * the `chess-move` Edge Function (the AUTHORITY for online games). The rules
 * engine (chess.js) is injected so both sides run the same version.
 *
 * Game-ending rules:
 *   automatic: checkmate, stalemate, insufficient material
 *   claimable: threefold repetition, fifty-move rule (a player may claim)
 *   by player: resignation, draw by agreement
 */
export interface ChessLike {
  move(m: { from: string; to: string; promotion?: string } | string): { san: string; from: string; to: string; promotion?: string } | null;
  fen(): string;
  turn(): 'w' | 'b';
  isCheckmate(): boolean;
  isStalemate(): boolean;
  isInsufficientMaterial(): boolean;
  isThreefoldRepetition(): boolean;
  isDrawByFiftyMoves(): boolean;
  inCheck(): boolean;
  history(): string[];
}
export type ChessCtor = new (fen?: string) => ChessLike;

export type Termination = 'checkmate' | 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move' | 'resignation' | 'draw_agreement';
export type Result = '1-0' | '0-1' | '1/2-1/2';
export interface Outcome { result: Result; termination: Termination }

const SQUARE = /^[a-h][1-8]$/;
const PROMO = /^[qrbn]$/;

/** Rebuild a game from its SAN move list (keeps repetition history). Throws if any stored move is illegal. */
export function replay(Chess: ChessCtor, sans: string[]): ChessLike {
  const g = new Chess();
  for (const san of sans) {
    let ok: boolean;
    try { ok = !!g.move(san); } catch { ok = false; }
    if (!ok) throw new Error(`stored move is illegal: ${san}`);
  }
  return g;
}

/** Automatic game end after a move, if any. */
export function automaticOutcome(g: ChessLike): Outcome | null {
  if (g.isCheckmate()) return { result: g.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  if (g.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (g.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient_material' };
  return null;
}

/** A claimable draw in the current position, if any. */
export function claimableDraw(g: ChessLike): Termination | null {
  if (g.isThreefoldRepetition()) return 'threefold_repetition';
  if (g.isDrawByFiftyMoves()) return 'fifty_move';
  return null;
}

export interface MoveInput { from: string; to: string; promotion?: string }
export function parseMoveInput(m: unknown): MoveInput | null {
  const o = m as Record<string, unknown> | null;
  if (!o || typeof o.from !== 'string' || typeof o.to !== 'string' || !SQUARE.test(o.from) || !SQUARE.test(o.to)) return null;
  if (o.promotion !== undefined && (typeof o.promotion !== 'string' || !PROMO.test(o.promotion))) return null;
  return { from: o.from, to: o.to, ...(o.promotion ? { promotion: o.promotion as string } : {}) };
}

/** Try a move; returns the SAN or null when illegal (chess.js v1 throws on illegal moves). */
export function tryMove(g: ChessLike, m: MoveInput): string | null {
  try {
    return g.move(m)?.san ?? null;
  } catch {
    return null;
  }
}

export const TERMINATION_LABEL: Record<Termination, string> = {
  checkmate: 'Checkmate', stalemate: 'Stalemate', insufficient_material: 'Draw — insufficient material',
  threefold_repetition: 'Draw — threefold repetition', fifty_move: 'Draw — fifty-move rule',
  resignation: 'Resignation', draw_agreement: 'Draw by agreement',
};
