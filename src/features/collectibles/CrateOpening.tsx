/**
 * Crate opening sequence. The reward is ALREADY decided and saved by the
 * server before any animation starts; the animation only reveals it.
 *
 *   requesting -> opening (lid) -> cycling (fast, then slowing) -> reveal
 *
 * Honest by construction:
 *   - the final frame is always the server's reward;
 *   - while slowing down, the previews cycle only through rewards of the SAME
 *     rarity as the result, so it can never "just miss" a rarer item;
 *   - no forced delay: Skip jumps to the reveal; reduced motion reveals at once.
 * Optional sound (off by default) uses short synthesized tones — no assets.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { MONUMENTS, RARITY, SKINS, type CrateKind, type Rarity } from './catalog';
import { SkinSwatch } from './SkinSwatch';
import type { RollResult } from './api';

const ModelViewer = lazy(() => import('./three/ModelViewer'));
export type Phase = 'idle' | 'requesting' | 'opening' | 'cycling' | 'reveal';

const NOTES: Record<Rarity, number[]> = {
  common: [523], uncommon: [523, 659], rare: [523, 659, 784], epic: [523, 659, 784, 988],
  legendary: [523, 659, 784, 1047, 1319], mythic: [523, 659, 784, 1047, 1319, 1568, 2093],
};
function chime(r: Rarity) {
  try {
    const ctx = new AudioContext();
    NOTES[r].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'triangle';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.09);
      o.stop(ctx.currentTime + i * 0.09 + 0.45);
    });
    setTimeout(() => void ctx.close(), 2000);
  } catch { /* audio unavailable */ }
}

export function useRevealSequence(result: RollResult | null, opts: { skip: boolean; sound: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!result) return;
    if (opts.skip || reduce) { setPhase('reveal'); if (opts.sound) chime(result.rarity); return; }
    setPhase('opening');
    timers.current.push(setTimeout(() => setPhase('cycling'), 550));
    timers.current.push(setTimeout(() => { setPhase('reveal'); if (opts.sound) chime(result.rarity); }, 550 + 2100));
    return () => timers.current.forEach(clearTimeout);
  }, [result, opts.skip, opts.sound, reduce]);
  return { phase, setPhase, skipNow: () => { timers.current.forEach(clearTimeout); setPhase('reveal'); if (result && opts.sound) chime(result.rarity); } };
}

/** Treasure chest (SVG) with an opening lid and rarity glow. */
export function Chest({ phase, crate, glow }: { phase: Phase; crate: CrateKind; glow?: string }) {
  const open = phase === 'opening' || phase === 'cycling' || phase === 'reveal';
  const wood = crate === 'monument' ? '#8a5a2b' : '#3f4f86';
  const dark = crate === 'monument' ? '#5e3a17' : '#2a3563';
  return (
    <svg viewBox="0 0 200 160" className={cn('h-40 w-48 drop-shadow-xl', phase === 'requesting' && 'motion-safe:animate-[atlas-shake_0.5s_ease-in-out_infinite]')} aria-hidden>
      {open && glow && <ellipse cx="100" cy="78" rx="70" ry="40" fill={glow} opacity="0.55" className="motion-safe:animate-pulse" />}
      <rect x="30" y="78" width="140" height="64" rx="8" fill={wood} />
      <rect x="30" y="98" width="140" height="8" fill={dark} />
      <rect x="92" y="88" width="16" height="22" rx="3" fill="#d4af37" />
      <circle cx="100" cy="99" r="3" fill={dark} />
      <g style={{ transformOrigin: '100px 78px', transform: open ? 'rotateX(0deg) translateY(-30px) rotate(-12deg)' : 'none', transition: 'transform 500ms cubic-bezier(0.3,1.4,0.5,1)' }}>
        <path d="M30 78 Q30 40 100 40 Q170 40 170 78 Z" fill={wood} />
        <path d="M30 78 Q30 58 100 58 Q170 58 170 78" fill="none" stroke={dark} strokeWidth="6" />
        <rect x="92" y="62" width="16" height="16" rx="3" fill="#d4af37" />
      </g>
      {[40, 160].map((x) => <rect key={x} x={x - 4} y="78" width="8" height="64" fill="#d4af37" opacity="0.85" />)}
    </svg>
  );
}

/** Cycling previews while the (already decided) reward is revealed. */
export function CyclingPreview({ crate, result, phase }: { crate: CrateKind; result: RollResult; phase: Phase }) {
  const items = useMemo(() => (crate === 'monument' ? MONUMENTS : SKINS).map((x) => ({ defId: x.defId, name: x.name, rarity: x.rarity })), [crate]);
  const sameRarity = items.filter((i) => i.rarity === result.rarity);
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (phase !== 'cycling') return;
    let alive = true;
    let delay = 70;
    let step = 0;
    const tick = () => {
      if (!alive) return;
      step++;
      setI((x) => x + 1 + Math.floor(Math.random() * 3));
      if (step > 10) { setSlow(true); delay *= 1.28; }
      if (delay < 600) setTimeout(tick, delay);
    };
    const t = setTimeout(tick, delay);
    return () => { alive = false; clearTimeout(t); };
  }, [phase]);
  const pool = slow ? sameRarity : items;
  const cur = pool[i % pool.length];
  return (
    <div className="flex h-24 w-64 items-center justify-center rounded-2xl bg-white/90 px-4 text-center shadow-panel ring-2" style={{ ['--tw-ring-color' as string]: slow ? RARITY[result.rarity].color : '#e7e5df' }} aria-hidden>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: RARITY[cur.rarity].ink }}>{RARITY[cur.rarity].label}</p>
        <p className="text-base font-semibold">{cur.name}</p>
      </div>
    </div>
  );
}

/** The reveal card: the actual awarded reward (3D model for monuments). */
export function Reveal({ crate, result, children }: { crate: CrateKind; result: RollResult; children?: React.ReactNode }) {
  const r = RARITY[result.rarity];
  const def = crate === 'monument' ? MONUMENTS.find((m) => m.defId === result.defId) : SKINS.find((s) => s.defId === result.defId);
  return (
    <div className={cn('relative w-full max-w-md overflow-hidden rounded-3xl p-5 text-center shadow-float animate-rise-in', result.rarity === 'mythic' && 'atlas-mythic')}
      style={{ background: `linear-gradient(180deg, ${r.soft}, #ffffff 65%)`, boxShadow: `0 0 0 3px ${r.color}, 0 24px 60px ${r.color}55` }} data-testid="crate-reveal" data-rarity={result.rarity}>
      {(result.rarity === 'legendary' || result.rarity === 'mythic') && <div aria-hidden className="atlas-rays pointer-events-none absolute inset-0" style={{ ['--ray' as string]: `${r.color}33` }} />}
      <p className="relative text-xs font-bold uppercase tracking-[0.2em]" style={{ color: r.ink }}>{r.label}</p>
      <h3 className="relative mt-1 text-2xl font-semibold tracking-tight">{def?.name}</h3>
      <div className="relative mt-3">
        {crate === 'monument' ? (
          <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-white/60" />}>
            <ModelViewer defId={result.defId} label={def?.name ?? 'Monument'} glow={r.color} className="h-56 w-full" />
          </Suspense>
        ) : <SkinSwatch defId={result.defId} className="mx-auto h-40 w-full max-w-xs" />}
      </div>
      <p className="relative mt-2 text-sm" role="status">
        {result.duplicate ? <>Duplicate — you now have <span className="font-semibold">{result.copies}</span> copies.</> : <>New to your collection!</>}
      </p>
      {children && <div className="relative mt-3 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
