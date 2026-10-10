/**
 * "Map animations" pill: on/off (the device-wide preference also in
 * Settings), pause/resume, and playback speed. The motion is decorative —
 * vehicles and walkers follow real mapped roads, rails and paths but are not
 * real-time positions — which the tooltip states. Under prefers-reduced-motion
 * animations stay off and the pill explains why.
 */
import { Pause, Play } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { SPEED_OPTIONS, setAmbientEnabled, setAmbientPlayback, useAmbientEnabled, useAmbientPlayback, useReducedMotion } from './ambient';

export function AnimationsControl({ className }: { className?: string }) {
  const enabled = useAmbientEnabled();
  const reduced = useReducedMotion();
  const { paused, speed } = useAmbientPlayback();
  const on = enabled && !reduced;
  const hint = reduced
    ? 'Animations are off because your system asks for reduced motion.'
    : 'Decorative animation along real mapped roads, rail and paths — not live traffic or transit. Visible when zoomed in.';
  return (
    <div role="group" aria-label="Map animations" title={hint} className={cn('gap-1 pl-2.5', className)}>
      <label className="flex h-9 cursor-pointer items-center gap-2 pr-1 text-xs font-medium text-neutral-800">
        <input type="checkbox" className="peer sr-only" checked={on} disabled={reduced} onChange={(e) => setAmbientEnabled(e.target.checked)} />
        <span aria-hidden className={cn('size-2.5 rounded-full ring-2 ring-offset-1 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent',
          on ? (paused ? 'bg-amber-400 ring-amber-200' : 'bg-emerald-500 ring-emerald-200') : 'bg-neutral-300 ring-neutral-200')} />
        Map animations
      </label>
      <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
      <button type="button" disabled={!on} onClick={() => setAmbientPlayback({ paused: !paused })}
        aria-label={paused ? 'Resume map animations' : 'Pause map animations'} title={paused ? 'Resume' : 'Pause'}
        className="grid size-9 place-items-center rounded-lg text-neutral-700 hover:bg-neutral-100 disabled:opacity-40">
        {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
      </button>
      <button type="button" disabled={!on}
        onClick={() => setAmbientPlayback({ speed: SPEED_OPTIONS[(SPEED_OPTIONS.indexOf(speed as typeof SPEED_OPTIONS[number]) + 1) % SPEED_OPTIONS.length] })}
        aria-label={`Animation speed ${speed}×`} title="Change animation speed"
        className="flex h-9 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-40">
        {speed}×
      </button>
    </div>
  );
}
