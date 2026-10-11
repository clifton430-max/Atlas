import { describe, expect, it } from 'vitest';
import { placeToPinSource, sanitizePinSource, searchResultToPinSource } from '@/features/pins/pinSource';
import { LocalWorkspace, type KeyValueStorage } from '@/features/workspace/localWorkspace';
import { osmRefOf } from '@/services/events/geocoder';
import type { Place } from '@/features/places/types';
import type { PlaceDetails } from '@/features/places/placeDetails';

const place: Place = { ref: 'osm:node/5', osmType: 'node', osmId: 5, name: 'Cafe A', subclass: 'cafe', categoryId: 'food', subcategoryLabel: 'Cafés', latitude: 40.7, longitude: -74 };
const details = {
  ref: 'osm:node/5', name: 'Cafe A', address: '1 Main St', openingHours: 'Mo-Fr 08:00-18:00', website: 'https://cafe.example/', phone: '+1 555',
  email: 'hi@cafe.example', wheelchair: 'limited', cuisine: null, description: 'Cozy', wikipedia: null, children: [], childrenSupported: false, fetchedAt: '',
  image: { thumbUrl: 'https://upload.wikimedia.org/a.jpg', url: 'https://upload.wikimedia.org/a.jpg', width: 1, height: 1, sourcePage: 'https://commons.wikimedia.org/wiki/File:A.jpg', license: 'CC0', licenseUrl: null, artist: 'Me' },
} as PlaceDetails;

class Mem implements KeyValueStorage {
  d = new Map<string, string>();
  getItem(k: string) { return this.d.get(k) ?? null; }
  setItem(k: string, v: string) { this.d.set(k, v); }
  removeItem(k: string) { this.d.delete(k); }
}

describe('pin source normalization', () => {
  it('keeps every verified field from tiles + details', () => {
    const s = placeToPinSource(place, details);
    expect(s).toMatchObject({ v: 1, provider: 'osm', providerId: 'osm:node/5', name: 'Cafe A', category: 'Food & Drink', subcategory: 'Cafés',
      address: '1 Main St', openingHours: 'Mo-Fr 08:00-18:00', website: 'https://cafe.example/', phone: '+1 555', email: 'hi@cafe.example',
      wheelchair: 'limited', description: 'Cozy', image: { license: 'CC0', artist: 'Me' } });
  });
  it('without details it never invents fields', () => {
    const s = placeToPinSource(place, null);
    expect(s.address).toBeUndefined();
    expect(s.openingHours).toBeUndefined();
    expect(s.website).toBeUndefined();
  });
  it('rejects or strips unsafe input', () => {
    expect(sanitizePinSource({ v: 2, provider: 'osm', providerId: 'x' })).toBeNull();
    expect(sanitizePinSource({ v: 1, provider: 'evil', providerId: 'x' })).toBeNull();
    const s = sanitizePinSource({ v: 1, provider: 'osm', providerId: 'osm:node/1', website: 'javascript:alert(1)', email: 'not an email',
      image: { thumbUrl: 'https://evil.example/x.png', sourcePage: 'https://commons.wikimedia.org/wiki/File:X' }, junk: { deep: true } })!;
    expect(s.website).toBeUndefined();
    expect(s.email).toBeUndefined();
    expect(s.image).toBeUndefined();
    expect('junk' in s).toBe(false);
    expect(sanitizePinSource({ v: 1, provider: 'osm', providerId: 'x', description: 'y'.repeat(5000) })!.description).toHaveLength(1000);
  });
  it('search hits map Photon osm_type/osm_id to a stable place reference', () => {
    expect(osmRefOf('N', 123)).toBe('osm:node/123');
    expect(osmRefOf('W', '9')).toBe('osm:way/9');
    expect(osmRefOf('X', 1)).toBeNull();
    expect(searchResultToPinSource({ osmRef: null, name: 'x', detail: '', kind: null })).toBeNull();
    expect(searchResultToPinSource({ osmRef: 'osm:way/9', name: 'Park', detail: 'NYC', kind: 'park' })).toMatchObject({ providerId: 'osm:way/9', address: 'NYC' });
  });
  it('guest workspace persists the snapshot, keeps it through edits, and reloads it', () => {
    const storage = new Mem();
    const ws = new LocalWorkspace('t.src', storage);
    const map = ws.createMap({ name: 'M' });
    const g = ws.createGroup({ name: 'G', color: '#ff0000' });
    const id = ws.savePlace(map.id, place, '1 Main St', [g.id], placeToPinSource(place, details));
    ws.updatePin(id, { title: 'Renamed', note: 'mine' });
    const reloaded = new LocalWorkspace('t.src', storage).listPins(map.id).find((p) => p.id === id)!;
    expect(reloaded.title).toBe('Renamed');
    expect(reloaded.source?.openingHours).toBe('Mo-Fr 08:00-18:00');
    expect(reloaded.source?.image?.artist).toBe('Me');
    // Search-created custom pin keeps ref + source; the same place can't be added twice.
    ws.createCustomPin({ mapId: map.id, title: 'Park', latitude: 1, longitude: 1, groupIds: [g.id], placeRef: 'osm:way/9', source: searchResultToPinSource({ osmRef: 'osm:way/9', name: 'Park', detail: '', kind: 'park' }) });
    expect(() => ws.createCustomPin({ mapId: map.id, title: 'Park', latitude: 1, longitude: 1, groupIds: [g.id], placeRef: 'osm:way/9' })).toThrow(/already on this map/);
  });
});
