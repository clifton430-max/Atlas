/**
 * Settings → Map animations & weather. The single home for every animation
 * preference (the old floating "Map animations" bar was removed):
 *   - ambient map life on/off, pause, speed, and each kind (cars, people,
 *     trains, aircraft);
 *   - weather: Automatic (real conditions), Manual (choose the effect,
 *     never overwritten by live data) or Off, with intensity.
 * All saved on this device and applied immediately.
 */
import { Pause, Play } from 'lucide-react';
import { Switch } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import {
  SPEED_OPTIONS, setAmbientEnabled, setAmbientKinds, setAmbientPlayback, useAmbientEnabled, useAmbientKinds, useAmbientPlayback, useReducedMotion,
  type AmbientKinds,
} from '@/features/places/ambient';
import { setWeatherPrefs, useWeather, WEATHER_KINDS, WEATHER_LABEL, type WeatherMode } from '@/features/weather/weather';

const seg = (on: boolean) => cn('h-8 rounded-lg px-3 text-xs font-semibold', on ? 'bg-white text-neutral-900 shadow-chip ring-1 ring-line' : 'text-neutral-600 hover:text-neutral-900');

const KIND_LABELS: { id: keyof AmbientKinds; label: string; hint: string }[] = [
  { id: 'cars', label: 'Cars, taxis and buses', hint: 'On mapped roads' },
  { id: 'people', label: 'People walking', hint: 'On mapped footpaths and park paths' },
  { id: 'trains', label: 'Trains', hint: 'On mapped surface railways' },
  { id: 'planes', label: 'Aircraft', hint: 'Occasional planes flying over the map — random, not real flights' },
];

export function AnimationsSettings() {
  const enabled = useAmbientEnabled();
  const reduced = useReducedMotion();
  const { paused, speed } = useAmbientPlayback();
  const kinds = useAmbientKinds();
  const { prefs, live } = useWeather();
  const on = enabled && !reduced;

  return (
    <div className="max-w-xl space-y-8">
      <header className="pr-10">
        <h2 className="text-lg font-semibold">Map animations &amp; weather</h2>
        <p className="mt-0.5 text-sm text-neutral-500">Saved on this device and applied right away.</p>
      </header>
      {reduced && <Notice>Your system asks for reduced motion, so moving map life and falling weather are off. Weather shows as a still tint.</Notice>}

      <section aria-labelledby="ambient-h" className="space-y-3">
        <h3 id="ambient-h" className="text-sm font-semibold">Map life</h3>
        <Switch label="Show moving map life" checked={on} disabled={reduced} onChange={setAmbientEnabled}
          description="Miniature vehicles, people, trains and aircraft when zoomed in. They follow real mapped roads, rails and paths, but the motion is decorative — not live traffic, transit or flights." />
        <div className={cn('space-y-3 pl-1', !on && 'pointer-events-none opacity-50')} aria-disabled={!on}>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!on} onClick={() => setAmbientPlayback({ paused: !paused })} aria-pressed={paused}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ring-1 ring-line hover:bg-neutral-50">
              {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}{paused ? 'Resume' : 'Pause'}
            </button>
            <div role="radiogroup" aria-label="Animation speed" className="flex rounded-xl bg-canvas p-1 ring-1 ring-line">
              {SPEED_OPTIONS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={speed === s} disabled={!on} onClick={() => setAmbientPlayback({ speed: s })} className={seg(speed === s)}>{s}×</button>
              ))}
            </div>
          </div>
          {KIND_LABELS.map((k) => (
            <Switch key={k.id} label={k.label} description={k.hint} checked={kinds[k.id]} disabled={!on} onChange={(v) => setAmbientKinds({ [k.id]: v })} />
          ))}
        </div>
      </section>

      <section aria-labelledby="weather-h" className="space-y-3">
        <h3 id="weather-h" className="text-sm font-semibold">Weather</h3>
        <div role="radiogroup" aria-label="Weather mode" className="inline-flex rounded-xl bg-canvas p-1 ring-1 ring-line">
          {([['auto', 'Automatic'], ['manual', 'Manual'], ['off', 'Off']] as [WeatherMode, string][]).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={prefs.mode === id} onClick={() => setWeatherPrefs({ mode: id })} className={seg(prefs.mode === id)}>{label}</button>
          ))}
        </div>
        <p className="text-xs text-neutral-600" aria-live="polite">
          {prefs.mode === 'auto' && (live.isError
            ? `Live weather is unavailable right now (${live.error instanceof Error ? live.error.message : 'unknown error'}). No weather effect is shown until it can update.`
            : live.data
              ? `Showing real current conditions near the map centre: ${WEATHER_LABEL[live.data.state.kind]}${live.data.temperatureC != null ? `, ${Math.round(live.data.temperatureC)}°C` : ''}. Updates every 15 minutes and when you move to another area.`
              : 'Loading current conditions for the map centre…')}
          {prefs.mode === 'manual' && 'You choose the effect. It stays until you change it — live weather never overrides it.'}
          {prefs.mode === 'off' && 'No weather effects are drawn.'}
        </p>
        {prefs.mode === 'manual' && (
          <fieldset className="space-y-3">
            <legend className="sr-only">Manual weather</legend>
            <div role="radiogroup" aria-label="Manual weather" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WEATHER_KINDS.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={prefs.manual === k.id} onClick={() => setWeatherPrefs({ manual: k.id })}
                  className={cn('h-10 rounded-xl px-2 text-xs font-semibold ring-1', prefs.manual === k.id ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white ring-line hover:bg-neutral-50')}>
                  {k.label}
                </button>
              ))}
            </div>
            <label className="block text-xs font-medium text-neutral-700">Intensity
              <input type="range" min={0.1} max={1} step={0.05} value={prefs.intensity} onChange={(e) => setWeatherPrefs({ intensity: Number(e.target.value) })}
                className="mt-1 block w-full accent-neutral-900" aria-valuetext={`${Math.round(prefs.intensity * 100)}%`} />
            </label>
          </fieldset>
        )}
        <p className="text-[11px] text-neutral-500">Automatic mode sends the map centre, rounded to about 25 km, to Open-Meteo. Weather data by <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0).</p>
      </section>
    </div>
  );
}
