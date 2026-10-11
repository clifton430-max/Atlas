/**
 * Right-hand inspector ("Selected place" panel).
 *
 * Routed views own their selection state and render the selected item's
 * details through <InspectorPortal>, which portals into the inspector column
 * rendered by the AppShell. When nothing is portalled, the inspector shows a
 * context-aware empty state with the map legend (which also explains which
 * parts of the map are real data and which are decorative).
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMatch } from 'react-router-dom';
import { MousePointerClick, X } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { uiStore } from './store';
import { MapLegend } from '@/features/map/MapLegend';

interface InspectorCtx {
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
  count: number;
  register: () => () => void;
}
const Ctx = createContext<InspectorCtx | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const register = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);
  const value = useMemo<InspectorCtx>(() => ({ el, setEl, count, register }), [el, count, register]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Render children inside the inspector. `openKey` identifies the selection:
 * whenever it changes the inspector is (re)opened, because selecting something
 * is an explicit request to see its details.
 */
export function InspectorPortal({ title, openKey, onClose, closeLabel, children }: {
  title: string;
  openKey: string;
  /** Clears the selection (the inspector stays open and shows its empty state). */
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const ctx = useContext(Ctx);
  const register = ctx?.register;
  useLayoutEffect(() => register?.(), [register]);
  useEffect(() => {
    if (!uiStore.get().rightPanelOpen) uiStore.set({ rightPanelOpen: true });
  }, [openKey]);
  if (!ctx?.el) return null;
  return createPortal(
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-5 pb-2 pt-4">
        <h2 className="min-w-0 flex-1 text-[17px] font-semibold tracking-tight">{title}</h2>
        {onClose && <IconButton label={closeLabel ?? `Close ${title.toLowerCase()}`} size="sm" onClick={onClose}><X className="size-4" aria-hidden /></IconButton>}
      </div>
      <div className="atlas-scroll min-h-0 flex-1 overflow-y-auto pb-4">{children}</div>
    </section>,
    ctx.el,
  );
}

/** The inspector column body (portal target + empty state). */
export function InspectorBody() {
  const ctx = useContext(Ctx)!;
  return (
    <div className="flex h-full flex-col">
      <div ref={ctx.setEl} className="flex min-h-0 flex-1 flex-col empty:hidden" />
      {ctx.count === 0 && <InspectorEmpty />}
    </div>
  );
}

function InspectorEmpty() {
  const discover = !!useMatch('/');
  const personal = !!useMatch('/maps/:mapId');
  const collab = !!useMatch('/collab/*');
  const hint = discover
    ? 'Select an event or place on the map or in the list to see its details here.'
    : personal ? 'Select a pin on the map to see and edit its details here.'
      : collab ? 'Select a shared pin on the map to see its details here.' : 'Select something on the map to see its details here.';
  return (
    <div className="atlas-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
      <h2 className="text-[17px] font-semibold tracking-tight">{discover ? 'Selected place' : 'Details'}</h2>
      <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-line px-4 py-8 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-canvas text-neutral-500"><MousePointerClick className="size-5" aria-hidden /></span>
        <p className="mt-3 text-sm font-medium">Nothing selected</p>
        <p className="mt-1 text-xs text-neutral-500">{hint}</p>
      </div>
      <MapLegend className="mt-6" />
    </div>
  );
}
