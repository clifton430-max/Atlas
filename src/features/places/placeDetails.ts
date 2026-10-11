/**
 * Verified extra details for an OSM place, served by the `place-details`
 * Edge Function (OSM API tags + Wikimedia Commons images + contained POIs),
 * cached server-side. Cached per place on the client too, so hover never
 * re-requests. Every field may be null/empty: unknown stays unknown.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Place } from './types';

export interface PlaceImage {
  thumbUrl: string;
  url: string;
  width: number | null;
  height: number | null;
  /** Commons file page (attribution / license details). */
  sourcePage: string;
  license: string | null;
  licenseUrl: string | null;
  /** Plain-text author/credit as given on Commons. */
  artist: string | null;
}

export interface PlaceChild {
  ref: string;
  name: string;
  subclass: string;
  latitude: number;
  longitude: number;
}

export interface PlaceDetails {
  ref: string;
  name: string | null;
  address: string | null;
  /** Raw OSM opening_hours text — shown as listed, never interpreted. */
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  /** Present when the OSM element lists a plausible email (contact:email / email). */
  email?: string | null;
  /** OSM `wheelchair` tag as mapped; absent = unknown (never inferred). */
  wheelchair?: 'yes' | 'limited' | 'no' | 'designated' | null;
  cuisine: string | null;
  description: string | null;
  wikipedia: string | null;
  image: PlaceImage | null;
  /** POIs located inside this place's OSM area (parks, stadiums, museums…). */
  children: PlaceChild[];
  /** False for point features (nodes): containment can't be determined. */
  childrenSupported: boolean;
  /** 'unavailable' = the lookup failed right now (external service); shown honestly. */
  childrenStatus?: 'ok' | 'unsupported' | 'unavailable';
  fetchedAt: string;
}

export class PlaceDetailsUnavailable extends Error {}

export async function fetchPlaceDetails(ref: string, signal?: AbortSignal): Promise<PlaceDetails> {
  if (!supabase) throw new PlaceDetailsUnavailable('More details need the Atlas server, which isn’t configured here.');
  const { data, error } = await supabase.functions.invoke<PlaceDetails>('place-details', { body: { ref }, signal, timeout: 20_000 });
  if (error || !data) {
    const ctx = (error as { context?: Response } | null)?.context;
    let code = '';
    try { code = (await ctx?.clone().json())?.error ?? ''; } catch { /* ignore */ }
    throw new PlaceDetailsUnavailable(code === 'rate_limited'
      ? 'Too many detail requests — please wait a minute.'
      : 'More details for this place are unavailable right now.');
  }
  return data;
}

export function usePlaceDetails(place: Pick<Place, 'ref'> | null, enabled = true) {
  return useQuery({
    queryKey: ['placeDetails', place?.ref ?? ''],
    enabled: !!place && enabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 0,
    queryFn: ({ signal }) => fetchPlaceDetails(place!.ref, signal),
  });
}
