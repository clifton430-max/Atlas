/**
 * Loads live-test configuration from .env (public URL + anon key) and
 * .env.live.local (dedicated test accounts). Values are never logged.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

function parse(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...parse('.env'), ...parse('.env.live.local'), ...process.env } as Record<string, string | undefined>;

export const LIVE = {
  url: env.VITE_SUPABASE_URL ?? '',
  anonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
  users: (['A', 'B', 'C'] as const).map((id) => ({
    id,
    email: env[`ATLAS_LIVE_${id}_EMAIL`] ?? '',
    password: env[`ATLAS_LIVE_${id}_PASSWORD`] ?? '',
  })),
};

export const liveConfigured = !!(LIVE.url && LIVE.anonKey && LIVE.users.every((u) => u.email && u.password));

export function anonClient(): SupabaseClient {
  return createClient(LIVE.url, LIVE.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as never },
  });
}

export async function signedIn(which: 'A' | 'B' | 'C'): Promise<{ client: SupabaseClient; userId: string }> {
  const u = LIVE.users.find((x) => x.id === which)!;
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error || !data.user) throw new Error(`Sign-in failed for test user ${which}: ${error?.message}`);
  return { client, userId: data.user.id };
}

/** 1×1 opaque PNG (valid image bytes) for Storage tests. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Admin helper for tests that need privileged Auth actions (recovery links,
 * restoring a test password). The service key is fetched from the logged-in
 * Supabase CLI into memory only — never logged or written.
 */
export async function withAdmin<T>(fn: (admin: SupabaseClient) => Promise<T>): Promise<T> {
  const { execFileSync } = await import('node:child_process');
  const ref = new URL(LIVE.url).hostname.split('.')[0];
  const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as { name?: string; api_key?: string }[];
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!service) throw new Error('Supabase CLI could not provide a service key');
  const admin = createClient(LIVE.url, service, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as never } });
  return fn(admin);
}
