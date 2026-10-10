import { describe, expect, it } from 'vitest';
import { LocalWorkspace, LOCAL_SCHEMA_VERSION, validateState, type KeyValueStorage } from '@/features/workspace/localWorkspace';
import type { AtlasEvent } from '@/lib/types';

class MemStorage implements KeyValueStorage {
  data = new Map<string, string>();
  failWrites = false;
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) { this.data.delete(k); }
}

const event = (id = 'ev1'): AtlasEvent => ({
  id, provider: 'ticketmaster', externalId: id, name: 'Concert', description: null, imageUrl: null, category: 'Music', genre: null,
  venueName: 'Hall', address: null, city: 'NYC', region: null, country: 'US', latitude: 40.7, longitude: -74, startsAt: null, endsAt: null,
  startLocalDate: null, startLocalTime: null, timezone: null, venueOpenTime: null, venueCloseTime: null, priceMin: null, priceMax: null,
  currency: null, ticketUrl: null, sourceUrl: null, sourceName: 'Ticketmaster', status: null, isDevFixture: false, lastCheckedAt: null,
});

function setup() {
  const storage = new MemStorage();
  const ws = new LocalWorkspace('test.ws', storage);
  const map = ws.createMap({ name: 'Trip' });
  const g1 = ws.createGroup({ name: 'Food', color: '#ff0000', icon: 'utensils' });
  const g2 = ws.createGroup({ name: 'Music', color: '#00ff00' });
  return { storage, ws, map, g1, g2 };
}

describe('LocalWorkspace business rules (mirror the database)', () => {
  it('persists across instances (refresh) with a versioned schema', () => {
    const { storage, ws, map, g1 } = setup();
    ws.createCustomPin({ mapId: map.id, title: 'Cafe', latitude: 1, longitude: 2, groupIds: [g1.id] });
    const again = new LocalWorkspace('test.ws', storage);
    expect(again.listMaps().map((m) => m.name)).toEqual(['Trip']);
    expect(again.listPins(map.id)[0]).toMatchObject({ title: 'Cafe', groupIds: [g1.id] });
    expect(JSON.parse(storage.getItem('test.ws')!).version).toBe(LOCAL_SCHEMA_VERSION);
  });

  it('requires a group when saving and never duplicates a saved event', () => {
    const { ws, map, g1, g2 } = setup();
    expect(() => ws.saveEvent(map.id, event(), [])).toThrow(/at least one group/);
    const a = ws.saveEvent(map.id, event(), [g1.id]);
    const b = ws.saveEvent(map.id, event(), [g1.id, g2.id]);
    expect(b).toBe(a);
    expect(ws.listPins(map.id)).toHaveLength(1);
    expect(ws.listPins(map.id)[0].groupIds).toEqual([g1.id, g2.id]);
    expect(() => ws.createCustomPin({ mapId: map.id, title: 'x', latitude: 1, longitude: 1, groupIds: [] })).toThrow(/at least one group/);
  });

  it('enforces unique group names case-insensitively and keeps pins when a group is deleted', () => {
    const { ws, map, g1, g2 } = setup();
    expect(() => ws.createGroup({ name: 'food', color: '#000000' })).toThrow(/already have/);
    const pin = ws.createCustomPin({ mapId: map.id, title: 'P', latitude: 1, longitude: 1, groupIds: [g1.id, g2.id] });
    ws.deleteGroup(g1.id);
    expect(ws.listPins(map.id).find((p) => p.id === pin)!.groupIds).toEqual([g2.id]);
  });

  it('moves pins (location and map) and blocks duplicate events on the destination', () => {
    const { ws, map, g1 } = setup();
    const other = ws.createMap({ name: 'Other' });
    const pin = ws.createCustomPin({ mapId: map.id, title: 'P', latitude: 1, longitude: 1, groupIds: [g1.id] });
    ws.updatePin(pin, { latitude: 3, longitude: 4, mapId: other.id });
    expect(ws.listPins(other.id)[0]).toMatchObject({ latitude: 3, longitude: 4 });
    ws.saveEvent(map.id, event(), [g1.id]);
    const ev2 = ws.saveEvent(other.id, event(), [g1.id]);
    expect(() => ws.updatePin(ev2, { mapId: map.id })).toThrow(/already saved/);
    expect(() => ws.updatePin(ev2, { latitude: 1, longitude: 1 })).toThrow(/event’s own location/);
  });

  it('deleting a map deletes its pins and unused images', () => {
    const { ws, map, g1 } = setup();
    const pin = ws.createCustomPin({ mapId: map.id, title: 'P', latitude: 1, longitude: 1, groupIds: [g1.id] });
    const img = ws.addImage({ dataUrl: 'data:image/png;base64,iVBOR', mimeType: 'image/png', byteSize: 10, width: 1, height: 1 });
    ws.updateAppearance(pin, { ...ws.listPins(map.id)[0].appearance, imageId: img.id });
    ws.deleteMap(map.id);
    expect(ws.listPins()).toEqual([]);
    expect(ws.snapshot().images).toEqual([]);
  });

  it('keeps an image while a demo shared copy still uses it', () => {
    const { ws, map, g1 } = setup();
    const pin = ws.createCustomPin({ mapId: map.id, title: 'P', latitude: 1, longitude: 1, groupIds: [g1.id] });
    const img = ws.addImage({ dataUrl: 'data:image/png;base64,iVBOR', mimeType: 'image/png', byteSize: 10, width: 1, height: 1 });
    ws.updateAppearance(pin, { ...ws.listPins(map.id)[0].appearance, imageId: img.id });
    ws.shareToDemo(pin, { includeNote: false, includeAppearance: true });
    ws.deletePin(pin);
    expect(ws.imageDataUrl(img.id)).not.toBeNull();
    expect(ws.tryDeleteImage(img.id)).toBe(false);
    ws.removeDemoShare(ws.snapshot().demo.shares[0].id);
    expect(ws.snapshot().images).toHaveLength(1); // only GC'd by the next pin/map change
    expect(ws.tryDeleteImage(img.id)).toBe(true);
  });

  it('demo sharing copies only opted-in fields and never edits the original', () => {
    const { ws, map, g1 } = setup();
    const pin = ws.createCustomPin({ mapId: map.id, title: 'P', note: 'secret', latitude: 1, longitude: 1, groupIds: [g1.id] });
    ws.shareToDemo(pin, { includeNote: false, includeAppearance: true });
    expect(ws.snapshot().demo.shares[0]).toMatchObject({ title: 'P', note: null });
    ws.removeDemoShare(ws.snapshot().demo.shares[0].id);
    expect(ws.listPins(map.id)[0].note).toBe('secret');
  });
});

describe('LocalWorkspace failure handling', () => {
  it('rejects a change atomically when storage is full', () => {
    const { storage, ws } = setup();
    storage.failWrites = true;
    expect(() => ws.createMap({ name: 'Too much' })).toThrow(/storage is full/);
    expect(ws.listMaps().map((m) => m.name)).toEqual(['Trip']); // in-memory state unchanged
  });

  it('backs up unreadable data and starts fresh with a notice', () => {
    const storage = new MemStorage();
    storage.setItem('test.ws', '{not json');
    const ws = new LocalWorkspace('test.ws', storage);
    expect(ws.listMaps()).toEqual([]);
    expect(ws.loadNotice).toMatch(/couldn’t be read|could not be read/);
    expect(storage.getItem('test.ws.corrupt-backup')).toBe('{not json');
  });

  it('works in memory when browser storage is unavailable', () => {
    const ws = new LocalWorkspace('x', null);
    expect(ws.persistent).toBe(false);
    ws.createMap({ name: 'Ephemeral' });
    expect(ws.listMaps()).toHaveLength(1);
  });

  it('drops invalid records and dangling references on load', () => {
    const { state, dropped } = validateState({
      version: LOCAL_SCHEMA_VERSION, createdAt: new Date().toISOString(),
      maps: [{ id: 'm', name: 'Ok', createdAt: new Date().toISOString() }, { id: 'bad', name: '' }],
      groups: [{ id: 'g', name: 'G', color: '#123456' }, { id: 'g2', name: 'g', color: '#123456' }, { id: 'g3', name: 'Bad', color: 'red' }],
      pins: [
        { id: 'p', mapId: 'm', kind: 'custom', title: 'T', latitude: 1, longitude: 1, groupIds: ['g', 'nope'], appearance: { shape: 'hexagon', size: 999, imageId: 'missing' } },
        { id: 'p2', mapId: 'gone', kind: 'custom', title: 'T', latitude: 1, longitude: 1, appearance: {} },
        { id: 'p3', mapId: 'm', kind: 'custom', title: 'T', latitude: 200, longitude: 1, appearance: {} },
      ],
      images: [{ id: 'i', dataUrl: 'javascript:alert(1)', byteSize: 1 }],
    });
    expect(state.maps.map((m) => m.id)).toEqual(['m']);
    expect(state.groups.map((g) => g.id)).toEqual(['g']);
    expect(state.pins).toHaveLength(1);
    expect(state.pins[0].groupIds).toEqual(['g']);
    expect(state.pins[0].appearance).toMatchObject({ shape: 'circle', size: 32, imageId: null });
    expect(state.images).toEqual([]);
    expect(dropped).toBeGreaterThanOrEqual(6);
    expect(validateState({ version: 999 }).state.maps).toEqual([]);
  });
});
