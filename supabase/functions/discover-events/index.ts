/**
 * Edge Function: discover-events
 *
 * Server-side proxy for the Ticketmaster Discovery API so the API key never
 * reaches the browser. Flow:
 *   1. Validate the requested bounding box / filters.
 *   2. If this viewport+filter combination was fetched within CACHE_TTL, skip
 *      the provider call (rate-limit protection).
 *   3. Otherwise call Ticketmaster, normalize events, and upsert them into
 *      public.events keyed by (provider, external_id) — no duplicates.
 *   4. Return the normalized events inside the bbox from the database.
 *
 * Secrets (set with `supabase secrets set`):
 *   TICKETMASTER_API_KEY            required for live data
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   injected automatically by Supabase
 *
 * Responses:
 *   200 { source: 'ticketmaster', fetched: boolean, events: EventRow[] }
 *   400 invalid request, 503 provider_not_configured, 502 provider_error, 429 rate_limited
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildTicketmasterUrl,
  cacheKeyFor,
  isValidBBox,
  normalizeTicketmasterEvent,
  TICKETMASTER_PROVIDER,
  type EventRowInput,
  type TicketmasterQuery,
  type TmEvent,
} from '../_shared/ticketmaster.ts';

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_RESULTS = 500;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => null) as Partial<TicketmasterQuery> | null;
  if (!body || !isValidBBox(body.bbox)) return json({ error: 'invalid_bbox' }, 400);
  const query: TicketmasterQuery = {
    bbox: body.bbox,
    keyword: typeof body.keyword === 'string' ? body.keyword.slice(0, 100) : null,
    category: typeof body.category === 'string' ? body.category.slice(0, 60) : null,
    startDate: typeof body.startDate === 'string' ? body.startDate : null,
    endDate: typeof body.endDate === 'string' ? body.endDate : null,
    page: typeof body.page === 'number' ? body.page : 0,
  };

  const apiKey = Deno.env.get('TICKETMASTER_API_KEY');
  if (!apiKey) {
    return json({
      error: 'provider_not_configured',
      message: 'TICKETMASTER_API_KEY is not set for this Supabase project.',
    }, 503);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const cacheKey = cacheKeyFor(query);
  const { data: cached } = await admin
    .from('event_fetch_log').select('fetched_at').eq('cache_key', cacheKey).maybeSingle();
  const stale = !cached || Date.now() - Date.parse(cached.fetched_at) > CACHE_TTL_MS;

  let fetched = false;
  if (stale) {
    let res: Response;
    try {
      res = await fetch(buildTicketmasterUrl(apiKey, query), { headers: { Accept: 'application/json' } });
    } catch (e) {
      return json({ error: 'provider_unreachable', message: String(e) }, 502);
    }
    if (res.status === 429) return json({ error: 'rate_limited' }, 429);
    if (!res.ok) return json({ error: 'provider_error', status: res.status }, 502);

    const payload = await res.json();
    const checkedAt = new Date().toISOString();
    const byId = new Map<string, EventRowInput>();
    for (const raw of (payload?._embedded?.events ?? []) as TmEvent[]) {
      const row = normalizeTicketmasterEvent(raw, checkedAt);
      if (row) byId.set(row.external_id, row);
    }
    const rows = [...byId.values()];
    if (rows.length) {
      const { error } = await admin.from('events').upsert(rows, { onConflict: 'provider,external_id' });
      if (error) return json({ error: 'storage_error', message: error.message }, 500);
    }
    await admin.from('event_fetch_log').upsert({
      cache_key: cacheKey, provider: TICKETMASTER_PROVIDER, fetched_at: checkedAt, result_count: rows.length,
    });
    fetched = true;
  }

  // Serve from the normalized table: only mapped, not-yet-finished events.
  const { west, south, east, north } = query.bbox;
  const { data, error } = await admin.from('events').select('*')
    .eq('provider', TICKETMASTER_PROVIDER)
    .gte('latitude', south).lte('latitude', north)
    .gte('longitude', west).lte('longitude', east)
    .or(`starts_at.is.null,starts_at.gte.${new Date(Date.now() - 12 * 3600 * 1000).toISOString()}`)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(MAX_RESULTS);
  if (error) return json({ error: 'query_error', message: error.message }, 500);

  // Keyword narrowing happens here (not via PostgREST string filters) to avoid
  // filter-syntax injection from user input.
  const k = query.keyword?.trim().toLowerCase();
  const events = k
    ? (data ?? []).filter((e) =>
        [e.name, e.venue_name, e.city, e.genre, e.category].some((v) => typeof v === 'string' && v.toLowerCase().includes(k)))
    : data ?? [];

  return json({ source: TICKETMASTER_PROVIDER, fetched, events });
});
