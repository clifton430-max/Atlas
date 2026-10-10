/**
 * Bottom map toolbar (all map contexts):
 *   [locate · 2D/3D · zoom out · zoom in · reset view]   [map animations]   [layers]
 * Replaces MapLibre's built-in navigation buttons with labelled, keyboard
 * accessible controls that match the app.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Layers, Loader2, LocateFixed, Minus, Mountain, Plus, Square } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { Switch } from '@/components/ui/Field';
import { cn } from '@/components/ui/cn';
import { useToast } from '@/components/ui/Toast';
import { requestUserLocation } from '@/features/places/userLocation';
import { AnimationsControl } from '@/features/places/AnimationsControl';
import { useMapInstance } from './MapContext';
import { MapLegend } from './MapLegend';
import { LIGHTING_OPTIONS, setLightingMode, useIsNight, useLightingMode } from './lighting';
import { BEARING_3D, PITCH_3D, setTreesEnabled, setViewMode, useTreesEnabled, useViewMode } from './viewPrefs';

const groupCls = 'pointer-events-auto flex items-center rounded-xl bg-white p-1 shadow-panel ring-1 ring-black/5';
const btnCls = 'grid size-9 place-items-center rounded-lg text-neutral-700 hover:bg-neutral-100 disabled:opacity-40';

export function MapToolbar() {
  const { map } = useMapInstance();
  const mode = useViewMode();
  const toast = useToast();
  const [locating, setLocating] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Only pass a duration under reduced motion: `duration: undefined` would override MapLibre's default.
  const anim = reduce ? { duration: 0 } : {};

  const locate = async () => {
    setLocating(true);
    const loc = await requestUserLocation();
    setLocating(false);
    if (!loc) { toast.info('Your location isn’t available. Check the browser’s location permission.'); return; }
    map?.easeTo({ center: [loc.longitude, loc.latitude], zoom: Math.max(map.getZoom(), 15), ...anim });
  };
  const toggle3d = () => {
    const next = mode === '3d' ? '2d' : '3d';
    setViewMode(next);
    map?.easeTo(next === '3d' ? { pitch: PITCH_3D, bearing: BEARING_3D, ...anim } : { pitch: 0, bearing: 0, ...anim });
  };
  const resetView = () => map?.easeTo(mode === '3d' ? { pitch: PITCH_3D, bearing: BEARING_3D, ...anim } : { pitch: 0, bearing: 0, ...anim });

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-8 z-20 flex flex-wrap items-end justify-between gap-2 md:inset-x-4">
      <div role="toolbar" aria-label="Map view" className={groupCls}>
        <button type="button" className={btnCls} onClick={locate} aria-label="Go to my location" title="Go to my location" disabled={!map || locating}>
          {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
        </button>
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <button type="button" className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40" onClick={toggle3d} aria-pressed={mode === '3d'}
          aria-label="3D view" title={mode === '3d' ? 'Switch to flat 2D view' : 'Switch to tilted 3D view'} disabled={!map}>
          {mode === '3d' ? <Mountain className="size-4" aria-hidden /> : <Square className="size-4" aria-hidden />}{mode === '3d' ? '3D' : '2D'}
        </button>
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <button type="button" className={btnCls} onClick={() => map?.zoomOut(anim)} aria-label="Zoom out" title="Zoom out" disabled={!map}><Minus className="size-4" aria-hidden /></button>
        <button type="button" className={btnCls} onClick={() => map?.zoomIn(anim)} aria-label="Zoom in" title="Zoom in" disabled={!map}><Plus className="size-4" aria-hidden /></button>
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <button type="button" className={btnCls} onClick={resetView} aria-label="Reset map orientation" title="Reset map orientation" disabled={!map}><Compass className="size-4" aria-hidden /></button>
      </div>

      <AnimationsControl className={cn(groupCls, 'order-last w-full justify-center sm:order-none sm:w-auto')} />

      <Popover label="Map layers" trigger={({ open, toggle, id }) => (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
          className="pointer-events-auto flex h-11 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-medium shadow-panel ring-1 ring-black/5 hover:bg-neutral-50">
          <Layers className="size-4" aria-hidden />Layers
        </button>
      )}>
        <LayersPanel />
      </Popover>
    </div>
  );
}

function LightingControl() {
  const lighting = useLightingMode();
  const night = useIsNight();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-neutral-800">Lighting</legend>
      <div role="radiogroup" aria-label="Lighting" className="mt-1.5 grid grid-cols-3 rounded-xl bg-canvas p-1 ring-1 ring-line">
        {LIGHTING_OPTIONS.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={lighting === o.id} onClick={() => setLightingMode(o.id)}
            className={cn('h-7 rounded-lg text-xs font-semibold', lighting === o.id ? 'bg-white text-neutral-900 shadow-chip ring-1 ring-line' : 'text-neutral-600 hover:text-neutral-900')}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {lighting === 'auto' ? `Auto follows the approximate local time at the map centre (now: ${night ? 'night' : 'day'}).` : 'Lighting is a colour change only.'}
      </p>
    </fieldset>
  );
}

function LayersPanel() {
  const mode = useViewMode();
  const trees = useTreesEnabled();
  const { map } = useMapInstance();
  return (
    <div className="w-80 space-y-4 p-4 text-sm">
      <h2 className="font-semibold">Map layers</h2>
      <Switch label="3D buildings and tilted view" description="Real OSM footprints and heights; facade colours are decorative." checked={mode === '3d'} onChange={(v) => {
        setViewMode(v ? '3d' : '2d');
        map?.easeTo(v ? { pitch: PITCH_3D, bearing: BEARING_3D } : { pitch: 0, bearing: 0 });
      }} />
      <Switch label="Decorative trees" description="Drawn only inside mapped parks and woods — not individual real trees." checked={trees} onChange={setTreesEnabled} />
      <LightingControl />
      <p className="text-xs text-neutral-600">Basemap style (light, bright, liberty) is in <Link to="/settings/appearance" className="underline">Settings → Map appearance</Link>.</p>
      <MapLegend />
    </div>
  );
}
