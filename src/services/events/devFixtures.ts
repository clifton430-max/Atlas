/**
 * Development fixtures — clearly-labeled SAMPLE events used only when no live
 * provider is reachable (no Supabase config, or no Ticketmaster key). Every
 * record has isDevFixture = true and a "Sample:" name prefix; the UI shows a
 * persistent "Development sample data" banner whenever any are displayed.
 */
import data from './dev-fixtures.json';
import type { AtlasEvent } from '@/lib/types';
import { localDateIn, zonedLocalToUtcIso } from '@/lib/timezone';

interface FixtureDef {
  id: string; name: string; category: string; genre: string; venue: string;
  address: string | null; city: string | null; region: string | null; country: string;
  lat: number | null; lng: number | null; tz: string; dayOffset: number;
  localTime: string | null; durationMin: number | null; open: string | null; close: string | null;
  priceMin: number | null; priceMax: number | null; currency: string | null;
}

export const DEV_FIXTURE_PROVIDER = 'atlas-dev-fixture';

export function buildDevFixtures(now = new Date()): AtlasEvent[] {
  return (data.events as FixtureDef[]).map((f) => {
    const localDate = localDateIn(f.tz, f.dayOffset, now);
    const startsAt = f.localTime ? zonedLocalToUtcIso(localDate, f.localTime, f.tz) : null;
    const endsAt = startsAt && f.durationMin
      ? new Date(new Date(startsAt).getTime() + f.durationMin * 60000).toISOString()
      : null;
    return {
      id: f.id,
      provider: DEV_FIXTURE_PROVIDER,
      externalId: f.id,
      name: f.name,
      description: 'Development sample event. This is not a real listing.',
      imageUrl: null,
      category: f.category,
      genre: f.genre,
      venueName: f.venue,
      address: f.address,
      city: f.city,
      region: f.region,
      country: f.country,
      latitude: f.lat,
      longitude: f.lng,
      startsAt,
      endsAt,
      startLocalDate: localDate,
      startLocalTime: f.localTime ? `${f.localTime}:00` : null,
      timezone: f.tz,
      venueOpenTime: f.open ? `${f.open}:00` : null,
      venueCloseTime: f.close ? `${f.close}:00` : null,
      priceMin: f.priceMin,
      priceMax: f.priceMax,
      currency: f.currency,
      ticketUrl: null,
      sourceUrl: null,
      sourceName: 'Atlas development fixtures',
      status: null,
      isDevFixture: true,
      lastCheckedAt: now.toISOString(),
    };
  });
}
