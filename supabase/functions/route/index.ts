/**
 * Edge Function: route
 *
 * POST { from: {lat,lng}, to: {lat,lng}, mode: "walking" | "driving" }
 *   -> { mode, distanceMeters, durationSeconds, geometry, provider, attribution }
 *   -> 404 { error: "no_route" } when the destination can't be reached
 *
 * Responsible use: per-client rate limit (salted IP hash) and a global budget
 * for the public FOSSGIS OSRM instance; identifying User-Agent; 10 s timeout.
 * Coordinates are used only to compute the route — never logged or stored.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_ROUTING_BASE, osrmUrl, parseOsrm, parseRouteRequest } from '../_shared/routing.ts';
import { USER_AGENT } from '../_shared/osm.ts';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const raw = await req.text();
  if (raw.length > 512) return json({ error: 'too_large' }, 413);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { /* invalid */ }
  const parsed = parseRouteRequest(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const take = async (bucket: string, limit: number, windowS: number) => {
    const { data, error } = await admin.rpc('edge_consume_rate_limit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowS });
    return error ? false : data === true; // fail closed: protect the shared public routing server
  };
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await take(`route-ip:${(await sha256Hex(`atlas-route:${Deno.env.get('SUPABASE_URL')}:${ip}`)).slice(0, 32)}`, 20, 60))) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }
  if (!(await take('route:global', 60, 60))) return json({ error: 'busy' }, 503, { 'Retry-After': '30' });

  try {
    const base = Deno.env.get('ROUTING_BASE_URL') || DEFAULT_ROUTING_BASE;
    const res = await fetch(osrmUrl(base, parsed), { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok && res.status !== 400) throw new Error(`upstream ${res.status}`);
    const route = parseOsrm(await res.json(), parsed.mode);
    if (!route) return json({ error: 'no_route' }, 404);
    return json(route);
  } catch (e) {
    console.error('[route] provider failed:', (e as Error).message);
    return json({ error: 'provider_error' }, 502);
  }
});
