/**
 * Route distance and travel time via the `route` Edge Function (OSRM).
 * Recalculated whenever origin, destination or mode changes (query key).
 * Origins are rounded to ~11 m so tiny location jitter doesn't refetch.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type TravelMode = 'walking' | 'driving';
export interface RouteResult {
  mode: TravelMode;
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][];
  provider: string;
  attribution: string;
}
export type RouteError = 'no_route' | 'too_far' | 'rate_limited' | 'unavailable' | 'not_configured';
export class RouteFailure extends Error { constructor(public code: RouteError) { super(code); } }

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export async function fetchRoute(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }, mode: TravelMode, signal?: AbortSignal): Promise<RouteResult> {
  if (!supabase) throw new RouteFailure('not_configured');
  const { data, error } = await supabase.functions.invoke<RouteResult>('route', {
    body: { from: { lat: from.latitude, lng: from.longitude }, to: { lat: to.latitude, lng: to.longitude }, mode }, signal, timeout: 15_000,
  });
  if (error || !data) {
    const ctx = (error as { context?: Response } | null)?.context;
    let code = '';
    try { code = ctx ? ((await ctx.json()) as { error?: string }).error ?? '' : ''; } catch { /* not json */ }
    throw new RouteFailure(code === 'no_route' ? 'no_route' : code === 'too_far' ? 'too_far' : code === 'rate_limited' ? 'rate_limited' : 'unavailable');
  }
  return data;
}

export function useRoute(from: { latitude: number; longitude: number } | null, to: { latitude: number | null; longitude: number | null }, mode: TravelMode, enabled: boolean) {
  return useQuery({
    queryKey: ['route', mode, from && r4(from.latitude), from && r4(from.longitude), to.latitude, to.longitude],
    enabled: enabled && !!from && to.latitude != null && to.longitude != null,
    staleTime: 10 * 60_000,
    retry: (n, e) => !(e instanceof RouteFailure) && n < 1,
    queryFn: ({ signal }) => fetchRoute({ latitude: r4(from!.latitude), longitude: r4(from!.longitude) }, { latitude: to.latitude!, longitude: to.longitude! }, mode, signal),
  });
}

export function formatDuration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}
