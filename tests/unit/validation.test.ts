import { describe, expect, it } from 'vitest';
import { safeExternalUrl, validateImageFile } from '@/lib/validation';
import { normalizeBBox } from '@/services/events/types';
import { buildDevFixtures } from '@/services/events/devFixtures';
import { zonedLocalToUtcIso } from '@/lib/timezone';

describe('safeExternalUrl', () => {
  it('allows only https without credentials', () => {
    expect(safeExternalUrl('https://ticketmaster.com/x')).toBe('https://ticketmaster.com/x');
    expect(safeExternalUrl('http://ticketmaster.com/x')).toBeNull();
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,hi')).toBeNull();
    expect(safeExternalUrl('https://user:pw@evil.com')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe('validateImageFile', () => {
  it('accepts supported images and rejects others', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toEqual({ ok: true });
    expect(validateImageFile({ type: 'image/gif', size: 1000 }).ok).toBe(false);
    expect(validateImageFile({ type: 'image/svg+xml', size: 1000 }).ok).toBe(false);
    expect(validateImageFile({ type: 'image/jpeg', size: 0 }).ok).toBe(false);
    expect(validateImageFile({ type: 'image/webp', size: 11 * 1024 * 1024 }).ok).toBe(false);
  });
});

describe('normalizeBBox', () => {
  it('clamps world-spanning and wrapped views', () => {
    expect(normalizeBBox({ west: -400, south: -100, east: 400, north: 100 })).toEqual({ west: -180, south: -90, east: 180, north: 90 });
    expect(normalizeBBox({ west: 170, south: 0, east: 190, north: 10 })).toEqual({ west: -180, south: 0, east: 180, north: 10 });
    expect(normalizeBBox({ west: -74, south: 40, east: -73, north: 41 })).toEqual({ west: -74, south: 40, east: -73, north: 41 });
  });
});

describe('dev fixtures', () => {
  it('are always flagged and labeled', () => {
    const events = buildDevFixtures(new Date('2026-10-10T12:00:00Z'));
    expect(events.length).toBeGreaterThan(5);
    for (const e of events) {
      expect(e.isDevFixture).toBe(true);
      expect(e.name.startsWith('Sample:')).toBe(true);
      expect(e.ticketUrl).toBeNull();
    }
    // Unknown location stays unknown.
    expect(events.some((e) => e.latitude === null)).toBe(true);
  });

  it('computes zoned instants correctly across DST', () => {
    expect(zonedLocalToUtcIso('2026-07-01', '20:00', 'America/New_York')).toBe('2026-07-02T00:00:00.000Z');
    expect(zonedLocalToUtcIso('2026-12-01', '20:00', 'America/New_York')).toBe('2026-12-02T01:00:00.000Z');
    expect(zonedLocalToUtcIso('2026-12-01', '20:00', 'Europe/London')).toBe('2026-12-01T20:00:00.000Z');
  });
});
