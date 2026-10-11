/**
 * Animated atmosphere for skins that have one (aurora, embers, fireflies,
 * sparkles, petals, and the Celestial "heavens"). Pure CSS on a few dozen
 * elements: pointer-events none, below markers and controls, and a still
 * frame under prefers-reduced-motion. Positions are deterministic.
 */
import { useMemo } from 'react';
import type { SkinOverlay } from './skins';

const rnd = (seed: number) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

function Particles({ kind, n, seed }: { kind: 'ember' | 'firefly' | 'star' | 'petal'; n: number; seed: number }) {
  const items = useMemo(() => {
    const r = rnd(seed);
    return Array.from({ length: n }, (_, i) => ({ i, x: r() * 100, y: r() * 100, d: 6 + r() * 10, delay: -r() * 12, s: 0.6 + r() * 0.9 }));
  }, [n, seed]);
  return (
    <>
      {items.map((p) => (
        <span key={p.i} className={`atlas-fx-${kind}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s`, transform: `scale(${p.s})` }} />
      ))}
    </>
  );
}

export function SkinOverlayFx({ overlay }: { overlay: SkinOverlay }) {
  return (
    <div aria-hidden data-testid="skin-overlay" data-overlay={overlay} className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {(overlay === 'aurora' || overlay === 'heavens') && (
        <>
          <div className="atlas-fx-aurora" style={{ ['--a1' as string]: overlay === 'heavens' ? '#f2c94c55' : '#3ef2b855', ['--a2' as string]: '#7a5cff44' }} />
          <div className="atlas-fx-aurora atlas-fx-aurora-2" style={{ ['--a1' as string]: '#38c8ff44', ['--a2' as string]: overlay === 'heavens' ? '#ff9bd244' : '#3ef2b833' }} />
        </>
      )}
      {overlay === 'embers' && <Particles kind="ember" n={26} seed={3} />}
      {overlay === 'fireflies' && <Particles kind="firefly" n={22} seed={5} />}
      {overlay === 'sparkle' && <Particles kind="star" n={34} seed={7} />}
      {overlay === 'petals' && <Particles kind="petal" n={18} seed={11} />}
      {overlay === 'heavens' && (
        <>
          <Particles kind="star" n={46} seed={13} />
          <span className="atlas-fx-shooting" style={{ top: '18%', left: '62%' }} />
          <span className="atlas-fx-shooting" style={{ top: '40%', left: '28%', animationDelay: '-5s' }} />
        </>
      )}
    </div>
  );
}
