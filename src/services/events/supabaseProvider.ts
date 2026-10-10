/**
 * Production provider.
 *
 * 1. Calls the `discover-events` Edge Function, which proxies Ticketmaster with
 *    a server-side key, caches per viewport, and returns events in the bbox
 *    labelled with their provenance:
 *      source 'ticketmaster'          -> fetched live just now
 *      source 'cache', stale=false    -> fetched from Ticketmaster < 15 min ago
 *      source 'cache', stale=true     -> provider unavailable; possibly outdated
 * 2. If the function itself is unreachable, falls back to reading
 *    public.events directly (RLS: public read) and labels the result
 *    'database' (previously fetched) or 'dev-fixture' (seeded samples).
 * Development fixtures are always labelled and never reported as live.
 */
import type { AtlasClient } from '@/lib/supabase';
import type { AtlasEvent } from '@/lib/types';
import { formatRelative } from '@/lib/format';
import { EVENT_COLUMNS, eventFromRow, type EventRow } from './mapRow';
import { matchesKeyword, type EventProvider, type EventSearchQuery, type EventSearchResult } from './types';

const MAX_DB_RESULTS = 500;
const FUNCTION_TIMEOUT_MS = 15_000;

interface DiscoverResponse {
  source: 'ticketmaster' | 'cache';
  fetched: boolean;
  stale: boolean;
  cachedAt: string | null;
  totalAvailable?: number | null;
  warning?: string;
  events: EventRow[];
}

/** User-facing explanation for provider warnings (details go to the console only). */
export function describeWarning(code: string | undefined): string {
  switch (code) {
    case 'provider_budget_exhausted':
    case 'provider_rate_limited':
      return 'Live event lookups are temporarily rate-limited.';
    case 'provider_timeout':
    case 'provider_unreachable':
      return 'The live event provider did not respond.';
    case 'provider_not_configured':
    case 'provider_auth_failed':
      return 'Live events are unavailable right now (provider configuration issue).';
    default:
      return 'Live events are unavailable right now.';
  }
}

export class SupabaseEventProvider implements EventProvider {
  readonly id = 'supabase';
  constructor(private client: AtlasClient) {}

  async search(q: EventSearchQuery, signal?: AbortSignal): Promise<EventSearchResult> {
    let notice: string | undefined;
    try {
      const { data, error } = await this.client.functions.invoke<DiscoverResponse>('discover-events', {
        body: {
          bbox: q.bbox, keyword: q.keyword || null, category: q.category || null,
          startDate: q.startDate ?? null, endDate: q.endDate ?? null,
        },
        signal,
        timeout: FUNCTION_TIMEOUT_MS,
      });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!error && data && Array.isArray(data.events)) {
        const provider = data.events.map(eventFromRow);
        // Seeded dev fixtures in view are appended — always labelled as samples.
        const fixtures = (await this.queryDb(q, true, signal)).filter((e) => e.isDevFixture);
        const events = [...provider, ...fixtures];
        if (data.warning) console.warn('[discover] provider warning:', data.warning);

        if (!data.stale) {
          const age = data.fetched ? null : formatRelative(data.cachedAt);
          // Be explicit when Ticketmaster has more events than were loaded for this view.
          const truncated = data.totalAvailable != null && data.totalAvailable > provider.length
            ? ` · showing ${provider.length} of ${data.totalAvailable} — zoom in or choose dates to see more`
            : '';
          return {
            events,
            source: 'live',
            notice: fixtures.length ? 'Some events shown are development samples, not real listings.' : undefined,
            detail: `${data.fetched ? 'Live from Ticketmaster' : `From Ticketmaster${age ? ` · fetched ${age}` : ''}`}${truncated}`,
          };
        }
        const base = describeWarning(data.warning);
        return {
          events,
          source: provider.length ? 'database' : fixtures.length ? 'dev-fixture' : 'database',
          notice: provider.length
            ? `${base} Showing previously fetched events; details may be out of date.`
            : fixtures.length
              ? `${base} Showing development sample events, which are not real listings.`
              : base,
        };
      }
      notice = await describeFunctionError(error);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      notice = 'The live event service could not be reached.';
    }

    const events = await this.queryDb(q, false, signal);
    const allFixtures = events.length > 0 && events.every((e) => e.isDevFixture);
    return {
      events,
      source: allFixtures ? 'dev-fixture' : 'database',
      notice: allFixtures
        ? `${notice} Showing development sample events, which are not real listings.`
        : events.length
          ? `${notice} Showing previously fetched events; details may be out of date.`
          : notice,
    };
  }

  private async queryDb(q: EventSearchQuery, fixturesOnly: boolean, signal?: AbortSignal): Promise<AtlasEvent[]> {
    let req = this.client.from('events').select(EVENT_COLUMNS)
      .gte('latitude', q.bbox.south).lte('latitude', q.bbox.north)
      .gte('longitude', q.bbox.west).lte('longitude', q.bbox.east)
      .order('starts_at', { ascending: true, nullsFirst: false })
      .limit(MAX_DB_RESULTS);
    if (fixturesOnly) req = req.eq('is_dev_fixture', true);
    if (signal) req = req.abortSignal(signal);
    const { data, error } = await req;
    if (error) throw new Error(error.message);
    const cutoff = Date.now() - 12 * 3600 * 1000;
    return ((data ?? []) as unknown as EventRow[])
      .map(eventFromRow)
      .filter((e) => !e.startsAt || new Date(e.startsAt).getTime() >= cutoff)
      .filter((e) => matchesKeyword(e, q.keyword));
  }

  async getById(id: string): Promise<AtlasEvent | null> {
    const { data, error } = await this.client.from('events').select(EVENT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? eventFromRow(data as unknown as EventRow) : null;
  }
}

async function describeFunctionError(error: unknown): Promise<string> {
  // FunctionsHttpError carries the Response in `context`.
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error === 'rate_limited') return 'Too many event searches — please wait a minute.';
    } catch {
      /* ignore */
    }
  }
  return 'Live events are unavailable right now.';
}
