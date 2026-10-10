/**
 * LocalWorkspace — a browser-local, versioned, validated store that mirrors
 * the server-side semantics of personal maps, groups, pins and images.
 *
 * Used for:
 *   - Guest Mode ('atlas.guest.v1'): persists across refreshes on this device.
 *   - Tutorial sandbox ('atlas.sandbox.v1'): disposable practice data.
 *
 * Guarantees:
 *   - NEVER talks to Supabase. Guest data stays on this device unless the user
 *     explicitly imports it after signing in (see importGuestData.ts).
 *   - The same business rules as the database: at least one group when saving,
 *     no duplicate saved event per map, unique group names (case-insensitive),
 *     deleting a group never deletes pins, deleting a map deletes its pins,
 *     images can't be deleted while referenced.
 *   - Atomic commits: a mutation is applied to a copy and only becomes current
 *     once it has been persisted. If storage is full, the change is rejected
 *     and the previous state is kept.
 *   - Data loaded from storage is validated record-by-record; malformed records
 *     are dropped and unreadable data is backed up instead of crashing the app.
 */
import { DEFAULT_APPEARANCE, type AtlasEvent, type Group, type ImageMask, type PersonalMap, type Pin, type PinAppearance, type PinShape } from '@/lib/types';
import { isValidLatLng } from '@/lib/validation';

export const LOCAL_SCHEMA_VERSION = 1;

export interface LocalMap extends PersonalMap { updatedAt: string }
export interface LocalGroup extends Group { createdAt: string }
export interface LocalImage { id: string; dataUrl: string; mimeType: string; byteSize: number; width: number; height: number; createdAt: string }
export interface LocalPin {
  id: string; mapId: string; kind: 'event' | 'custom'; eventId: string | null; event: AtlasEvent | null;
  title: string | null; note: string | null; latitude: number | null; longitude: number | null; address: string | null;
  appearance: PinAppearance; groupIds: string[]; createdAt: string; updatedAt: string;
}
/** Demonstration-only collaboration state (never server-backed; always labelled "Demo"). */
export interface DemoMember { id: string; name: string; role: 'owner' | 'editor' | 'viewer'; isYou: boolean }
export interface DemoShare {
  id: string; sourcePinId: string; title: string; note: string | null; latitude: number; longitude: number;
  appearance: PinAppearance; imageId: string | null; createdAt: string;
}
export interface LocalState {
  version: typeof LOCAL_SCHEMA_VERSION;
  createdAt: string;
  maps: LocalMap[];
  groups: LocalGroup[];
  pins: LocalPin[];
  images: LocalImage[];
  demo: { mapName: string; members: DemoMember[]; shares: DemoShare[] };
  prefs: { mapStyle: 'positron' | 'bright' | 'liberty' };
}

export class LocalWorkspaceError extends Error {
  constructor(message: string, public code: 'validation' | 'not_found' | 'conflict' | 'storage_full' | 'in_use') {
    super(message);
    this.name = 'LocalWorkspaceError';
  }
}

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const HEX = /^#[0-9a-fA-F]{6}$/;
const SHAPES: PinShape[] = ['circle', 'square', 'rounded', 'diamond', 'star'];
const MASKS: ImageMask[] = ['circle', 'rounded', 'square'];
const MAX_LOCAL_IMAGE_BYTES = 2 * 1024 * 1024;

function defaultDemo(): LocalState['demo'] {
  return {
    mapName: 'Weekend trip (demo)',
    members: [
      { id: 'demo-you', name: 'You', role: 'owner', isYou: true },
      { id: 'demo-sam', name: 'Sam (sample editor)', role: 'editor', isYou: false },
      { id: 'demo-riley', name: 'Riley (sample viewer)', role: 'viewer', isYou: false },
    ],
    shares: [],
  };
}

export function emptyState(): LocalState {
  return { version: LOCAL_SCHEMA_VERSION, createdAt: now(), maps: [], groups: [], pins: [], images: [], demo: defaultDemo(), prefs: { mapStyle: 'positron' } };
}

// ---------------------------------------------------------------------------
// Validation (mirrors database CHECK constraints)
// ---------------------------------------------------------------------------
const str = (v: unknown, min: number, max: number) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const optStr = (v: unknown, max: number) => v == null || (typeof v === 'string' && v.length <= max);
const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function validAppearance(a: unknown): PinAppearance | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as Record<string, unknown>;
  const out: PinAppearance = {
    color: x.color == null ? null : HEX.test(String(x.color)) ? String(x.color) : null,
    shape: SHAPES.includes(x.shape as PinShape) ? (x.shape as PinShape) : 'circle',
    icon: typeof x.icon === 'string' && x.icon.length <= 40 ? x.icon : null,
    size: typeof x.size === 'number' && x.size >= 20 && x.size <= 72 ? Math.round(x.size) : 32,
    borderColor: x.borderColor == null ? null : HEX.test(String(x.borderColor)) ? String(x.borderColor) : null,
    borderWidth: typeof x.borderWidth === 'number' && x.borderWidth >= 0 && x.borderWidth <= 6 ? Math.round(x.borderWidth) : 2,
    imageId: typeof x.imageId === 'string' ? x.imageId : null,
    imageMask: MASKS.includes(x.imageMask as ImageMask) ? (x.imageMask as ImageMask) : 'circle',
  };
  return out;
}

/** Validate untrusted persisted data. Returns a clean state plus the number of dropped records. */
export function validateState(raw: unknown): { state: LocalState; dropped: number } {
  const s = emptyState();
  let dropped = 0;
  if (!raw || typeof raw !== 'object') return { state: s, dropped: 1 };
  const r = raw as Record<string, unknown>;
  if (r.version !== LOCAL_SCHEMA_VERSION) return { state: s, dropped: 1 };
  if (isIso(r.createdAt)) s.createdAt = r.createdAt as string;

  for (const m of Array.isArray(r.maps) ? r.maps : []) {
    if (m && typeof m.id === 'string' && str(m.name, 1, 80) && optStr(m.description, 500) && isIso(m.createdAt)) {
      s.maps.push({ id: m.id, name: m.name, description: m.description ?? null, createdAt: m.createdAt, updatedAt: isIso(m.updatedAt) ? m.updatedAt : m.createdAt });
    } else dropped++;
  }
  const names = new Set<string>();
  for (const g of Array.isArray(r.groups) ? r.groups : []) {
    const key = typeof g?.name === 'string' ? g.name.trim().toLowerCase() : '';
    if (g && typeof g.id === 'string' && str(g.name, 1, 40) && HEX.test(g.color) && optStr(g.icon, 40) && !names.has(key)) {
      names.add(key);
      s.groups.push({ id: g.id, name: g.name, color: g.color, icon: g.icon ?? null, createdAt: isIso(g.createdAt) ? g.createdAt : now() });
    } else dropped++;
  }
  for (const i of Array.isArray(r.images) ? r.images : []) {
    if (i && typeof i.id === 'string' && typeof i.dataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(i.dataUrl)
      && typeof i.byteSize === 'number' && i.byteSize > 0 && i.byteSize <= MAX_LOCAL_IMAGE_BYTES) {
      s.images.push({ id: i.id, dataUrl: i.dataUrl, mimeType: String(i.mimeType), byteSize: i.byteSize, width: Number(i.width) || 256, height: Number(i.height) || 256, createdAt: isIso(i.createdAt) ? i.createdAt : now() });
    } else dropped++;
  }
  const mapIds = new Set(s.maps.map((m) => m.id));
  const groupIds = new Set(s.groups.map((g) => g.id));
  const imageIds = new Set(s.images.map((i) => i.id));
  const eventKeys = new Set<string>();
  for (const p of Array.isArray(r.pins) ? r.pins : []) {
    const appearance = validAppearance(p?.appearance);
    const ok = p && typeof p.id === 'string' && mapIds.has(p.mapId) && appearance
      && (p.kind === 'custom'
        ? str(p.title, 1, 120) && isValidLatLng(p.latitude, p.longitude)
        : p.kind === 'event' && typeof p.eventId === 'string' && p.event && typeof p.event.name === 'string' && !eventKeys.has(`${p.mapId}:${p.eventId}`))
      && optStr(p.note, 5000) && optStr(p.address, 300);
    if (!ok) { dropped++; continue; }
    if (p.kind === 'event') eventKeys.add(`${p.mapId}:${p.eventId}`);
    if (appearance.imageId && !imageIds.has(appearance.imageId)) appearance.imageId = null;
    s.pins.push({
      id: p.id, mapId: p.mapId, kind: p.kind, eventId: p.kind === 'event' ? p.eventId : null, event: p.kind === 'event' ? p.event : null,
      title: p.title ?? null, note: p.note ?? null,
      latitude: p.kind === 'custom' ? p.latitude : null, longitude: p.kind === 'custom' ? p.longitude : null,
      address: p.address ?? null, appearance,
      groupIds: Array.isArray(p.groupIds) ? [...new Set<string>(p.groupIds.filter((g: unknown) => typeof g === 'string' && groupIds.has(g as string)))] : [],
      createdAt: isIso(p.createdAt) ? p.createdAt : now(), updatedAt: isIso(p.updatedAt) ? p.updatedAt : now(),
    });
  }
  const demo = r.demo as Record<string, unknown> | undefined;
  if (demo && Array.isArray(demo.members) && demo.members.every((m) => m && typeof m.id === 'string' && ['owner', 'editor', 'viewer'].includes(m.role))) {
    s.demo.members = demo.members as DemoMember[];
    s.demo.shares = (Array.isArray(demo.shares) ? demo.shares : []).filter((x) => x && typeof x.id === 'string' && isValidLatLng(x.latitude, x.longitude) && validAppearance(x.appearance)) as DemoShare[];
  }
  const prefs = r.prefs as Record<string, unknown> | undefined;
  if (prefs && ['positron', 'bright', 'liberty'].includes(prefs.mapStyle as string)) s.prefs.mapStyle = prefs.mapStyle as LocalState['prefs']['mapStyle'];
  return { state: s, dropped };
}

// ---------------------------------------------------------------------------
// Storage adapter (injectable for tests)
// ---------------------------------------------------------------------------
export interface KeyValueStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function probeStorage(): KeyValueStorage | null {
  try {
    const s = window.localStorage;
    const k = '__atlas_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
}

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------
export class LocalWorkspace {
  private state: LocalState;
  private listeners = new Set<() => void>();
  private storage: KeyValueStorage | null;
  /** False when browser storage is unavailable: data lives in memory only. */
  readonly persistent: boolean;
  /** Non-null when stored data had to be repaired or reset on load. */
  loadNotice: string | null = null;
  /** True when nothing was stored yet (first visit). */
  wasNew = false;

  constructor(readonly storageKey: string, storage?: KeyValueStorage | null) {
    this.storage = storage === undefined ? probeStorage() : storage;
    this.persistent = !!this.storage;
    this.state = this.load();
  }

  private load(): LocalState {
    if (!this.storage) return emptyState();
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.storageKey);
    } catch {
      return emptyState();
    }
    if (!raw) {
      this.wasNew = true;
      return emptyState();
    }
    try {
      const { state, dropped } = validateState(JSON.parse(raw));
      if (dropped) this.loadNotice = `Some locally saved items were invalid and were skipped (${dropped}).`;
      return state;
    } catch {
      // Unreadable: keep a backup for recovery rather than silently destroying it.
      try { this.storage.setItem(`${this.storageKey}.corrupt-backup`, raw); } catch { /* ignore */ }
      this.loadNotice = 'Your locally saved data could not be read, so a fresh workspace was started. A backup was kept in this browser.';
      return emptyState();
    }
  }

  /** Reload from storage (e.g. another tab changed it). */
  reload() {
    this.state = this.load();
    this.emit();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  snapshot(): Readonly<LocalState> {
    return this.state;
  }

  /** Apply a mutation atomically: persisted first, then made current. */
  private commit<T>(mutate: (draft: LocalState) => T): T {
    const draft = structuredClone(this.state);
    const result = mutate(draft);
    if (this.storage) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(draft));
      } catch (e) {
        if (isQuotaError(e)) {
          throw new LocalWorkspaceError('This browser’s storage is full, so the change wasn’t saved. Remove some images or reset the guest workspace.', 'storage_full');
        }
        throw new LocalWorkspaceError('The change couldn’t be saved in this browser.', 'storage_full');
      }
    }
    this.state = draft;
    this.emit();
    return result;
  }

  reset() {
    this.commit((d) => Object.assign(d, emptyState()));
  }

  /** Remove the stored data entirely (used when the tutorial sandbox ends). */
  destroy() {
    try { this.storage?.removeItem(this.storageKey); } catch { /* ignore */ }
    this.state = emptyState();
    this.emit();
  }

  approxBytes(): number {
    return JSON.stringify(this.state).length * 2;
  }

  isEmpty(): boolean {
    return !this.state.maps.length && !this.state.groups.length && !this.state.pins.length;
  }

  // ---- Maps ----------------------------------------------------------------
  listMaps(): PersonalMap[] {
    return [...this.state.maps].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(({ updatedAt: _u, ...m }) => m);
  }

  createMap(input: { name: string; description?: string | null }): PersonalMap {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new LocalWorkspaceError('Map names must be 1–80 characters.', 'validation');
    if ((input.description ?? '').length > 500) throw new LocalWorkspaceError('Descriptions are limited to 500 characters.', 'validation');
    return this.commit((d) => {
      const m: LocalMap = { id: uuid(), name, description: input.description?.trim() || null, createdAt: now(), updatedAt: now() };
      d.maps.push(m);
      return { id: m.id, name: m.name, description: m.description, createdAt: m.createdAt };
    });
  }

  updateMap(id: string, input: { name: string; description?: string | null }) {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new LocalWorkspaceError('Map names must be 1–80 characters.', 'validation');
    this.commit((d) => {
      const m = d.maps.find((x) => x.id === id);
      if (!m) throw new LocalWorkspaceError('Map not found.', 'not_found');
      m.name = name;
      m.description = input.description?.trim() || null;
      m.updatedAt = now();
    });
  }

  deleteMap(id: string) {
    this.commit((d) => {
      if (!d.maps.some((m) => m.id === id)) throw new LocalWorkspaceError('Map not found.', 'not_found');
      d.maps = d.maps.filter((m) => m.id !== id);
      d.pins = d.pins.filter((p) => p.mapId !== id);
      gcImages(d);
    });
  }

  // ---- Groups --------------------------------------------------------------
  listGroups(): Group[] {
    return [...this.state.groups].sort((a, b) => a.name.localeCompare(b.name)).map(({ createdAt: _c, ...g }) => g);
  }

  private checkGroup(d: LocalState, name: string, color: string, icon: string | null | undefined, exceptId?: string) {
    if (!name || name.length > 40) throw new LocalWorkspaceError('Group names must be 1–40 characters.', 'validation');
    if (!HEX.test(color)) throw new LocalWorkspaceError('Choose a valid color.', 'validation');
    if (icon != null && icon.length > 40) throw new LocalWorkspaceError('Invalid icon.', 'validation');
    if (d.groups.some((g) => g.id !== exceptId && g.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new LocalWorkspaceError('You already have a group with that name.', 'conflict');
    }
  }

  createGroup(input: { name: string; color: string; icon?: string | null }): Group {
    const name = input.name.trim();
    return this.commit((d) => {
      this.checkGroup(d, name, input.color, input.icon);
      const g: LocalGroup = { id: uuid(), name, color: input.color, icon: input.icon ?? null, createdAt: now() };
      d.groups.push(g);
      return { id: g.id, name: g.name, color: g.color, icon: g.icon };
    });
  }

  updateGroup(id: string, input: { name: string; color: string; icon?: string | null }) {
    const name = input.name.trim();
    this.commit((d) => {
      const g = d.groups.find((x) => x.id === id);
      if (!g) throw new LocalWorkspaceError('Group not found.', 'not_found');
      this.checkGroup(d, name, input.color, input.icon, id);
      g.name = name;
      g.color = input.color;
      if (input.icon !== undefined) g.icon = input.icon;
    });
  }

  /** Deleting a group removes memberships only; pins are kept. */
  deleteGroup(id: string) {
    this.commit((d) => {
      if (!d.groups.some((g) => g.id === id)) throw new LocalWorkspaceError('Group not found.', 'not_found');
      d.groups = d.groups.filter((g) => g.id !== id);
      for (const p of d.pins) p.groupIds = p.groupIds.filter((g) => g !== id);
    });
  }

  // ---- Pins ----------------------------------------------------------------
  private toPin(p: LocalPin, s: LocalState): Pin {
    const img = p.appearance.imageId ? s.images.find((i) => i.id === p.appearance.imageId) : null;
    return {
      id: p.id, mapId: p.mapId, kind: p.kind, eventId: p.eventId, event: p.event,
      title: p.title, note: p.note,
      latitude: p.kind === 'event' ? p.event?.latitude ?? null : p.latitude,
      longitude: p.kind === 'event' ? p.event?.longitude ?? null : p.longitude,
      address: p.address, appearance: { ...p.appearance },
      image: img ? { id: img.id, storagePath: `local:${img.id}`, mimeType: img.mimeType, byteSize: img.byteSize, width: img.width, height: img.height } : null,
      groupIds: [...p.groupIds], createdAt: p.createdAt,
    };
  }

  listPins(mapId?: string): Pin[] {
    const s = this.state;
    return s.pins.filter((p) => !mapId || p.mapId === mapId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((p) => this.toPin(p, s));
  }

  private requireGroups(d: LocalState, groupIds: string[]) {
    if (!groupIds.length) throw new LocalWorkspaceError('Choose at least one group.', 'validation');
    for (const g of groupIds) if (!d.groups.some((x) => x.id === g)) throw new LocalWorkspaceError('Group not found.', 'not_found');
  }

  /** Save a public event; idempotent per map (updates memberships instead of duplicating). */
  saveEvent(mapId: string, event: AtlasEvent, groupIds: string[]): string {
    return this.commit((d) => {
      if (!d.maps.some((m) => m.id === mapId)) throw new LocalWorkspaceError('Map not found.', 'not_found');
      this.requireGroups(d, groupIds);
      const existing = d.pins.find((p) => p.mapId === mapId && p.kind === 'event' && p.eventId === event.id);
      if (existing) {
        existing.groupIds = [...new Set(groupIds)];
        existing.event = structuredClone(event);
        existing.updatedAt = now();
        return existing.id;
      }
      const p: LocalPin = {
        id: uuid(), mapId, kind: 'event', eventId: event.id, event: structuredClone(event), title: null, note: null,
        latitude: null, longitude: null, address: null, appearance: { ...DEFAULT_APPEARANCE }, groupIds: [...new Set(groupIds)],
        createdAt: now(), updatedAt: now(),
      };
      d.pins.push(p);
      return p.id;
    });
  }

  createCustomPin(input: { mapId: string; title: string; note?: string; latitude: number; longitude: number; address?: string | null; groupIds: string[] }): string {
    const title = input.title.trim();
    if (!title || title.length > 120) throw new LocalWorkspaceError('Titles must be 1–120 characters.', 'validation');
    if (!isValidLatLng(input.latitude, input.longitude)) throw new LocalWorkspaceError('Invalid location.', 'validation');
    if ((input.note ?? '').length > 5000) throw new LocalWorkspaceError('Notes are limited to 5000 characters.', 'validation');
    return this.commit((d) => {
      if (!d.maps.some((m) => m.id === input.mapId)) throw new LocalWorkspaceError('Map not found.', 'not_found');
      this.requireGroups(d, input.groupIds);
      const p: LocalPin = {
        id: uuid(), mapId: input.mapId, kind: 'custom', eventId: null, event: null, title, note: input.note?.trim() || null,
        latitude: input.latitude, longitude: input.longitude, address: input.address?.trim() || null,
        appearance: { ...DEFAULT_APPEARANCE }, groupIds: [...new Set(input.groupIds)], createdAt: now(), updatedAt: now(),
      };
      d.pins.push(p);
      return p.id;
    });
  }

  setPinGroups(pinId: string, groupIds: string[]) {
    this.commit((d) => {
      const p = d.pins.find((x) => x.id === pinId);
      if (!p) throw new LocalWorkspaceError('Pin not found.', 'not_found');
      for (const g of groupIds) if (!d.groups.some((x) => x.id === g)) throw new LocalWorkspaceError('Group not found.', 'not_found');
      p.groupIds = [...new Set(groupIds)];
      p.updatedAt = now();
    });
  }

  updatePin(pinId: string, input: { title?: string | null; note?: string | null; address?: string | null; latitude?: number; longitude?: number; mapId?: string }) {
    this.commit((d) => {
      const p = d.pins.find((x) => x.id === pinId);
      if (!p) throw new LocalWorkspaceError('Pin not found.', 'not_found');
      if (input.title !== undefined) {
        const t = input.title?.trim() || null;
        if (p.kind === 'custom' && !t) throw new LocalWorkspaceError('Custom pins need a title.', 'validation');
        if (t && t.length > 120) throw new LocalWorkspaceError('Titles must be 1–120 characters.', 'validation');
        p.title = t;
      }
      if (input.note !== undefined) {
        if ((input.note ?? '').length > 5000) throw new LocalWorkspaceError('Notes are limited to 5000 characters.', 'validation');
        p.note = input.note?.trim() || null;
      }
      if (input.address !== undefined) p.address = input.address?.trim() || null;
      if (input.latitude !== undefined && input.longitude !== undefined) {
        if (p.kind !== 'custom') throw new LocalWorkspaceError('Saved events use the event’s own location.', 'validation');
        if (!isValidLatLng(input.latitude, input.longitude)) throw new LocalWorkspaceError('Invalid location.', 'validation');
        p.latitude = input.latitude;
        p.longitude = input.longitude;
      }
      if (input.mapId !== undefined && input.mapId !== p.mapId) {
        if (!d.maps.some((m) => m.id === input.mapId)) throw new LocalWorkspaceError('Map not found.', 'not_found');
        if (p.kind === 'event' && d.pins.some((x) => x.mapId === input.mapId && x.kind === 'event' && x.eventId === p.eventId)) {
          throw new LocalWorkspaceError('That event is already saved on the destination map.', 'conflict');
        }
        p.mapId = input.mapId;
      }
      p.updatedAt = now();
    });
  }

  updateAppearance(pinId: string, appearance: PinAppearance) {
    const a = validAppearance(appearance);
    if (!a) throw new LocalWorkspaceError('Invalid appearance.', 'validation');
    this.commit((d) => {
      const p = d.pins.find((x) => x.id === pinId);
      if (!p) throw new LocalWorkspaceError('Pin not found.', 'not_found');
      if (a.imageId && !d.images.some((i) => i.id === a.imageId)) throw new LocalWorkspaceError('Image not found.', 'not_found');
      p.appearance = a;
      p.updatedAt = now();
      gcImages(d);
    });
  }

  deletePin(pinId: string) {
    this.commit((d) => {
      if (!d.pins.some((p) => p.id === pinId)) throw new LocalWorkspaceError('Pin not found.', 'not_found');
      d.pins = d.pins.filter((p) => p.id !== pinId);
      gcImages(d);
    });
  }

  // ---- Images --------------------------------------------------------------
  addImage(input: { dataUrl: string; mimeType: string; byteSize: number; width: number; height: number }): { id: string; storagePath: string } {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(input.dataUrl)) throw new LocalWorkspaceError('Unsupported image type.', 'validation');
    if (input.byteSize > MAX_LOCAL_IMAGE_BYTES) throw new LocalWorkspaceError('Images must be 2 MB or smaller.', 'validation');
    return this.commit((d) => {
      const img: LocalImage = { id: uuid(), ...input, createdAt: now() };
      d.images.push(img);
      return { id: img.id, storagePath: `local:${img.id}` };
    });
  }

  imageDataUrl(id: string): string | null {
    return this.state.images.find((i) => i.id === id)?.dataUrl ?? null;
  }

  /** Remove an image only when nothing references it (pins or demo shares). */
  tryDeleteImage(id: string): boolean {
    if (imageReferenced(this.state, id)) return false;
    this.commit((d) => {
      d.images = d.images.filter((i) => i.id !== id);
    });
    return true;
  }

  // ---- Demo collaboration (clearly labelled; nothing is sent anywhere) -------
  shareToDemo(pinId: string, opts: { includeNote: boolean; includeAppearance: boolean }): string {
    return this.commit((d) => {
      const p = d.pins.find((x) => x.id === pinId);
      if (!p) throw new LocalWorkspaceError('Pin not found.', 'not_found');
      const lat = p.kind === 'event' ? p.event?.latitude : p.latitude;
      const lng = p.kind === 'event' ? p.event?.longitude : p.longitude;
      if (lat == null || lng == null) throw new LocalWorkspaceError('This pin has no verified location to share.', 'validation');
      const share: DemoShare = {
        id: uuid(), sourcePinId: p.id, title: p.title ?? p.event?.name ?? 'Untitled pin',
        note: opts.includeNote ? p.note : null, latitude: lat, longitude: lng,
        appearance: opts.includeAppearance ? { ...p.appearance } : { ...DEFAULT_APPEARANCE },
        imageId: opts.includeAppearance ? p.appearance.imageId : null, createdAt: now(),
      };
      const existing = d.demo.shares.findIndex((s) => s.sourcePinId === p.id);
      if (existing >= 0) d.demo.shares[existing] = { ...share, id: d.demo.shares[existing].id };
      else d.demo.shares.push(share);
      return existing >= 0 ? d.demo.shares[existing].id : share.id;
    });
  }

  removeDemoShare(id: string) {
    this.commit((d) => {
      d.demo.shares = d.demo.shares.filter((s) => s.id !== id);
    });
  }

  setDemoRole(memberId: string, role: 'editor' | 'viewer') {
    this.commit((d) => {
      const m = d.demo.members.find((x) => x.id === memberId && !x.isYou);
      if (m) m.role = role;
    });
  }

  removeDemoMember(memberId: string) {
    this.commit((d) => {
      d.demo.members = d.demo.members.filter((m) => m.id !== memberId || m.isYou);
    });
  }

  resetDemo() {
    this.commit((d) => {
      d.demo = defaultDemo();
    });
  }

  // ---- Preferences -----------------------------------------------------------
  setMapStyle(style: LocalState['prefs']['mapStyle']) {
    this.commit((d) => {
      d.prefs.mapStyle = style;
    });
  }
}

function imageReferenced(s: LocalState, id: string): boolean {
  return s.pins.some((p) => p.appearance.imageId === id) || s.demo.shares.some((x) => x.imageId === id);
}

/** Drop images nothing references any more (local data has no other owner). */
function gcImages(d: LocalState) {
  d.images = d.images.filter((i) => imageReferenced(d, i.id));
}
