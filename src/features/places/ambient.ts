/**
 * Ambient map life — pure helpers (unit-tested).
 * Agents move along REAL line geometry taken from the basemap tiles (roads,
 * rail, paths). The motion itself is decorative: it is not real-time traffic,
 * which the UI states explicitly.
 */
import { useSyncExternalStore } from 'react';
import { haversineMeters } from './geo';

export type AgentKind = 'car' | 'train' | 'walker';
export interface Agent {
  kind: AgentKind;
  coords: [number, number][];
  /** Cumulative distance (m) at each vertex. */
  cum: number[];
  length: number;
  speed: number; // m/s
  offset: number; // m at t = 0
}

export const SPEEDS: Record<AgentKind, number> = { car: 14, train: 22, walker: 1.6 };
export const LIMITS: Record<AgentKind, number> = { car: 8, train: 2, walker: 6 };
export const MIN_LENGTH: Record<AgentKind, number> = { car: 150, train: 300, walker: 60 };

export function makeAgent(kind: AgentKind, coords: [number, number][], seed: number): Agent | null {
  if (coords.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(
      { latitude: coords[i - 1][1], longitude: coords[i - 1][0] },
      { latitude: coords[i][1], longitude: coords[i][0] },
    ));
  }
  const length = cum[cum.length - 1];
  if (!(length >= MIN_LENGTH[kind])) return null;
  return { kind, coords, cum, length, speed: SPEEDS[kind], offset: (seed * 9301 + 49297) % 233280 / 233280 * length };
}

/** Position after `seconds`, moving back and forth along the line (never leaves the geometry). */
export function positionAt(a: Agent, seconds: number): [number, number] {
  return poseAt(a, seconds).position;
}

/**
 * Position and heading (degrees clockwise from north, in the direction of
 * travel) after `seconds`. Agents ping-pong along their line, so the heading
 * flips on the way back.
 */
export function poseAt(a: Agent, seconds: number): { position: [number, number]; heading: number } {
  const period = a.length * 2;
  let d = (a.offset + a.speed * seconds) % period;
  const back = d > a.length;
  if (back) d = period - d;
  let i = 1;
  while (i < a.cum.length - 1 && a.cum[i] < d) i++;
  const seg = a.cum[i] - a.cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (d - a.cum[i - 1]) / seg));
  const [x0, y0] = a.coords[i - 1];
  const [x1, y1] = a.coords[i];
  const dx = (x1 - x0) * Math.cos((y0 * Math.PI) / 180);
  const dy = y1 - y0;
  const forward = (Math.atan2(dx, dy) * 180) / Math.PI;
  return { position: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], heading: ((back ? forward + 180 : forward) + 360) % 360 };
}

/**
 * A small oriented rectangle (lng/lat ring) centred on `center`, `length` ×
 * `width` metres, rotated to `heading`. Used to draw decorative vehicles as
 * low 3D boxes that buildings correctly hide.
 */
export function boxAround(center: [number, number], heading: number, length: number, width: number): [number, number][] {
  const [lng, lat] = center;
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const h = (heading * Math.PI) / 180;
  const fx = Math.sin(h);
  const fy = Math.cos(h); // forward unit vector (east, north)
  const rx = fy;
  const ry = -fx; // right-hand unit vector
  const corner = (f: number, r: number): [number, number] =>
    [lng + (fx * f + rx * r) / mLng, lat + (fy * f + ry * r) / mLat];
  const L = length / 2;
  const W = width / 2;
  return [corner(L, -W), corner(L, W), corner(-L, W), corner(-L, -W), corner(L, -W)];
}

/**
 * Approximate local solar hour at a longitude (UTC + lng/15). Used only to
 * decide whether to show the night-time glow; documented as approximate.
 */
export function isNightAt(lng: number, now = new Date()): boolean {
  const hour = (now.getUTCHours() + now.getUTCMinutes() / 60 + lng / 15 + 48) % 24;
  return hour >= 19 || hour < 6;
}

// ---- Preference (device-local) -------------------------------------------------
const KEY = 'atlas.ambient.v1';
const listeners = new Set<() => void>();
function read(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? true : v === 'on';
  } catch {
    return true;
  }
}
let enabled = typeof window === 'undefined' ? true : read();
export function setAmbientEnabled(v: boolean) {
  enabled = v;
  try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* not persisted */ }
  listeners.forEach((l) => l());
}
export function useAmbientEnabled(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => enabled, () => true);
}

const motionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (l) => { motionQuery?.addEventListener('change', l); return () => motionQuery?.removeEventListener('change', l); },
    () => !!motionQuery?.matches,
    () => false,
  );
}

// ---- Playback (session-only): pause and speed for the decorative motion -------
export const SPEED_OPTIONS = [0.5, 1, 2] as const;
export interface AmbientPlayback { paused: boolean; speed: number }
let playback: AmbientPlayback = { paused: false, speed: 1 };
const playbackListeners = new Set<() => void>();
export const getAmbientPlayback = () => playback;
export function setAmbientPlayback(patch: Partial<AmbientPlayback>) {
  playback = { ...playback, ...patch };
  playbackListeners.forEach((l) => l());
}
export function useAmbientPlayback(): AmbientPlayback {
  return useSyncExternalStore((l) => { playbackListeners.add(l); return () => playbackListeners.delete(l); }, () => playback, () => playback);
}
