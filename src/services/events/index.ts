/**
 * Provider selection. With Supabase configured we use the Edge Function
 * backed provider; otherwise local development fixtures.
 */
import { supabase } from '@/lib/supabase';
import { LocalFixtureProvider } from './fixtureProvider';
import { SupabaseEventProvider } from './supabaseProvider';
import type { EventProvider } from './types';

export const eventProvider: EventProvider = supabase
  ? new SupabaseEventProvider(supabase)
  : new LocalFixtureProvider();

export * from './types';
