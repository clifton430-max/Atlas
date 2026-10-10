/**
 * Edge Function: place-details
 *
 * Verified extra details for an OpenStreetMap place (POST { ref: "osm:way/123" }):
 *   1. OSM API element tags  -> address, opening hours (verbatim), website,
 *      phone, cuisine, description, Wikipedia/Wikidata links.
 *   2. Image: a Wikimedia Commons file explicitly linked by the element
 *      (wikimedia_commons / image tag) or by its Wikidata item (P18), returned
 *      with license and author for attribution. No other image sources.
 *   3. Contained POIs (parks, stadiums, museums, zoos…): Overpass area
 *      containment of the parent way/relation.
 *
 * Responsible use: results cached in public.place_details (tags/image 7 days,
 * children 30 days); per-client rate limit 120/min (salted IP hash); global
 * budgets per upstream; identifying User-Agent as required by the OSM and
 * Wikimedia API policies; 10 s upstream timeouts. Stale cache is served if an
 * upstream fails. Nothing secret is needed or logged.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  commonsImageInfoUrl, extractTags, OVERPASS_ENDPOINTS, overpassChildrenQuery, parseCommonsImageInfo, parseOverpassChildren,
  parseRef, parseWikidataP18, supportsChildren, USER_AGENT, wikidataImageClaimUrl,
} from '../_shared/osm.ts';

const DETAILS_TTL_MS = 7 * 86400_000;
const CHILDREN_TTL_MS = 30 * 86400_000;
const TIMEOUT_MS = 10_000;

const cors = {
  'Access-Control-Allow-Origin': (Deno.env.get('ATLAS_ALLOWED_ORIGINS') ?? '*').split(',')[0].trim() || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

async function sha256Hex(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function getJson(url: string, init: RequestInit = {}): Promise<unknown> {
  // Overpass rejects `Accept: application/json` (406), so only send it to APIs that expect it.
  const accept = /overpass/.test(url) ? '*/*' : 'application/json';
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, Accept: accept, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const body = await res.json() as { error?: { code?: string } };
  // MediaWiki APIs report failures in a 200 body; never treat those as "no data".
  if (body && typeof body === 'object' && body.error) throw new Error(`api-error ${String(body.error.code ?? 'unknown').slice(0, 40)}`);
  return body;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const raw = await req.text();
  if (raw.length > 512) return json({ error: 'too_large' }, 413);
  let ref: unknown = null;
  try { ref = JSON.parse(raw)?.ref; } catch { /* invalid */ }
  const parsed = parseRef(ref);
  if (!parsed) return json({ error: 'invalid_request' }, 400);
  const refStr = `osm:${parsed.type}/${parsed.id}`;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const take = async (bucket: string, limit: number, windowS: number) => {
    const { data, error } = await admin.rpc('edge_consume_rate_limit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowS });
    return error ? true : data === true;
  };
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await take(`pd-ip:${(await sha256Hex(`atlas-pd:${Deno.env.get('SUPABASE_URL')}:${ip}`)).slice(0, 32)}`, 120, 60))) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  const { data: cached } = await admin.from('place_details').select('*').eq('ref', refStr).maybeSingle();
  // A failed image lookup is never cached as "no image": retry it (budget-limited).
  const fresh = cached && Date.now() - Date.parse(cached.fetched_at) < DETAILS_TTL_MS && cached.details?._imageStatus !== 'error';
  let details = cached?.details ?? null;
  let tagsForChildren: Record<string, string> | null = details?._tags ?? null;

  if (!fresh) {
    try {
      if (!(await take('osm-api:sec', 2, 1))) throw new Error('budget');
      const el = await getJson(`https://api.openstreetmap.org/api/0.6/${parsed.type}/${parsed.id}.json`) as { elements?: { tags?: Record<string, string> }[] };
      const tags = el.elements?.[0]?.tags ?? {};
      const t = extractTags(tags);
      // Image: explicit Commons file first, then the Wikidata item's P18.
      let file = t.commonsFile;
      // 'none' = verified there is no linked image; 'error' = lookup failed (retried later).
      let imageStatus: 'ok' | 'none' | 'error' = 'none';
      const diag: string[] = [];
      if (!file && t.wikidata) {
        if (await take('wikidata:sec', 5, 1)) {
          try {
            file = parseWikidataP18(await getJson(wikidataImageClaimUrl(t.wikidata)));
            if (!file) diag.push('wikidata:noP18');
          } catch (e) { imageStatus = 'error'; diag.push(`wikidata:${(e as Error).message}`); }
        } else { imageStatus = 'error'; diag.push('wikidata:budget'); }
      }
      let image = null;
      if (file) {
        if (await take('commons:sec', 5, 1)) {
          try {
            image = parseCommonsImageInfo(await getJson(commonsImageInfoUrl(file)));
            imageStatus = image ? 'ok' : 'none';
            if (!image) diag.push('commons:unparsed');
          } catch (e) { imageStatus = 'error'; diag.push(`commons:${(e as Error).message}`); }
        } else { imageStatus = 'error'; diag.push('commons:budget'); }
      }
      // Keep only the whitelisted tags needed to decide on children later.
      const keep: Record<string, string> = {};
      for (const k of ['leisure', 'tourism', 'amenity']) if (tags[k]) keep[k] = tags[k];
      details = {
        name: t.name, address: t.address, openingHours: t.openingHours, website: t.website, phone: t.phone,
        cuisine: t.cuisine, description: t.description, wikipedia: t.wikipedia, image, _tags: keep,
        _imageStatus: imageStatus, _diag: diag,
      };
      tagsForChildren = keep;
      await admin.from('place_details').upsert({ ref: refStr, details, fetched_at: new Date().toISOString() });
    } catch (e) {
      console.error('[place-details] OSM/Wikimedia fetch failed:', (e as Error).message);
      if (!details) return json({ error: 'provider_error' }, 502);
    }
  }

  // Contained POIs (areas only), cached separately.
  const childrenSupported = supportsChildren(parsed.type, tagsForChildren);
  let children = cached?.children ?? null;
  const childrenFresh = cached?.children_fetched_at && Date.now() - Date.parse(cached.children_fetched_at) < CHILDREN_TTL_MS;
  if (childrenSupported && !childrenFresh && parsed.type !== 'node') {
    try {
      if (!(await take('overpass:sec', 1, 1))) throw new Error('budget');
      let res: unknown = null;
      const errors: string[] = [];
      // A dedicated instance (secret OVERPASS_URL) is tried first; public instances are often
      // overloaded and some reject cloud egress IPs.
      const preferred = Deno.env.get('OVERPASS_URL')?.trim();
      const endpoints = preferred && /^https:\/\//.test(preferred) ? [preferred, ...OVERPASS_ENDPOINTS] : OVERPASS_ENDPOINTS;
      for (const endpoint of endpoints) {
        try {
          res = await getJson(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ data: overpassChildrenQuery(parsed.type, parsed.id) }).toString(),
          });
          break;
        } catch (e) { errors.push(`${new URL(endpoint).hostname}:${(e as Error).message}`); }
      }
      if (!res) throw new Error(errors.join(' | '));
      children = parseOverpassChildren(res, refStr);
      await admin.from('place_details').update({ children, children_fetched_at: new Date().toISOString() }).eq('ref', refStr);
    } catch (e) {
      console.error('[place-details] Overpass failed:', (e as Error).message);
      // Service-only diagnostics (never returned to clients).
      await admin.from('place_details').update({ details: { ...(details ?? {}), _childrenDiag: (e as Error).message.slice(0, 80) } }).eq('ref', refStr);
    }
  }

  const { _tags: _omit, _imageStatus: _s, _diag: _d, _childrenDiag: _c, ...publicDetails } = details ?? {};
  return json({
    ref: refStr, ...publicDetails,
    children: childrenSupported ? children ?? [] : [],
    // 'unsupported' = not an area type; 'unavailable' = lookup failed (shown honestly).
    childrenStatus: !childrenSupported ? 'unsupported' : children === null ? 'unavailable' : 'ok',
    childrenSupported: childrenSupported && children !== null,
    fetchedAt: cached?.fetched_at && fresh ? cached.fetched_at : new Date().toISOString(),
  });
});
