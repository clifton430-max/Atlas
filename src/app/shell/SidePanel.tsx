/**
 * Left side panel. Its content follows the map context:
 *   Discover (/)        -> discovery: categories, filters, events and places in view
 *   My Maps (/maps/...) -> your maps, custom pins and groups
 *   Shared (/collab/...)-> collaboration maps, invitations, members
 * Other routes (settings, invites) keep the maps list.
 */
import { useMatch } from 'react-router-dom';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { MapsPanel } from '@/features/maps/MapsPanel';
import { CollabPanel } from '@/features/collaboration/CollabPanel';
import { DiscoverPanel } from '@/features/discover/DiscoverPanel';
import { toggleSidePanel } from './IconRail';

export function SidePanel() {
  const discover = !!useMatch('/');
  const collab = !!useMatch('/collab/*');
  const title = discover ? 'Discover' : collab ? 'Shared' : 'My Maps';
  const subtitle = discover ? 'Explore events, places and more' : collab ? 'Maps you share with other people' : 'Your private maps, pins and groups';
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">{subtitle}</p>
        </div>
        <IconButton label="Hide side panel" size="sm" onClick={toggleSidePanel}><X className="size-4" aria-hidden /></IconButton>
      </div>
      <div className="min-h-0 flex-1">{discover ? <DiscoverPanel /> : collab ? <CollabPanel /> : <MapsPanel />}</div>
    </div>
  );
}
