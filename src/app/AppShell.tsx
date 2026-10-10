/**
 * Desktop app shell:
 *   [ left panel: maps & groups ] [ dominant map + floating controls ] [ right panel: collaboration ]
 *
 * The MapCanvas is mounted once here, so the viewport survives context
 * switches (Discover / Personal / Collaboration) and panel toggles. Routed
 * views render their layers/markers/cards into the map area via <Outlet/>.
 */
import { Outlet } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { uiStore, useUi } from './store';
import { useAuth } from './AuthProvider';
import { AccountMenu } from './AccountMenu';
import { resolveMapStyleUrl } from '@/lib/env';
import { MapCanvas } from '@/features/map/MapCanvas';
import { MapProvider } from '@/features/map/MapContext';
import { FilterControl } from '@/features/map/FilterControl';
import { SearchBar } from '@/features/search/SearchBar';
import { MapsPanel } from '@/features/maps/MapsPanel';
import { CollabPanel } from '@/features/collaboration/CollabPanel';
import { useProfile } from '@/features/settings/profileApi';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

export function AppShell() {
  const left = useUi((s) => s.leftPanelOpen);
  const right = useUi((s) => s.rightPanelOpen);
  const { user } = useAuth();
  const profile = useProfile();
  const styleUrl = resolveMapStyleUrl(user ? profile.data?.mapStyle : undefined);

  return (
    <MapProvider>
      <div className="flex h-full min-w-[960px] overflow-hidden">
        <aside
          aria-label="Maps and groups"
          className={cn('relative z-20 flex shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200', left ? 'w-[272px]' : 'w-0')}
        >
          <div className={cn('flex h-full w-[272px] flex-col', !left && 'invisible')}>
            <div className="flex h-14 items-center gap-2 border-b border-neutral-200 px-4">
              <img src="/atlas.svg" alt="" className="size-6" />
              <span className="text-[15px] font-semibold tracking-tight">Atlas</span>
            </div>
            <div className="min-h-0 flex-1"><MapsPanel /></div>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1" aria-label="Map">
          <MapCanvas styleUrl={styleUrl}>
            <Outlet />
          </MapCanvas>

          {/* Floating top controls */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-3 p-3">
            <div className="pointer-events-auto">
              <IconButton
                label={left ? 'Collapse maps panel' : 'Expand maps panel'}
                aria-expanded={left}
                className="size-10 bg-white shadow-panel ring-1 ring-black/5"
                onClick={() => uiStore.set({ leftPanelOpen: !left })}
              >
                {left ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
              </IconButton>
            </div>
            <div className="pointer-events-auto flex flex-1 justify-center"><SearchBar /></div>
            <div className="pointer-events-auto flex items-center gap-2">
              <FilterControl />
              <AccountMenu />
              <IconButton
                label={right ? 'Collapse collaboration panel' : 'Expand collaboration panel'}
                aria-expanded={right}
                className="size-10 bg-white shadow-panel ring-1 ring-black/5"
                onClick={() => uiStore.set({ rightPanelOpen: !right })}
              >
                {right ? <PanelRightClose className="size-4" aria-hidden /> : <PanelRightOpen className="size-4" aria-hidden />}
              </IconButton>
            </div>
          </div>
        </main>

        <aside
          aria-label="Collaboration"
          className={cn('relative z-20 shrink-0 border-l border-neutral-200 bg-white transition-[width] duration-200', right ? 'w-[300px]' : 'w-0')}
        >
          <div className={cn('h-full w-[300px]', !right && 'invisible')}><CollabPanel /></div>
        </aside>
      </div>
    </MapProvider>
  );
}
