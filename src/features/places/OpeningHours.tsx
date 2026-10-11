/**
 * Opening hours from OpenStreetMap, readable: a weekly table with today
 * highlighted and "Open now · closes 5:00 PM" computed in the PLACE's own
 * time zone (looked up from its coordinates), not the viewer's. If the text
 * can't be fully understood it is shown exactly as listed; unavailable hours
 * are never invented. Holiday/seasonal exceptions are mentioned, not shown.
 */
import { useMemo, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { DAY_NAMES, formatSpan, localDayMinute, openStatus, parseOpeningHours } from '@/lib/openingHours';
import { useTimeZoneAt } from '@/features/weather/weather';

export function OpeningHours({ raw, latitude, longitude, compact }: { raw: string; latitude?: number | null; longitude?: number | null; compact?: boolean }) {
  const parsed = useMemo(() => parseOpeningHours(raw), [raw]);
  const tz = useTimeZoneAt(parsed ? latitude : null, parsed ? longitude : null);
  const [showRaw, setShowRaw] = useState(false);
  if (!parsed) {
    return <><span className="font-mono text-xs">{raw}</span><span className="block text-[11px] text-neutral-500">As listed on OpenStreetMap — may be out of date.</span></>;
  }
  const zone = tz.data ?? null;
  const now = zone ? localDayMinute(zone) : null;
  const status = now ? openStatus(parsed, now.day, now.minute) : null;
  const clock = (m: number) => formatSpan([m, m]).split(' – ')[0];
  return (
    <div data-testid="opening-hours">
      {status && (
        <p className={cn('text-[13px] font-semibold', status.open ? 'text-emerald-700' : 'text-danger')}>
          {status.open ? `Open now · closes ${clock(status.closesAt)}`
            : status.opensAt ? `Closed · opens ${status.opensAt.day === now!.day ? '' : `${DAY_NAMES[status.opensAt.day].slice(0, 3)} `}${clock(status.opensAt.minute)}` : 'Closed'}
        </p>
      )}
      {!compact && (
        <table className="mt-1 w-full text-xs">
          <tbody>
            {parsed.days.map((spans, d) => (
              <tr key={d} className={cn(now?.day === d && 'font-semibold text-neutral-900')}>
                <th scope="row" className="w-24 py-0.5 pr-2 text-left font-normal">{DAY_NAMES[d]}</th>
                <td className="py-0.5">{spans.length ? spans.map((s) => formatSpan(s)).join(', ') : <span className="text-neutral-500">Closed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-1 text-[11px] text-neutral-500">
        {zone ? `Local time (${zone.replace(/_/g, ' ')}). ` : tz.isLoading ? 'Checking local time… ' : ''}
        {parsed.partial ? 'Holiday or seasonal exceptions aren’t shown. ' : ''}From OpenStreetMap — may be out of date.{' '}
        <button type="button" className="underline" onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw}>{showRaw ? 'Hide' : 'Show'} as listed</button>
      </p>
      {showRaw && <p className="font-mono text-[11px] text-neutral-600">{raw}</p>}
    </div>
  );
}
