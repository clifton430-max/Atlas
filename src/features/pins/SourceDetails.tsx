/**
 * Shows a pin's saved source snapshot (see pinSource.ts), clearly labelled as
 * coming from its provider and kept apart from the user's own title/note.
 * Opening hours are shown as a weekly table (or verbatim when they can't be
 * fully understood); nothing is inferred.
 */
import { Accessibility, Clock, ExternalLink, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { safeExternalUrl } from '@/lib/validation';
import { formatRelative } from '@/lib/format';
import { sourceUrl, type PinSource } from './pinSource';
import { OpeningHours } from '@/features/places/OpeningHours';

const PROVIDER: Record<PinSource['provider'], string> = { osm: 'OpenStreetMap', ticketmaster: 'Ticketmaster', 'dev-fixture': 'Development sample' };
const WHEELCHAIR: Record<string, string> = { yes: 'Wheelchair accessible (as mapped)', designated: 'Designed for wheelchair users (as mapped)', limited: 'Limited wheelchair access (as mapped)', no: 'Not wheelchair accessible (as mapped)' };

export function SourceDetails({ source, compact, at }: { source: PinSource; compact?: boolean; at?: { latitude: number | null; longitude: number | null } }) {
  const website = safeExternalUrl(source.website);
  const link = sourceUrl(source);
  return (
    <section aria-label={`Details from ${PROVIDER[source.provider]}`} className="space-y-2 text-[13px] text-neutral-700">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        From {PROVIDER[source.provider]}{source.capturedAt && <span className="font-normal normal-case tracking-normal"> · saved {formatRelative(source.capturedAt)}</span>}
      </p>
      {!compact && source.image && (
        <figure>
          <img src={source.image.thumbUrl} alt={`Photo of ${source.name ?? 'this place'}`} className="h-32 w-full rounded-xl object-cover" />
          <figcaption className="pt-0.5 text-[10px] text-neutral-500">
            Photo{source.image.artist ? `: ${source.image.artist}` : ''}{source.image.license ? ` · ${source.image.license}` : ''} ·{' '}
            <a href={source.image.sourcePage} target="_blank" rel="noopener noreferrer" className="underline">Wikimedia Commons</a>
          </figcaption>
        </figure>
      )}
      {(source.name || source.subcategory) && (
        <p><span className="font-medium text-neutral-900">{source.name}</span>{source.subcategory ? ` · ${source.subcategory}` : ''}{source.category ? ` (${source.category})` : ''}</p>
      )}
      {!compact && source.description && <p className="text-neutral-600">{source.description}</p>}
      <dl className="space-y-1">
        {source.address && <Row icon={<MapPin className="size-3.5" />} label="Address">{source.address}</Row>}
        {source.openingHours && (
          <Row icon={<Clock className="size-3.5" />} label="Opening hours">
            <OpeningHours raw={source.openingHours} latitude={at?.latitude} longitude={at?.longitude} compact={compact} />
          </Row>
        )}
        {website && <Row icon={<Globe className="size-3.5" />} label="Official website"><a href={website} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">{new URL(website).hostname}</a></Row>}
        {source.phone && <Row icon={<Phone className="size-3.5" />} label="Phone"><a href={`tel:${source.phone.replace(/[^+\d]/g, '')}`} className="underline">{source.phone}</a></Row>}
        {source.email && <Row icon={<Mail className="size-3.5" />} label="Email"><a href={`mailto:${source.email}`} className="underline">{source.email}</a></Row>}
        {source.wheelchair && <Row icon={<Accessibility className="size-3.5" />} label="Accessibility">{WHEELCHAIR[source.wheelchair]}</Row>}
      </dl>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-neutral-500 underline">
          View source on OpenStreetMap <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </section>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="mt-0.5 shrink-0 text-neutral-500" aria-hidden>{icon}</dt>
      <dd className="min-w-0"><span className="sr-only">{label}: </span>{children}</dd>
    </div>
  );
}
