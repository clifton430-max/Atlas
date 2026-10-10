/**
 * Production provider.
 *
 * 1. Calls the `discover-events` Edge Function, which proxies Ticketmaster with
 *    a server-side key, upserts normalized events and returns those in the bbox.
 * 2. If the function is unavailable or the provider isn't configured, falls
 *    back to reading public.events directly (RLS: public read). Results are
 *    then labeled 'database' (previously fetched data) or 'dev-fixture'
 *    (seeded samples) — never presented as live.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AtlasEvent } from '@/lib/types';
import { EVENT_COLUMNS, eventFromRow, type EventRow } from './mapRow';
import { matchesKeyword, type EventProvider, type EventSearchQuery, type EventSearchResult } from './types';

const MAX_DB_RESULTS = 500;

export class SupabaseEventProvider implements EventProvider {
  readonly id = 'supabase';
  constructor(private client: SupabaseClient) {}

  async search(q: EventSearchQuery, signal?: AbortSignal): Promise<EventSearchResult> {
    let notice: string | undefined;
    try {
      const { data, error } = await this.client.functions.invoke('discover-events', {
        body: {
          bbox: q.bbox, keyword: q.keyword || null, category: q.category || null,
          startDate: q.startDate ?? null, endDate: q.endDate ?? null,
        },
      });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!error && data && Array.isArray(data.events)) {
        const live = (data.events as EventRow[]).map(eventFromRow);
        // Also include any seeded fixtures in view (labeled) so dev setups keep working.
        const fixtures = (await this.queryDb(q, true)).filter((e) => e.isDevFixture);
        return {
          events: [...live, ...fixtures],
          source: 'live',
          notice: fixtures.length ? 'Some events shown are development samples.' : undefined,
        };
      }
      notice = await describeFunctionError(error);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      notice = 'The live event service could not be reached.';
    }

    const events = await this.queryDb(q, false);
    const allFixtures = events.length > 0 && events.every((e) => e.isDevFixture);
    return {
      events,
      source: allFixtures ? 'dev-fixture' : 'database',
      notice: allFixtures
        ? `${notice ?? 'Live events unavailable.'} Showing development sample events, which are not real listings.`
        : `${notice ?? 'Live events unavailable.'} Showing previously fetched events; details may be out of date.`,
    };
  }

  private async queryDb(q: EventSearchQuery, fixturesOnly: boolean): Promise<AtlasEvent[]> {
    let req = this.client.from('events').select(EVENT_COLUMNS)
      .gte('latitude', q.bbox.south).lte('latitude', q.bbox.north)
      .gte('longitude', q.bbox.west).lte('longitude', q.bbox.east)
      .order('starts_at', { ascending: true, nullsFirst: false })
      .limit(MAX_DB_RESULTS);
    if (fixturesOnly) req = req.eq('is_dev_fixture', true);
    const { data, error } = await req;
    if (error) throw new Error(error.message);
    const cutoff = Date.now() - 12 * 3600 * 1000;
    return ((data ?? []) as EventRow[])
      .map(eventFromRow)
      .filter((e) => !e.startsAt || new Date(e.startsAt).getTime() >= cutoff)
      .filter((e) => matchesKeyword(e, q.keyword));
  }

  async getById(id: string): Promise<AtlasEvent | null> {
    const { data, error } = await this.client.from('events').select(EVENT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? eventFromRow(data as EventRow) : null;
  }
}

async function describeFunctionError(error: unknown): Promise<string> {
  // FunctionsHttpError carries the Response in `context`.
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error === 'provider_not_configured') return 'The Ticketmaster API key is not configured.';
      if (body?.error === 'rate_limited') return 'The event provider rate limit was reached.';
    } catch {
      /* ignore */
    }
  }
  return 'Live events are unavailable right now.';
}
