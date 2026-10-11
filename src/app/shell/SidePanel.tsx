/**
 * Left side panel. Its content follows the map context:
 *   My Map (/, /maps/..., /chess) -> one panel with two tabs:
 *       Nearby  — categories, filters, sorting and the things near you
 *       My pins — your maps, custom pins and expandable groups
 *   Shared (/collab/...)          -> collaboration maps, invitations, members
 * Other routes (settings, invites) keep the My Map panel.
 */
import { useMatch } from 'react-router-dom';
import { X } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { MapsPanel } from '@/features/maps/MapsPanel';
import { CollabPanel } from '@/features/collaboration/CollabPanel';
import { DiscoverPanel } from '@/features/discover/DiscoverPanel';
import { toggleSidePanel } from './IconRail';

export function SidePanel() {
  const collab = !!useMatch('/collab/*');
  const tab = useUi((s) => s.panelTab);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{collab ? 'Shared' : 'My Map'}</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">{collab ? 'Maps you share with other people' : 'Explore nearby and keep your places'}</p>
        </div>
        <IconButton label="Hide side panel" size="sm" onClick={toggleSidePanel}><X className="size-4" aria-hidden /></IconButton>
      </div>
      {!collab && (
        <div role="tablist" aria-label="Side panel" className="mx-5 mb-3 grid grid-cols-2 rounded-xl bg-canvas p-1 ring-1 ring-line">
          {([['nearby', 'Nearby'], ['pins', 'My pins']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`panel-tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
              onClick={() => uiStore.set({ panelTab: id })}
              className={cn('h-8 rounded-lg text-[13px] font-semibold transition-colors', tab === id ? 'bg-white text-neutral-900 shadow-chip ring-1 ring-line' : 'text-neutral-600 hover:text-neutral-900')}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {collab ? <CollabPanel /> : (
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`panel-tab-${tab}`} className="h-full">
            {tab === 'nearby' ? <DiscoverPanel /> : <MapsPanel />}
          </div>
        )}
      </div>
    </div>
  );
}
