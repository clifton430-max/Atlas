/**
 * Context-aware search (ARIA combobox).
 *
 *   Discover      -> events (name/venue/artist/category/city among loaded
 *                    events), "search events for …" (provider keyword search
 *                    in the viewport), and places/addresses (geocoder).
 *   Personal map  -> this map's pins (title, note, event, address) + places
 *                    (with "add a pin here").
 *   Collaboration -> this map's shared pins + places.
 *
 * Input is debounced (300 ms) and geocoder calls are aborted when superseded.
 * Results never cross contexts: each context searches only its own data.
 */
import { searchResultToPinSource } from '@/features/pins/pinSource';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { CalendarDays, Loader2, MapPin, MapPinned, Search, Users, X } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { useAuth } from '@/app/AuthProvider';
import { useMapInstance } from '@/features/map/MapContext';
import { useDebounced } from '@/lib/useDebounced';
import { searchPlaces, type PlaceResult } from '@/services/events/geocoder';
import { useDiscoverEvents } from '@/features/discover/useDiscoverEvents';
import { pinTitle, usePins } from '@/features/pins/api';
import { useSharedPins } from '@/features/collaboration/api';
import { matchesKeyword } from '@/services/events/types';
import { cn } from '@/components/ui/cn';

interface Option {
  id: string;
  section: 'Events' | 'Your pins' | 'Shared pins' | 'Places' | 'Search';
  label: string;
  detail?: string;
  icon: 'event' | 'pin' | 'shared' | 'place' | 'search';
  run: () => void;
}

const icons = { event: CalendarDays, pin: MapPinned, shared: Users, place: MapPin, search: Search };

export function SearchBar() {
  const { user } = useAuth();
  const { map } = useMapInstance();
  const discoverCtx = useMatch('/');
  const personal = useMatch('/maps/:mapId');
  const collab = useMatch('/collab/:mapId');
  const keyword = useUi((s) => s.discoverKeyword);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState(false);
  const q = useDebounced(text.trim(), 300);

  const discover = useDiscoverEvents();
  const pins = usePins(personal?.params.mapId);
  const shared = useSharedPins(collab?.params.mapId);

  // Reset when switching context.
  const ctxKey = discoverCtx ? 'd' : personal ? `p${personal.params.mapId}` : collab ? `c${collab.params.mapId}` : 'other';
  useEffect(() => {
    setText('');
    setOpen(false);
  }, [ctxKey]);

  useEffect(() => {
    if (q.length < 2) {
      setPlaces([]);
      setPlacesError(false);
      return;
    }
    const ctrl = new AbortController();
    setPlacesLoading(true);
    const c = map?.getCenter();
    searchPlaces(q, { signal: ctrl.signal, near: c ? { latitude: c.lat, longitude: c.lng } : undefined })
      .then((r) => { setPlaces(r); setPlacesError(false); })
      .catch((e) => { if (e.name !== 'AbortError') { setPlaces([]); setPlacesError(true); } })
      .finally(() => !ctrl.signal.aborted && setPlacesLoading(false));
    return () => ctrl.abort();
  }, [q, map]);

  const fly = (lng: number, lat: number, zoom = 14) => map?.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), zoom) });
  const finish = (label?: string) => {
    setOpen(false);
    if (label !== undefined) setText(label);
    inputRef.current?.blur();
  };

  const options = useMemo<Option[]>(() => {
    if (q.length < 1) return [];
    const out: Option[] = [];
    const lower = q.toLowerCase();

    if (discoverCtx) {
      out.push({
        id: 'kw', section: 'Search', icon: 'search', label: `Search events for “${q}”`, detail: 'Artists, venues, categories in this area',
        run: () => { uiStore.set({ discoverKeyword: q }); finish(q); },
      });
      for (const e of discover.all.filter((ev) => matchesKeyword(ev, q)).slice(0, 6)) {
        out.push({
          id: `e${e.id}`, section: 'Events', icon: 'event', label: e.name,
          detail: [e.venueName, e.city, e.category].filter(Boolean).join(' · '),
          run: () => {
            uiStore.set({ selectedEventId: e.id });
            if (e.longitude != null && e.latitude != null) fly(e.longitude, e.latitude);
            finish('');
          },
        });
      }
    }
    if (personal) {
      for (const p of (pins.data ?? []).filter((pin) =>
        [pinTitle(pin), pin.note, pin.address, pin.event?.venueName, pin.event?.city, pin.event?.category]
          .some((v) => v?.toLowerCase().includes(lower))).slice(0, 8)) {
        out.push({
          id: `p${p.id}`, section: 'Your pins', icon: 'pin', label: pinTitle(p),
          detail: p.address ?? p.event?.venueName ?? undefined,
          run: () => {
            uiStore.set({ selectedPinId: p.id });
            if (p.longitude != null && p.latitude != null) fly(p.longitude, p.latitude);
            finish('');
          },
        });
      }
    }
    if (collab) {
      for (const p of (shared.data ?? []).filter((sp) =>
        [sp.title, sp.address, sp.note, sp.sharedByName].some((v) => v?.toLowerCase().includes(lower))).slice(0, 8)) {
        out.push({
          id: `s${p.id}`, section: 'Shared pins', icon: 'shared', label: p.title, detail: p.sharedByName ?? undefined,
          run: () => { uiStore.set({ selectedSharedPinId: p.id }); fly(p.longitude, p.latitude); finish(''); },
        });
      }
    }
    for (const pl of places) {
      out.push({
        id: `g${pl.id}`, section: 'Places', icon: 'place', label: pl.name, detail: pl.detail,
        run: () => {
          fly(pl.longitude, pl.latitude, 13);
          // On a personal map (account or guest), a search hit becomes a new pin that keeps its source.
          if (personal) {
            uiStore.set({ newPinAt: {
              latitude: pl.latitude, longitude: pl.longitude, title: pl.name, address: [pl.name, pl.detail].filter(Boolean).join(', '),
              placeRef: pl.osmRef, source: searchResultToPinSource(pl),
            } });
          }
          finish(pl.name);
        },
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, places, discover.all, pins.data, shared.data, discoverCtx, personal, collab, user, map]);

  useEffect(() => setActive(0), [options.length]);

  const placeholder = personal ? 'Search your pins, places or addresses' : collab ? 'Search shared pins or places' : 'Search events, venues, artists, cities…';
  const activeOpt = options[active];

  return (
    <div className="relative w-full max-w-[560px]" data-tour="search">
      <div className="flex h-10 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-line transition-shadow hover:ring-neutral-300 focus-within:ring-2 focus-within:ring-accent">
        <Search className="size-4 shrink-0 text-neutral-400" aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={placeholder}
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeOpt ? `${listId}-${activeOpt.id}` : undefined}
          value={text}
          placeholder={placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') {
              e.preventDefault();
              if (activeOpt) activeOpt.run();
              else if (discoverCtx && text.trim()) { uiStore.set({ discoverKeyword: text.trim() }); finish(); }
            } else if (e.key === 'Escape') setOpen(false);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400 focus-visible:outline-none"
        />
        {placesLoading && <Loader2 className="size-4 animate-spin text-neutral-400" aria-label="Searching" />}
        {(text || (discoverCtx && keyword)) && (
          <button
            type="button"
            aria-label="Clear search"
            className="rounded p-0.5 text-neutral-400 hover:text-neutral-700"
            onClick={() => { setText(''); uiStore.set({ discoverKeyword: '' }); inputRef.current?.focus(); }}
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {discoverCtx && keyword && !open && (
        <p className="mt-1 px-1 text-xs text-neutral-600" role="status">Showing events matching “{keyword}”.</p>
      )}
      {open && q.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl bg-white p-1.5 shadow-float ring-1 ring-black/5">
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-neutral-500" role="presentation">
              {placesLoading || q !== text.trim() ? 'Searching…' : placesError ? 'Place search is unavailable right now.' : 'No matches.'}
            </li>
          )}
          {options.map((o, i) => {
            const Icon = icons[o.icon];
            const showHeader = i === 0 || options[i - 1].section !== o.section;
            return (
              <li key={o.id} role="presentation">
                {showHeader && o.section !== 'Search' && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400" role="presentation">{o.section}</div>}
                <div
                  id={`${listId}-${o.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => o.run()}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', i === active && 'bg-neutral-100')}
                >
                  <Icon className="size-4 shrink-0 text-neutral-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{o.label}</span>
                    {o.detail && <span className="block truncate text-xs text-neutral-500">{o.detail}</span>}
                  </span>
                  {o.icon === 'place' && personal && user && <span className="text-[11px] text-neutral-500">Add pin</span>}
                </div>
              </li>
            );
          })}
          {places.length > 0 && <li role="presentation" className="px-3 pb-1 pt-2 text-[10px] text-neutral-400">Places © OpenStreetMap contributors, via Photon</li>}
        </ul>
      )}
    </div>
  );
}
