/**
 * Accessible chessboard. Legality comes from the rules engine (chess.js):
 * only legal destinations can be chosen; promotion asks for a piece.
 *
 * Input: click/tap a piece then a highlighted square, or use the keyboard —
 * arrow keys move between squares, Enter/Space selects and moves, Escape
 * clears the selection. Every square has a spoken label ("e4, white knight").
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Chess, type Square } from 'chess.js';
import { cn } from '@/components/ui/cn';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const GLYPH: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

export interface BoardMove { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }

export function ChessBoard({ fen, orientation, canMove, onMove, lastMove, label }: {
  fen: string;
  orientation: 'w' | 'b';
  /** Whether the side to move may be moved by this viewer right now. */
  canMove: boolean;
  onMove: (m: BoardMove) => void;
  lastMove?: { from: string; to: string } | null;
  label: string;
}) {
  const game = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string>(orientation === 'w' ? 'e2' : 'e7');
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const targets = useMemo(() => {
    if (!selected || !canMove) return new Map<string, boolean>();
    return new Map(game.moves({ square: selected as Square, verbose: true }).map((m) => [m.to, !!m.captured]));
  }, [game, selected, canMove]);
  const turn = game.turn();
  const checkSquare = game.inCheck()
    ? game.board().flat().find((p) => p && p.type === 'k' && p.color === turn)?.square ?? null : null;

  const rows = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const cols = orientation === 'w' ? FILES : [...FILES].reverse();

  const activate = (sq: string) => {
    if (!canMove) return;
    const piece = game.get(sq as Square);
    if (selected && targets.has(sq)) {
      const isPromotion = game.get(selected as Square)?.type === 'p' && (sq[1] === '8' || sq[1] === '1');
      if (isPromotion) { setPromo({ from: selected, to: sq }); return; }
      onMove({ from: selected, to: sq });
      setSelected(null);
      return;
    }
    if (piece && piece.color === turn) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const onKey = (e: KeyboardEvent, sq: string) => {
    const fi = cols.indexOf(sq[0]);
    const ri = rows.indexOf(Number(sq[1]));
    const go = (df: number, dr: number) => {
      const nf = cols[Math.min(7, Math.max(0, fi + df))];
      const nr = rows[Math.min(7, Math.max(0, ri + dr))];
      const next = `${nf}${nr}`;
      setFocus(next);
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)?.focus();
      e.preventDefault();
    };
    if (e.key === 'ArrowRight') go(1, 0);
    else if (e.key === 'ArrowLeft') go(-1, 0);
    else if (e.key === 'ArrowDown') go(0, 1);
    else if (e.key === 'ArrowUp') go(0, -1);
    else if (e.key === 'Escape') setSelected(null);
  };

  return (
    <div className="relative w-full max-w-[min(560px,100%)]">
      <div ref={gridRef} role="grid" aria-label={label} className="grid aspect-square grid-cols-8 overflow-hidden rounded-xl shadow-float ring-4 ring-[#5b4632]">
        {rows.map((r) => (
          <div key={r} role="row" className="contents">
          {cols.map((f) => {
          const sq = `${f}${r}`;
          const p = game.get(sq as Square);
          const dark = (FILES.indexOf(f) + r) % 2 === 1;
          const isTarget = targets.has(sq);
          const name = p ? `${p.color === 'w' ? 'white' : 'black'} ${NAMES[p.type]}` : 'empty';
          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              data-square={sq}
              tabIndex={focus === sq ? 0 : -1}
              aria-label={`${sq}, ${name}${selected === sq ? ', selected' : ''}${isTarget ? ', legal move' : ''}`}
              aria-selected={selected === sq}
              onFocus={() => setFocus(sq)}
              onKeyDown={(e) => onKey(e, sq)}
              onClick={() => activate(sq)}
              className={cn('relative grid select-none place-items-center text-[clamp(22px,5.4vw,44px)] leading-none focus-visible:z-10 focus-visible:outline-4 focus-visible:-outline-offset-4',
                dark ? 'bg-[#b58863]' : 'bg-[#f0d9b5]',
                (lastMove?.from === sq || lastMove?.to === sq) && (dark ? 'bg-[#aaa23a]' : 'bg-[#cdd26a]'),
                selected === sq && 'shadow-[inset_0_0_0_4px_#4f7a28]',
                checkSquare === sq && 'bg-[radial-gradient(circle,#ef4444_0%,#ef444466_45%,transparent_70%)]')}
            >
              {p && (
                <span aria-hidden className={cn('drop-shadow-[0_2px_1px_rgba(0,0,0,0.35)]', p.color === 'w' ? 'text-white [-webkit-text-stroke:1.5px_#2b2118]' : 'text-[#1b1511]')}>
                  {GLYPH[p.type]}
                </span>
              )}
              {isTarget && (
                targets.get(sq)
                  ? <span aria-hidden className="pointer-events-none absolute inset-1 rounded-full ring-4 ring-black/25" />
                  : <span aria-hidden className="pointer-events-none absolute size-[28%] rounded-full bg-black/25" />
              )}
              {f === cols[0] && <span aria-hidden className={cn('absolute left-0.5 top-0.5 text-[10px] font-semibold', dark ? 'text-[#f0d9b5]' : 'text-[#b58863]')}>{r}</span>}
              {r === rows[7] && <span aria-hidden className={cn('absolute bottom-0.5 right-1 text-[10px] font-semibold', dark ? 'text-[#f0d9b5]' : 'text-[#b58863]')}>{f}</span>}
            </button>
          );
          })}
          </div>
        ))}
      </div>
      {promo && (
        <div role="dialog" aria-label="Choose promotion piece" className="absolute inset-0 grid place-items-center rounded-xl bg-black/40">
          <div className="flex gap-2 rounded-2xl bg-white p-3 shadow-float">
            {(['q', 'r', 'b', 'n'] as const).map((t) => (
              <button key={t} type="button" autoFocus={t === 'q'} aria-label={`Promote to ${NAMES[t]}`}
                className="grid size-14 place-items-center rounded-xl text-4xl ring-1 ring-line hover:bg-canvas"
                onClick={() => { onMove({ ...promo, promotion: t }); setPromo(null); setSelected(null); }}>
                <span className={turn === 'w' ? 'text-white [-webkit-text-stroke:1.5px_#2b2118]' : 'text-[#1b1511]'}>{GLYPH[t]}</span>
              </button>
            ))}
            <button type="button" className="px-2 text-xs underline" onClick={() => setPromo(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
