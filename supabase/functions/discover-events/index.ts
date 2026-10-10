/**
 * Edge Function: discover-events
 *
 * Public, read-only proxy for the Ticketmaster Discovery API. The API key
 * lives only in the server-side secret TICKETMASTER_API_KEY and never appears
 * in responses or logs.
 *
 * Flow:
 *   1. Validate/constrain the request (parseDiscoverRequest).
 *   2. Abuse control: per-client fixed-window limit (client IP is only stored
 *      as a salted SHA-256 hash) via edge_consume_rate_limit().
 *   3. If this viewport+filter combination was fetched within CACHE_TTL, the
 *      global Ticketmaster budget (per second / per day) is exhausted, or the
 *      provider is in failure backoff (bad key: 5 min, 429: 60 s, timeout/5xx:
 *      60 s per viewport), serve from public.events instead of calling it.
 *   4. Otherwise call Ticketmaster (8 s timeout), normalize, and upsert into
 *      public.events keyed by (provider, external_id) — no duplicates.
 *   5. Return events in the bbox from the database, labelled with where they
 *      came from and how fresh they are.
 *
 * Response (200):
 *   { source: 'ticketmaster' | 'cache', fetched: boolean, stale: boolean,
 *     cachedAt: string | null, warning?: string, events: EventRow[] }
 *   - source 'ticketmaster' + fetched=true  -> fetched from Ticketmaster just now
 *   - source 'cache' + stale=false          -> served from a fresh (<15 min) cache entry
 *   - source 'cache' + stale=true           -> provider unavailable; data may be outdated
 * Errors: 400 invalid_request, 413 too_large, 429 rate_limited, 405, 500.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildTicketmasterUrl,
  cacheKeyFor,
  normalizeTicketmasterEvent,
  parseDiscoverRequest,
  TICKETMASTER_PROVIDER,
  type EventRowInput,
  type TmEvent,
} from '../_shared/ticketmaster.ts';

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_RESULTS = 500;
// Ticketmaster returns 100 events per page sorted by date; fetch a few pages so
// dense areas aren't limited to today's earliest listings.
const MAX_PAGES = 3;
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 4096;
// Abuse control. Ticketmaster's default tier allows 5 req/s and 5000/day.
const CLIENT_LIMIT_PER_MINUTE = 60;
const TM_LIMIT_PER_SECOND = 4;
const TM_LIMIT_PER_DAY = 4500;
// Failure backoff (seconds) so a failing provider is not retried on every request.
const BACKOFF_AUTH_S = 300;
const BACKOFF_RATE_S = 60;
const BACKOFF_ERROR_S = 60;
const GLOBAL_KEY = '__global__';

const ALLOWED_ORIGINS = (Deno.env.get('ATLAS_ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim()).filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(req, { error: 'too_large' }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(req, { error: 'invalid_request', message: 'Body must be JSON.' }, 400);
  }
  const query = parseDiscoverRequest(body);
  if (!query) return json(req, { error: 'invalid_request', message: 'A valid bbox is required.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const take = async (bucket: string, limit: number, windowS: number) => {
    const { data, error } = await admin.rpc('edge_consume_rate_limit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowS });
    if (error) {
      console.error('[discover-events] rate limiter unavailable:', error.message);
      return true; // fail open on limiter errors; the cache still protects the provider
    }
    return data === true;
  };

  // ---- Per-client abuse control (salted hash; raw IPs are never stored) ----
  const ipHash = await sha256Hex(`atlas-rl:${Deno.env.get('SUPABASE_URL')}:${clientIp(req)}`);
  if (!(await take(`ip:${ipHash.slice(0, 32)}`, CLIENT_LIMIT_PER_MINUTE, 60))) {
    return json(req, { error: 'rate_limited', message: 'Too many requests. Please slow down.' }, 429, { 'Retry-After': '60' });
  }

  // ---- Cache lookup ----
  const cacheKey = cacheKeyFor(query);
  const { data: logRows } = await admin
    .from('event_fetch_log').select('cache_key, fetched_at, last_error, retry_after, total_available').in('cache_key', [cacheKey, GLOBAL_KEY]);
  const cached = logRows?.find((r) => r.cache_key === cacheKey && r.last_error === null) ?? null;
  const cacheFresh = !!cached && Date.now() - Date.parse(cached.fetched_at) <= CACHE_TTL_MS;
  // Auth-failure backoff is tied to a short, non-reversible fingerprint of the
  // key, so replacing the secret takes effect on the next request.
  const rawKey = Deno.env.get('TICKETMASTER_API_KEY')?.trim().replace(/^["']|["']$/g, '') ?? '';
  const keyFp = rawKey ? (await sha256Hex(`atlas-tm:${rawKey}`)).slice(0, 12) : '';
  // Active backoff (global first, then this viewport). Codes are stored as "code" or "code@fingerprint".
  const backoff = (logRows ?? []).find((r) => {
    if (!r.retry_after || Date.parse(r.retry_after) <= Date.now()) return false;
    const [, fp] = (r.last_error ?? '').split('@');
    return !fp || fp === keyFp;
  });
  const recordFailure = async (key: string, code: string, seconds: number) => {
    const now = new Date();
    await admin.from('event_fetch_log').upsert({
      cache_key: key, provider: TICKETMASTER_PROVIDER, fetched_at: now.toISOString(), result_count: 0,
      last_error: code, retry_after: new Date(now.getTime() + seconds * 1000).toISOString(),
    });
  };

  let fetched = false;
  let totalAvailable: number | null = cached?.total_available ?? null;
  let warning: string | undefined;
  let cachedAt: string | null = cached?.fetched_at ?? null;

  if (!cacheFresh) {
    // Tolerate accidental whitespace/quotes around the stored secret.
    const apiKey = rawKey;
    if (!apiKey) {
      warning = 'provider_not_configured';
    } else if (backoff) {
      warning = (backoff.last_error ?? 'provider_error').split('@')[0];
    } else if (!(await take('tm:second', TM_LIMIT_PER_SECOND, 1)) || !(await take('tm:day', TM_LIMIT_PER_DAY, 86400))) {
      warning = 'provider_budget_exhausted';
    } else {
      const checkedAt = new Date().toISOString();
      const byId = new Map<string, EventRowInput>();
      let ok = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        // Each additional page must also fit in the global per-second/day budget.
        if (page > 0 && (!(await take('tm:second', TM_LIMIT_PER_SECOND, 1)) || !(await take('tm:day', TM_LIMIT_PER_DAY, 86400)))) break;
        let res: Response | null = null;
        try {
          res = await fetch(buildTicketmasterUrl(apiKey, { ...query, page }), {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          });
        } catch (e) {
          if (page === 0) {
            warning = (e as Error).name === 'TimeoutError' ? 'provider_timeout' : 'provider_unreachable';
            console.error('[discover-events] upstream fetch failed:', (e as Error).name);
            await recordFailure(cacheKey, warning, BACKOFF_ERROR_S);
          }
          break;
        }
        if (!res.ok) {
          // Log only status + Ticketmaster's fault code (never the URL, which contains the key).
          let fault = '';
          try {
            const b = await res.json();
            fault = b?.fault?.detail?.errorcode ?? b?.errors?.[0]?.code ?? '';
          } catch { /* ignore */ }
          console.error(`[discover-events] Ticketmaster responded ${res.status} ${fault} (page ${page})`);
          if (page === 0) {
            warning = res.status === 401 || res.status === 403 ? 'provider_auth_failed'
              : res.status === 429 ? 'provider_rate_limited' : 'provider_error';
            if (warning === 'provider_auth_failed') await recordFailure(GLOBAL_KEY, `${warning}@${keyFp}`, BACKOFF_AUTH_S);
            else if (warning === 'provider_rate_limited') await recordFailure(GLOBAL_KEY, warning, BACKOFF_RATE_S);
            else await recordFailure(cacheKey, warning, BACKOFF_ERROR_S);
          }
          break;
        }
        const payload = await res.json().catch(() => null);
        ok = true;
        for (const rawEvent of (payload?._embedded?.events ?? []) as TmEvent[]) {
          const row = normalizeTicketmasterEvent(rawEvent, checkedAt);
          if (row) byId.set(row.external_id, row);
        }
        const total = Number(payload?.page?.totalElements);
        if (Number.isFinite(total)) totalAvailable = total;
        const totalPages = Number(payload?.page?.totalPages ?? 1);
        if (!Number.isFinite(totalPages) || page + 1 >= totalPages) break;
      }
      if (ok) {
        const rows = [...byId.values()];
        if (rows.length) {
          const { error } = await admin.from('events').upsert(rows, { onConflict: 'provider,external_id' });
          if (error) {
            console.error('[discover-events] upsert failed:', error.message);
            return json(req, { error: 'storage_error' }, 500);
          }
        }
        await admin.from('event_fetch_log').upsert({
          cache_key: cacheKey, provider: TICKETMASTER_PROVIDER, fetched_at: checkedAt, result_count: rows.length,
          last_error: null, retry_after: null, total_available: totalAvailable,
        });
        fetched = true;
        cachedAt = checkedAt;
      }
    }
  }

  // ---- Serve from the normalized table: mapped, not-yet-finished events ----
  const { west, south, east, north } = query.bbox;
  let q = admin.from('events').select('*')
    .eq('provider', TICKETMASTER_PROVIDER)
    .gte('latitude', south).lte('latitude', north)
    .gte('longitude', west).lte('longitude', east)
    .or(`starts_at.is.null,starts_at.gte.${new Date(Date.now() - 12 * 3600 * 1000).toISOString()}`)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(MAX_RESULTS);
  if (query.startDate) q = q.gte('start_local_date', query.startDate);
  if (query.endDate) q = q.lte('start_local_date', query.endDate);
  if (query.category) q = q.eq('category', query.category);
  const { data, error } = await q;
  if (error) {
    console.error('[discover-events] query failed:', error.message);
    return json(req, { error: 'query_error' }, 500);
  }

  // Keyword narrowing in code (not PostgREST filter strings) to avoid filter injection.
  const k = query.keyword?.toLowerCase();
  const events = k
    ? (data ?? []).filter((e) =>
        [e.name, e.venue_name, e.city, e.genre, e.category].some((v) => typeof v === 'string' && v.toLowerCase().includes(k)))
    : data ?? [];

  return json(req, {
    source: fetched ? TICKETMASTER_PROVIDER : 'cache',
    fetched,
    stale: !fetched && !cacheFresh,
    cachedAt,
    // How many events Ticketmaster reported for this area (null if unknown).
    totalAvailable,
    ...(warning ? { warning } : {}),
    events,
  });
});
