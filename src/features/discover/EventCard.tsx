/**
 * Event preview/details card. Every field is shown exactly as known:
 * unknown prices/hours/end times are labeled "unknown", times are shown in
 * the event's timezone, and the ticket link is only rendered when it is a
 * validated https URL. Source attribution and last-checked time are shown.
 */
import { useState } from 'react';
import { Bookmark, BookmarkCheck, BookmarkPlus, CalendarClock, Clock, ExternalLink, MapPin, Tag, X } from 'lucide-react';
import type { AtlasEvent } from '@/lib/types';
import { eventLocationLine, formatEventStart, formatInstant, formatLocalTime, formatPriceRange, formatRelative } from '@/lib/format';
import { safeExternalUrl } from '@/lib/validation';
import { Badge } from '@/components/ui/Feedback';
import { distanceLabel } from '@/features/places/geo';
import { useUserLocation } from '@/features/places/userLocation';
import { eventVisual } from '@/features/places/categories';
import { CategoryDot } from '@/features/places/CategoryIcon';
import { Button, IconButton } from '@/components/ui/Button';

export function EventCard({ event, onClose, onSave, saved, canSave, signInHint, footer }: {
  event: AtlasEvent;
  onClose?: () => void;
  onSave?: () => void;
  saved?: boolean;
  canSave: boolean;
  signInHint?: boolean;
  /** Extra section after the details (the inspector's inline Add to map form). */
  footer?: React.ReactNode;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const { location } = useUserLocation();
  const dist = distanceLabel(location, event);
  const visual = eventVisual(event.category);
  const ticketUrl = safeExternalUrl(event.ticketUrl);
  const image = !imgFailed ? safeExternalUrl(event.imageUrl) : null;
  const hasVenueHours = event.venueOpenTime || event.venueCloseTime;

  return (
    <article data-tour="event-card" aria-label={`Event: ${event.name}`} className="w-full animate-rise-in">
      {image && (
        <div className="px-4"><img src={image} alt="" onError={() => setImgFailed(true)} className="h-44 w-full rounded-2xl object-cover" /></div>
      )}
      <div className="space-y-3 p-4 pt-3">
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold leading-snug tracking-tight">{event.name}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-700">
              {!event.isDevFixture && <><CategoryDot color={visual.color} icon={visual.icon} /><span>{visual.label}</span></>}
              {event.isDevFixture && <Badge tone="warning">Development sample</Badge>}
              {event.category && <Badge>{event.category}</Badge>}
              {event.genre && event.genre !== event.category && <Badge>{event.genre}</Badge>}
              {event.status && event.status !== 'onsale' && <Badge tone="warning">{event.status}</Badge>}
            </div>
          </div>
          {canSave && onSave && (
            <IconButton label={saved ? 'Saved to a map — edit' : 'Bookmark: add to a map'} onClick={onSave} className="text-neutral-700">
              <Bookmark className={saved ? 'size-5 fill-current text-brand' : 'size-5'} aria-hidden />
            </IconButton>
          )}
          {onClose && (
            <IconButton label="Close event details" size="sm" onClick={onClose}>
              <X className="size-4" aria-hidden />
            </IconButton>
          )}
        </header>

        <dl className="space-y-1.5 text-[13px] text-neutral-700">
          <Row icon={<CalendarClock className="size-4" aria-hidden />} label="Starts">
            {formatEventStart(event)}
          </Row>
          <Row icon={<Clock className="size-4" aria-hidden />} label="Ends">
            {formatInstant(event.endsAt, event.timezone) ?? <span className="text-neutral-500">Unknown</span>}
          </Row>
          <Row icon={<Clock className="size-4" aria-hidden />} label="Venue hours">
            {hasVenueHours
              ? `Opens ${formatLocalTime(event.venueOpenTime)} · Closes ${formatLocalTime(event.venueCloseTime)} (local)`
              : <span className="text-neutral-500">Unknown</span>}
          </Row>
          <Row icon={<MapPin className="size-4" aria-hidden />} label="Where">
            {eventLocationLine(event)}
            {event.latitude == null && <span className="block text-xs text-neutral-500">No verified coordinates — not shown on the map.</span>}
            {dist && <span className="block text-[11px] text-neutral-500">{dist}</span>}
          </Row>
          <Row icon={<Tag className="size-4" aria-hidden />} label="Price">
            <span className={event.priceMin == null && event.priceMax == null ? 'text-neutral-500' : ''}>{formatPriceRange(event)}</span>
          </Row>
        </dl>

        {event.description && <p className="line-clamp-3 text-[13px] text-neutral-600">{event.description}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          {canSave && onSave && !footer && (
            <Button
              data-tour="save-to-map"
              variant={saved ? 'secondary' : 'primary'}
              size="sm"
              onClick={onSave}
              icon={saved ? <BookmarkCheck className="size-4" aria-hidden /> : <BookmarkPlus className="size-4" aria-hidden />}
            >
              {saved ? 'Saved · edit groups' : 'Save to map'}
            </Button>
          )}
          {ticketUrl && (
            <a
              href={ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-[13px] font-medium hover:bg-neutral-50"
            >
              Tickets <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(opens {new URL(ticketUrl).hostname} in a new tab)</span>
            </a>
          )}
        </div>
        {signInHint && <p className="text-xs text-neutral-500">Sign in to save events to your private maps.</p>}
        {footer}

        <footer className="border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
          Source: {event.sourceName ?? event.provider}
          {event.lastCheckedAt && <> · checked {formatRelative(event.lastCheckedAt)}</>}
          {event.timezone && <> · times in {event.timezone}</>}
        </footer>
      </div>
    </article>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="mt-0.5 flex w-[96px] shrink-0 items-start gap-2 text-neutral-500">{icon}<span className="text-xs leading-5">{label}</span></dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
