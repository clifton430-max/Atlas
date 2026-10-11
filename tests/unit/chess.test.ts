import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { automaticOutcome, claimableDraw, parseMoveInput, replay, tryMove, type ChessCtor } from '../../supabase/functions/_shared/chessGame';

const C = Chess as unknown as ChessCtor;
const play = (sans: string[]) => replay(C, sans);

describe('chess rules (engine used by local and online games)', () => {
  it('rejects illegal moves and wrong turns', () => {
    const g = play([]);
    expect(tryMove(g, { from: 'e2', to: 'e5' })).toBeNull(); // pawn can't jump 3
    expect(tryMove(g, { from: 'e7', to: 'e5' })).toBeNull(); // black can't move first
    expect(tryMove(g, { from: 'e2', to: 'e4' })).toBe('e4');
    expect(() => play(['e4', 'e4'])).toThrow(/illegal/);
  });
  it('castling both sides', () => {
    const g = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    expect(tryMove(g, { from: 'e1', to: 'g1' })).toBe('O-O');
    const q = play(['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7']);
    expect(tryMove(q, { from: 'e1', to: 'c1' })).toBe('O-O-O');
    // Can't castle through check / after the king moved.
    const moved = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Ke2', 'Nf6', 'Ke1', 'Ng8']);
    expect(tryMove(moved, { from: 'e1', to: 'g1' })).toBeNull();
  });
  it('en passant', () => {
    const g = play(['e4', 'a6', 'e5', 'd5']);
    expect(tryMove(g, { from: 'e5', to: 'd6' })).toBe('exd6');
    expect(g.fen().split(' ')[0]).not.toContain('3p'); // captured pawn removed
  });
  it('promotion (default and under-promotion)', () => {
    const g = new C('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    expect(tryMove(g, { from: 'a7', to: 'a8', promotion: 'n' })).toBe('a8=N');
    expect(parseMoveInput({ from: 'a7', to: 'a8', promotion: 'k' })).toBeNull();
  });
  it('checkmate and stalemate end the game automatically', () => {
    expect(automaticOutcome(play(['f3', 'e5', 'g4', 'Qh4#']))).toEqual({ result: '0-1', termination: 'checkmate' });
    const stale = new C('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(automaticOutcome(stale)).toEqual({ result: '1/2-1/2', termination: 'stalemate' });
    expect(automaticOutcome(new C('8/8/8/8/8/8/8/K6k w - - 0 1'))).toEqual({ result: '1/2-1/2', termination: 'insufficient_material' });
  });
  it('threefold repetition is claimable', () => {
    const g = play(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(claimableDraw(g)).toBe('threefold_repetition');
    expect(claimableDraw(play(['e4']))).toBeNull();
  });
  it('validates move input shape', () => {
    expect(parseMoveInput({ from: 'e2', to: 'e4' })).toEqual({ from: 'e2', to: 'e4' });
    expect(parseMoveInput({ from: 'z9', to: 'e4' })).toBeNull();
    expect(parseMoveInput('e4')).toBeNull();
  });
});
