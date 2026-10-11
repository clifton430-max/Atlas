import { describe, expect, it } from 'vitest';
import { categorizeSubclass, eventVisual, subclassesFor, allMarkerKeys, CATEGORIES } from '@/features/places/categories';
import { decodeOsmFeatureId, parsePlaceRef } from '@/features/places/types';
import { distanceLabel, formatDistance, haversineMeters } from '@/features/places/geo';
import { placeFromFeature } from '@/features/places/placeFromFeature';
import { commonsFileFrom, extractTags, normalizeWebsite, parseCommonsImageInfo, parseOverpassChildren, parseRef, parseWikidataP18, supportsChildren } from '../../supabase/functions/_shared/osm';

describe('categories', () => {
  it('maps real OSM subclasses to categories and leaves unknown ones out', () => {
    expect(categorizeSubclass('restaurant')?.category.id).toBe('food');
    expect(categorizeSubclass('viewpoint')?.category.id).toBe('scenic');
    expect(categorizeSubclass('museum')?.category.id).toBe('arts');
    expect(categorizeSubclass('bus_stop')).toBeNull();
    expect(categorizeSubclass(null)).toBeNull();
  });
  it('event types are color-coded only for known segments', () => {
    expect(eventVisual('Music').label).toBe('Music');
    expect(eventVisual(null)).toMatchObject({ key: 'event-unknown', label: 'Event (type unknown)' });
  });
  it('visible categories and subcategory picks drive the place filter', () => {
    expect(subclassesFor([], {})).toEqual([]);
    expect(subclassesFor(['scenic'], {})).toEqual(['viewpoint', 'peak', 'volcano']);
    expect(subclassesFor(['food'], { food: ['cafes'] })).toEqual(['cafe']);
    expect(subclassesFor(['events'], {})).toEqual([]); // events aren't places
  });
  it('every category has an icon key, color and label (never color alone)', () => {
    for (const c of CATEGORIES) { expect(c.label).toBeTruthy(); expect(c.icon.length).toBeGreaterThan(0); }
    expect(new Set(allMarkerKeys().map((k) => k.key)).size).toBe(allMarkerKeys().length);
  });
});

describe('OSM feature ids and places', () => {
  it('decodes OpenMapTiles ids (osm_id * 10 + type)', () => {
    expect(decodeOsmFeatureId(5623615532)).toEqual({ osmType: 'way', osmId: 562361553 });
    expect(decodeOsmFeatureId(70880931821)).toEqual({ osmType: 'node', osmId: 7088093182 });
    expect(decodeOsmFeatureId(123)).toEqual({ osmType: 'relation', osmId: 12 });
    expect(decodeOsmFeatureId(1234)).toBeNull();
    expect(decodeOsmFeatureId('x')).toBeNull();
    expect(parsePlaceRef('osm:way/1')).toEqual({ osmType: 'way', osmId: 1 });
    expect(parsePlaceRef('osm:way/1; drop')).toBeNull();
  });
  it('builds places only from named, categorized point features with valid coordinates', () => {
    const f = (props: Record<string, unknown>, coords: number[] = [-73.97, 40.77], id: unknown = 51) =>
      placeFromFeature({ id, properties: props, geometry: { type: 'Point', coordinates: coords } } as never);
    expect(f({ name: 'Cafe A', subclass: 'cafe' })).toMatchObject({ ref: 'osm:node/5', categoryId: 'food', subcategoryLabel: 'Cafés' });
    expect(f({ name: '', subclass: 'cafe' })).toBeNull();
    expect(f({ name: 'Bus', subclass: 'bus_stop' })).toBeNull();
    expect(f({ name: 'Bad', subclass: 'cafe' }, [0, 200])).toBeNull();
    expect(f({ name: 'NoId', subclass: 'cafe' }, undefined, 'abc')).toBeNull();
  });
});

describe('distance', () => {
  it('computes great-circle distance and words it simply ("0.7 mi away"), never "straight line"', () => {
    const esb = { latitude: 40.7484, longitude: -73.9857 };
    const tsq = { latitude: 40.758, longitude: -73.9855 };
    expect(haversineMeters(esb, tsq)).toBeGreaterThan(1050);
    expect(haversineMeters(esb, tsq)).toBeLessThan(1080);
    expect(formatDistance(1067, 'de-DE')).toBe('1.1 km');
    expect(formatDistance(250, 'de-DE')).toBe('250 m');
    expect(formatDistance(1067, 'en-US')).toBe('0.7 mi');
    expect(distanceLabel(esb, tsq, 'de-DE')).toBe('1.1 km away');
    expect(distanceLabel(esb, tsq, 'en-US')).toBe('0.7 mi away');
    expect(distanceLabel(esb, tsq, 'en-US')).not.toMatch(/straight/i);
    expect(distanceLabel(null, tsq)).toBeNull();
    expect(distanceLabel(esb, { latitude: null, longitude: null })).toBeNull();
  });
});

describe('OSM / Wikimedia parsing (place-details function)', () => {
  it('extracts only present tags; hours verbatim; https websites only', () => {
    const t = extractTags({ name: 'Cafe', 'addr:housenumber': '1', 'addr:street': 'Main St', 'addr:city': 'NYC', opening_hours: 'Mo-Fr 08:00-18:00', website: 'example.com', wikidata: 'Q42', wikipedia: 'en:Central Park' });
    expect(t).toMatchObject({ address: '1 Main St, NYC', openingHours: 'Mo-Fr 08:00-18:00', website: 'https://example.com/', wikidata: 'Q42', wikipedia: 'https://en.wikipedia.org/wiki/Central_Park', phone: null, cuisine: null });
    expect(extractTags({})).toMatchObject({ address: null, openingHours: null, website: null, wikidata: null, commonsFile: null });
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull();
    expect(normalizeWebsite('http://user:pw@x.com')).toBeNull();
    expect(extractTags({ wikidata: 'Q1; DROP' }).wikidata).toBeNull();
  });
  it('accepts only Commons-hosted images', () => {
    expect(commonsFileFrom({ wikimedia_commons: 'File:Foo.jpg' })).toBe('File:Foo.jpg');
    expect(commonsFileFrom({ image: 'https://commons.wikimedia.org/wiki/File:Bar_baz.jpg' })).toBe('File:Bar baz.jpg');
    expect(commonsFileFrom({ image: 'https://random-site.example/photo.jpg' })).toBeNull();
    expect(commonsFileFrom({ wikimedia_commons: 'Category:Parks' })).toBeNull();
    expect(parseWikidataP18({ claims: { P18: [{ mainsnak: { datavalue: { value: 'Central Park.jpg' } } }] } })).toBe('File:Central Park.jpg');
    expect(parseWikidataP18({ claims: {} })).toBeNull();
  });
  it('returns Commons images only with license and attribution', () => {
    const ok = { query: { pages: { 1: { imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', thumburl: 'https://upload.wikimedia.org/t.jpg', thumbwidth: 640, thumbheight: 480, descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: '<a href="x">Jane Doe</a>' } } }] } } } };
    expect(parseCommonsImageInfo(ok)).toMatchObject({ thumbUrl: 'https://upload.wikimedia.org/t.jpg', license: 'CC BY-SA 4.0', artist: 'Jane Doe' });
    const noLicense = structuredClone(ok);
    (noLicense.query.pages[1].imageinfo[0].extmetadata as Record<string, unknown>).LicenseShortName = undefined;
    expect(parseCommonsImageInfo(noLicense)).toBeNull();
    const offsite = structuredClone(ok);
    offsite.query.pages[1].imageinfo[0].thumburl = 'https://evil.example/t.jpg';
    expect(parseCommonsImageInfo(offsite)).toBeNull();
  });
  it('children come from area containment, deduped, excluding the parent', () => {
    const res = { elements: [
      { type: 'node', id: 1, lat: 40.77, lon: -73.97, tags: { name: 'Bethesda Fountain', historic: 'monument' } },
      { type: 'way', id: 2, center: { lat: 40.78, lon: -73.96 }, tags: { name: 'Boathouse', amenity: 'restaurant' } },
      { type: 'way', id: 9, center: { lat: 40.78, lon: -73.96 }, tags: { name: 'Self', leisure: 'park' } },
      { type: 'node', id: 3, lat: 40.77, lon: -73.97, tags: { amenity: 'cafe' } },
      { type: 'node', id: 1, lat: 40.77, lon: -73.97, tags: { name: 'Bethesda Fountain', historic: 'monument' } },
    ] };
    expect(parseOverpassChildren(res, 'osm:way/9').map((c) => c.ref)).toEqual(['osm:node/1', 'osm:way/2']);
    expect(supportsChildren('way', { leisure: 'park' })).toBe(true);
    expect(supportsChildren('node', { leisure: 'park' })).toBe(false);
    expect(supportsChildren('way', { amenity: 'restaurant' })).toBe(false);
    expect(parseRef('osm:relation/5')).toEqual({ type: 'relation', id: 5 });
    expect(parseRef('osm:relation/0')).toBeNull();
  });
});

describe('Nightlife category (redesign)', () => {
  it('bars, pubs and nightclubs are Nightlife, not Food or Things to Do', async () => {
    const { categorizeSubclass } = await import('@/features/places/categories');
    expect(categorizeSubclass('bar')?.category.id).toBe('nightlife');
    expect(categorizeSubclass('pub')?.category.id).toBe('nightlife');
    expect(categorizeSubclass('nightclub')?.category.id).toBe('nightlife');
    expect(categorizeSubclass('restaurant')?.category.id).toBe('food');
  });
  it('every OSM subclass maps to exactly one category', async () => {
    const { PLACE_CATEGORIES } = await import('@/features/places/categories');
    const seen = new Map<string, string>();
    for (const c of PLACE_CATEGORIES) for (const s of c.subcategories) for (const m of s.match) {
      expect(seen.get(m), `${m} in ${c.id} and ${seen.get(m)}`).toBeUndefined();
      seen.set(m, c.id);
    }
  });
  it('drops saved subcategory picks that no longer exist', async () => {
    const { sanitizeSubFilters } = await import('@/features/places/categories');
    expect(sanitizeSubFilters({ food: ['bars', 'cafes'], pastimes: ['nightlife'], bogus: ['x'] })).toEqual({ food: ['cafes'] });
  });
});
