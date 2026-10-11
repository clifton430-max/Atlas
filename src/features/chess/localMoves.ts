/**
 * The saved local game's moves WITHOUT loading the chess engine (for the
 * Share menu, which is in the main bundle). Shape-checked only; the moves are
 * validated by replay when a shared position is opened.
 */
export const LOCAL_CHESS_KEY = 'atlas.chess.local.v1';

export function readLocalMoves(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_CHESS_KEY) ?? 'null');
    return raw && Array.isArray(raw.moves) && raw.moves.every((m: unknown) => typeof m === 'string') ? raw.moves : [];
  } catch {
    return [];
  }
}
