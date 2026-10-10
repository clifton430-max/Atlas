/**
 * Single Supabase client for the browser, created with the PUBLIC anon key.
 * Every query it makes is subject to Row Level Security, so the UI is never
 * the authority on who can see or change what.
 *
 * When Supabase is not configured, `supabase` is null and the app runs in a
 * limited "Discover with development sample data" mode.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';
import type { Database } from './database.types';

/** Typed client: table/RPC names, columns and arguments are checked against the
 *  real schema (regenerate with `npm run types:generate` after migrations). */
export type AtlasClient = SupabaseClient<Database>;

/**
 * True when this page load is the landing of a password-recovery link.
 * Captured BEFORE createClient(), which consumes and strips the URL fragment
 * and may emit PASSWORD_RECOVERY before any React listener is attached.
 */
export const initialPasswordRecovery: boolean =
  typeof window !== 'undefined' &&
  (/(^|[#&])type=recovery(&|$)/.test(window.location.hash) || new URLSearchParams(window.location.search).get('type') === 'recovery');

export const supabase: AtlasClient | null = isSupabaseConfigured
  ? createClient<Database>(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Returns the client or throws a clear configuration error. */
export function requireSupabase(): AtlasClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

/**
 * Unwrap a Supabase response, converting PostgREST/Postgres errors into
 * Error instances with a human-readable message.
 */
// The client is untyped (no generated Database types), so results are `any`
// here and mapped into explicit domain types by each feature's API module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrap(res: { data: unknown; error: { message: string; code?: string } | null }): any {
  if (res.error) throw new AtlasDataError(res.error.message, res.error.code);
  return res.data;
}

export class AtlasDataError extends Error {
  constructor(message: string, public code?: string) {
    super(friendlyMessage(message, code));
    this.name = 'AtlasDataError';
  }
}

function friendlyMessage(message: string, code?: string): string {
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return /row-level security|permission denied/i.test(message)
      ? 'You do not have permission to do that.'
      : message;
  }
  if (code === '23505' && /groups_owner_name_uniq/.test(message)) return 'You already have a group with that name.';
  if (code === '23505' && /profiles_username_key/.test(message)) return 'That username is taken.';
  return message;
}
