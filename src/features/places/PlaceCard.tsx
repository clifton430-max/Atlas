/**
 * Rich details for an OpenStreetMap place, shown in the inspector. Only
 * verified data: tile data (name, category, coordinates) immediately, then
 * OSM tags and a Wikimedia Commons image (with author + license) from place
 * details. Unknown fields say "not listed"; opening hours are shown exactly
 * as listed on OSM and are never interpreted as "open now". Contained POIs
 * come from OSM area containment and can be selected individually.
 */
import { Directions } from '@/features/routing/Directions';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isChessVenue, chessRoomPath } from '@/features/chess/venues';
import { Crown, Accessibility, Bookmark, BookmarkPlus, ChevronDown, Mail, Clock, ExternalLink, Globe, LocateFixed, MapPin, Navigation, Phone, Utensils } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { safeExternalUrl } from '@/lib/validation';
import { CATEGORY_BY_ID, categorizeSubclass } from './categories';
import { CategoryDot } from './CategoryIcon';
import { distanceLabel } from './geo';
import { usePlaceDetails, type PlaceChild } from './placeDetails';
import { osmUrl, type Place } from './types';
import { useUserLocation } from './userLocation';

const WHEELCHAIR: Record<string, string> = {
  yes: 'Wheelchair accessible (as mapped on OSM)', designated: 'Designed for wheelchair users (as mapped on OSM)',
  limited: 'Limited wheelchair access (as mapped on OSM)', no: 'Not wheelchair accessible (as mapped on OSM)',
};

export function PlaceCard({ place, onSave, onSelectChild, saved, footer }: {
  place: Place;
  onSave?: () => void;
  onSelectChild: (child: PlaceChild) => void;
  saved?: boolean;
  /** Extra section rendered after the details (e.g. the inline Add to map form). */
  footer?: React.ReactNode;
}) {
  const cat = CATEGORY_BY_ID[place.categoryId];
  const details = usePlaceDetails(place);
  const { location } = useUserLocation();
  const [imgOk, setImgOk] = useState(true);
  const [more, setMore] = useState(false);
  const d = details.data;
  const website = safeExternalUrl(d?.website);
  const image = d?.image && imgOk ? d.image : null;
  const dist = distanceLabel(location, place);

  return (
    <article data-tour="place-card" aria-label={`Place: ${place.name}`} className="flex w-full flex-col animate-rise-in">
      <div className="px-4">
        {details.isLoading && <div className="h-40 w-full animate-pulse rounded-2xl bg-neutral-200" aria-hidden />}
        {image && (
          <figure>
            <img src={image.thumbUrl} alt={`Photo of ${place.name}`} onError={() => setImgOk(false)} className="h-44 w-full rounded-2xl object-cover" />
            <figcaption className="pt-1 text-[10px] text-neutral-500">
              Photo{image.artist ? `: ${image.artist}` : ''}{image.license ? ` · ${image.license}` : ''} ·{' '}
              <a href={image.sourcePage} target="_blank" rel="noopener noreferrer" className="underline">Wikimedia Commons</a>
            </figcaption>
          </figure>
        )}
      </div>

      <div className="space-y-3 p-4 pt-3">
        <header>
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-xl font-semibold leading-snug tracking-tight">{place.name}</h3>
            {onSave && (
              <IconButton label={saved ? 'Saved to a map — edit' : 'Bookmark: add to a map'} onClick={onSave} className="text-neutral-700">
                <Bookmark className={cn('size-5', saved && 'fill-current text-brand')} aria-hidden />
              </IconButton>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-700">
            <CategoryDot color={cat.color} icon={cat.icon} />
            <span>{cat.label} · {place.subcategoryLabel}</span>
          </div>
        </header>

        {isChessVenue(place.ref) && (
          <Link to={chessRoomPath(place.ref)} className="flex items-center gap-3 rounded-2xl bg-[#5b4632] p-3 text-white shadow-panel hover:bg-[#4a3828]">
            <Crown className="size-6 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Enter Chess Room</span><span className="block text-xs text-white/80">Play a friend here on one device, or online</span></span>
          </Link>
        )}
        {d?.description && <p className="text-[13px] leading-relaxed text-neutral-600">{d.description}</p>}

        <dl className="space-y-2 text-[13px] text-neutral-800">
          <Row icon={<MapPin className="size-4" aria-hidden />} label="Address">
            {d?.address ?? <Muted loading={details.isLoading} failed={details.isError}>Address not listed</Muted>}
          </Row>
          <Row icon={<Navigation className="size-4" aria-hidden />} label="Distance">
            {dist ?? <span className="text-neutral-500">Use “Distance” in the side panel to see how far away this is.</span>}
          </Row>
          <Row icon={<Clock className="size-4" aria-hidden />} label="Hours">
            {d?.openingHours
              ? <><span className="font-mono text-xs">{d.openingHours}</span><span className="block text-[11px] text-neutral-500">As listed on OpenStreetMap — may be out of date.</span></>
              : <Muted loading={details.isLoading} failed={details.isError}>Hours not listed</Muted>}
          </Row>
          {website && (
            <Row icon={<Globe className="size-4" aria-hidden />} label="Website">
              <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-medium text-accent underline">
                Visit website<ExternalLink className="size-3" aria-hidden /><span className="sr-only">({new URL(website).hostname}, opens in a new tab)</span>
              </a>
            </Row>
          )}
          {d?.phone && <Row icon={<Phone className="size-4" aria-hidden />} label="Phone"><a href={`tel:${d.phone.replace(/[^+\d]/g, '')}`} className="underline">{d.phone}</a></Row>}
          {d?.email && <Row icon={<Mail className="size-4" aria-hidden />} label="Email"><a href={`mailto:${d.email}`} className="break-all underline">{d.email}</a></Row>}
          {d?.wheelchair && <Row icon={<Accessibility className="size-4" aria-hidden />} label="Accessibility">{WHEELCHAIR[d.wheelchair]}</Row>}
        </dl>
        <Directions latitude={place.latitude} longitude={place.longitude} name={place.name} />
        {details.isError && <p className="rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600" role="status">{(details.error as Error).message} Basic map information is shown.</p>}

        <section className="border-t border-line pt-2">
          <h4>
            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)}
              className="flex w-full items-center justify-between rounded-lg py-1.5 text-left text-[13px] font-semibold hover:text-neutral-700">
              More about this place
              <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} aria-hidden />
            </button>
          </h4>
          {more && (
            <div className="space-y-3 pb-1 pt-1">
              <dl className="space-y-1.5 text-[13px] text-neutral-700">
                {d?.cuisine && <Row icon={<Utensils className="size-4" aria-hidden />} label="Cuisine">{d.cuisine.replace(/;/g, ', ').replace(/_/g, ' ')}</Row>}
                <Row icon={<LocateFixed className="size-4" aria-hidden />} label="Location">
                  {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                </Row>
              </dl>
              {!d?.cuisine && !details.isLoading && <p className="text-xs text-neutral-500">No cuisine details are listed for this place.</p>}
            </div>
          )}
        </section>

        {d?.childrenStatus === 'unavailable' && (
          <p className="text-xs text-neutral-500" role="status">Points of interest inside this place couldn’t be loaded right now.</p>
        )}
        {d?.childrenSupported && <Inside items={d.children} onSelectChild={onSelectChild} />}

        {onSave && !footer && (
          <Button variant="primary" size="sm" className="w-full" icon={<BookmarkPlus className="size-4" aria-hidden />} onClick={onSave} data-tour="save-place">
            Save to a map…
          </Button>
        )}
        {footer}

        <p className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
          <span>Data © OpenStreetMap contributors (ODbL)</span>
          <a href={osmUrl(place)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
            View on OSM <ExternalLink className="size-3" aria-hidden />
          </a>
        </p>
      </div>
    </article>
  );
}

function Inside({ items, onSelectChild }: { items: PlaceChild[]; onSelectChild: (c: PlaceChild) => void }) {
  return (
    <section aria-labelledby="inside-heading">
      <h5 id="inside-heading" className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Inside this place</h5>
      {items.length === 0 ? <p className="text-xs text-neutral-500">No named points of interest are mapped inside it.</p> : (
        <ul className="space-y-0.5" data-tour="place-children">
          {items.map((c) => {
            const cc = categorizeSubclass(c.subclass);
            return (
              <li key={c.ref}>
                <button type="button" onClick={() => onSelectChild(c)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-neutral-100">
                  {cc ? <CategoryDot color={cc.category.color} icon={cc.sub.icon ?? cc.category.icon} /> : <MapPin className="size-4 text-neutral-400" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="truncate text-[11px] text-neutral-500">{cc?.sub.label ?? c.subclass.replace(/_/g, ' ')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "Loading…" while fetching, "Unavailable" if details couldn't be loaded, otherwise the given text. */
function Muted({ children, loading, failed }: { children: React.ReactNode; loading?: boolean; failed?: boolean }) {
  return <span className="text-neutral-500">{loading ? 'Loading…' : failed ? 'Unavailable' : children}</span>;
}

/** Icon row; the label is for screen readers (the icon conveys it visually). */
function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <dt className="mt-0.5 shrink-0 text-neutral-500">{icon}<span className="sr-only">{label}</span></dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
