/**
 * Editor-style app shell:
 *
 *   ┌──────────────────────────── top nav ─────────────────────────────┐
 *   │ rail │ side panel │        map canvas + toolbar        │ inspector│
 *   └──────┴────────────┴────────────────────────────────────┴──────────┘
 *
 * The MapCanvas is mounted once here, so the viewport survives context
 * switches (Discover / Personal / Collaboration) and panel toggles. Routed
 * views render layers/markers into the map via <Outlet/> and their selection
 * details into the inspector via <InspectorPortal>.
 *
 * Responsive: below xl the inspector overlays the map; below lg the side
 * panel does too; below md the icon rail is replaced by a floating toggle.
 */
import { Outlet } from 'react-router-dom';
import { PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { uiStore, useUi } from './store';
import { useAuth } from './AuthProvider';
import { InspectorBody, InspectorProvider } from './Inspector';
import { TopNav } from './shell/TopNav';
import { IconRail, toggleSidePanel } from './shell/IconRail';
import { SidePanel } from './shell/SidePanel';
import { resolveMapStyleUrl } from '@/lib/env';
import { MapCanvas } from '@/features/map/MapCanvas';
import { MapProvider } from '@/features/map/MapContext';
import { MapToolbar } from '@/features/map/MapToolbar';
import { AmbientLayer } from '@/features/places/AmbientLayer';
import { useProfile } from '@/features/settings/profileApi';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useLocalSnapshot } from '@/features/workspace/useLocalSnapshot';
import { cn } from '@/components/ui/cn';

const floatBtn = 'pointer-events-auto grid size-10 place-items-center rounded-xl bg-white text-neutral-700 shadow-panel ring-1 ring-black/5 hover:bg-neutral-50';

export function AppShell() {
  const left = useUi((s) => s.leftPanelOpen);
  const right = useUi((s) => s.rightPanelOpen);
  const { user } = useAuth();
  const profile = useProfile();
  const ws = useWorkspace();
  // Map style: account profile when signed in, otherwise the local workspace preference.
  const localPrefs = useLocalSnapshot(ws.local)?.prefs;
  const styleUrl = resolveMapStyleUrl(user && !ws.isLocal ? profile.data?.mapStyle : localPrefs?.mapStyle);

  return (
    <MapProvider>
      <InspectorProvider>
        <div className="flex h-full flex-col overflow-hidden">
          <TopNav />
          <div className="relative flex min-h-0 flex-1">
            <IconRail />

            <aside
              aria-label="Side panel"
              className={cn(
                'z-30 shrink-0 overflow-hidden border-line bg-white transition-[width] duration-200',
                'max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-float md:max-lg:left-16',
                left ? 'w-[min(340px,100vw)] border-r' : 'w-0',
              )}
            >
              <div className={cn('h-full w-[min(340px,100vw)]', !left && 'invisible')}><SidePanel /></div>
            </aside>

            <main className="relative min-w-0 flex-1" aria-label="Map" data-tour="map-area">
              <MapCanvas styleUrl={styleUrl}>
                <AmbientLayer />
                <Outlet />
              </MapCanvas>
              <MapToolbar />
              <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-between">
                <span>
                  {!left && (
                    <button type="button" className={cn(floatBtn, 'md:hidden')} aria-label="Expand side panel" onClick={toggleSidePanel}>
                      <PanelLeftOpen className="size-4" aria-hidden />
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  data-tour="toggle-right"
                  aria-expanded={right}
                  aria-label={right ? 'Collapse details panel' : 'Expand details panel'}
                  title={right ? 'Collapse details panel' : 'Expand details panel'}
                  className={floatBtn}
                  onClick={() => uiStore.set((s) => ({ rightPanelOpen: !right, panelToggles: s.panelToggles + 1 }))}
                >
                  {right ? <PanelRightClose className="size-4" aria-hidden /> : <PanelRightOpen className="size-4" aria-hidden />}
                </button>
              </div>
            </main>

            <aside
              aria-label="Details"
              className={cn(
                'z-30 shrink-0 overflow-hidden border-line bg-white transition-[width] duration-200',
                'max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:shadow-float',
                right ? 'w-[min(360px,100vw)] border-l' : 'w-0',
              )}
            >
              <div className={cn('h-full w-[min(360px,100vw)]', !right && 'invisible')}><InspectorBody /></div>
            </aside>
          </div>
        </div>
      </InspectorProvider>
    </MapProvider>
  );
}
