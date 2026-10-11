/**
 * Lime "Share" action. What can be shared depends on the context, and the menu
 * says so honestly instead of offering links that wouldn't work:
 *   Discover      -> separately labelled: Atlas link, official website / event
 *                    page (only when verified), OpenStreetMap page
 *   Personal map  -> personal maps are private; share pins via a collaboration map
 *   Collaboration -> owners invite people (the database re-checks ownership)
 */
import { lazy, Suspense, useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { Copy, Lock, Share2, UserPlus } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useUi } from '../store';
import { Popover } from '@/components/ui/Popover';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { safeExternalUrl } from '@/lib/validation';
import { useCollabMaps } from '@/features/collaboration/api';
import { useDiscoverEvents } from '@/features/discover/useDiscoverEvents';
import { osmUrl } from '@/features/places/types';
import { usePlaceDetails } from '@/features/places/placeDetails';
import { eventLink, pinLink, placeLink, sharedPinLink } from '@/lib/shareLinks';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';

const InviteDialog = lazy(() => import('@/features/collaboration/InviteDialog').then((m) => ({ default: m.InviteDialog })));

export function ShareMenu() {
  const [inviting, setInviting] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <Popover label="Share" trigger={({ open, toggle, id }) => (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-lime px-3 text-sm font-semibold text-lime-ink hover:bg-lime-strong">
          <Share2 className="size-4" aria-hidden /><span className="hidden sm:inline">Share</span><span className="sr-only sm:hidden">Share</span>
        </button>
      )}>
        {(close) => <ShareContent close={close} onInvite={(m) => { close(); setInviting(m); }} />}
      </Popover>
      {inviting && (
        <Suspense fallback={null}>
          <InviteDialog mapId={inviting.id} mapName={inviting.name} onClose={() => setInviting(null)} />
        </Suspense>
      )}
    </>
  );
}

function ShareContent({ close, onInvite }: { close: () => void; onInvite: (m: { id: string; name: string }) => void }) {
  const discover = !!useMatch('/');
  const personal = !!useMatch('/maps/*');
  const collabId = useMatch('/collab/:mapId')?.params.mapId;
  return (
    <div className="w-80 space-y-3 p-4 text-sm">
      <h2 className="font-semibold">Share</h2>
      {discover ? <DiscoverShare close={close} />
        : personal ? <PersonalShare close={close} />
          : collabId ? <CollabShare mapId={collabId} onInvite={onInvite} />
            : <p className="text-xs text-neutral-600">Open a map or select something on Discover to see sharing options.</p>}
    </div>
  );
}

function CopyRow({ url, label, hint }: { url: string; label: string; hint?: string }) {
  const toast = useToast();
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-neutral-800">{label}</p>
      {hint && <p className="text-[11px] text-neutral-500">{hint}</p>}
      <div className="flex gap-1.5">
        <input readOnly value={url} aria-label={label} className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 text-xs" onFocus={(e) => e.target.select()} />
        <Button size="sm" variant="cta" icon={<Copy className="size-3.5" aria-hidden />} aria-label={`Copy ${label}`}
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); toast.success(`${label} copied.`); } catch { toast.info('Select the link and press Ctrl/Cmd+C to copy it.'); }
          }}>Copy</Button>
      </div>
    </div>
  );
}

function DiscoverShare({ close }: { close: () => void }) {
  const place = useUi((s) => s.selectedPlace);
  const eventId = useUi((s) => s.selectedEventId);
  const { all } = useDiscoverEvents();
  const event = all.find((e) => e.id === eventId);
  const details = usePlaceDetails(place);
  if (eventId) {
    const ticket = safeExternalUrl(event?.ticketUrl);
    return (
      <div className="space-y-3">
        <CopyRow url={eventLink(eventId)} label="Atlas link" hint="Opens this event in Atlas." />
        {ticket
          ? <CopyRow url={ticket} label="Official event page" hint={`The listing on ${new URL(ticket).hostname} (tickets and schedule).`} />
          : <p className="text-xs text-neutral-500">The provider lists no public page for this event.</p>}
      </div>
    );
  }
  if (place) {
    const website = safeExternalUrl(details.data?.website);
    return (
      <div className="space-y-3">
        <CopyRow url={placeLink(place.ref, place.latitude, place.longitude)} label="Atlas link" hint="Opens this place in Atlas." />
        {website
          ? <CopyRow url={website} label="Official website" hint="As listed for this place on OpenStreetMap." />
          : <p className="text-xs text-neutral-500">{details.isLoading ? 'Checking for an official website…' : 'No official website is listed for this place.'}</p>}
        <CopyRow url={osmUrl(place)} label="OpenStreetMap page" hint="The map data record for this place." />
      </div>
    );
  }
  return (
    <p className="text-xs text-neutral-600">
      Select an event or place to copy its links, or share pins with people through a <Link to="/collab" onClick={close} className="underline">collaboration map</Link>.
    </p>
  );
}

function PersonalShare({ close }: { close: () => void }) {
  const mapId = useMatch('/maps/:mapId')?.params.mapId;
  const pinId = useUi((s) => s.selectedPinId);
  return (
    <div className="space-y-3 text-xs text-neutral-600">
      <p className="flex items-start gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Personal maps are always private — nobody else can open them.</p>
      {mapId && pinId && <CopyRow url={pinLink(mapId, pinId)} label="Private Atlas link" hint="Opens this pin for you on any device where you’re signed in. Nobody else can open it." />}
      <p>To show a pin to other people, open it and use <span className="font-medium text-neutral-800">Share</span> to copy it into a collaboration map. The original stays private.</p>
      <Link to="/collab" onClick={close} className="inline-block font-medium text-brand underline">Go to shared maps</Link>
    </div>
  );
}

function CollabShare({ mapId, onInvite }: { mapId: string; onInvite: (m: { id: string; name: string }) => void }) {
  const { user } = useAuth();
  const ws = useWorkspace();
  const maps = useCollabMaps();
  const pinId = useUi((s) => s.selectedSharedPinId);
  if (mapId === 'demo' || ws.local || !user) {
    return <p className="text-xs text-neutral-600">This is a local demo — nothing can be shared from it. Use “Invite people…” in the panel to see how invitations work. Real collaboration needs an account.</p>;
  }
  const map = maps.data?.find((m) => m.id === mapId);
  if (!map) return <p className="text-xs text-neutral-600">Loading…</p>;
  const memberLink = pinId ? <CopyRow url={sharedPinLink(map.id, pinId)} label="Atlas link for members" hint="Opens this pin for members of the map only." /> : null;
  if (map.myRole !== 'owner') return <div className="space-y-3">{memberLink}<p className="text-xs text-neutral-600">Only the owner of “{map.name}” can invite people.</p></div>;
  return (
    <div className="space-y-2">
      {memberLink}
      <p className="text-xs text-neutral-600">Invite people to “{map.name}” with a link or QR code. You choose their role; invitations expire and can be revoked.</p>
      <Button variant="cta" size="sm" className="w-full" icon={<UserPlus className="size-4" aria-hidden />} onClick={() => onInvite({ id: map.id, name: map.name })}>Invite people…</Button>
    </div>
  );
}
