/**
 * Device-local map view preferences: 3D (tilted, extruded buildings) or flat
 * 2D. 3D is the default; reduced-motion users still get it, only without
 * animated camera transitions.
 */
import { useSyncExternalStore } from 'react';

export type ViewMode = '3d' | '2d';
const KEY = 'atlas.view.v1';
export const PITCH_3D = 50;
export const BEARING_3D = -20;

const listeners = new Set<() => void>();
function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === '2d' ? '2d' : '3d';
  } catch {
    return '3d';
  }
}
let mode: ViewMode = typeof window === 'undefined' ? '3d' : read();

export const getViewMode = () => mode;
export function setViewMode(v: ViewMode) {
  mode = v;
  try { localStorage.setItem(KEY, v); } catch { /* not persisted */ }
  listeners.forEach((l) => l());
}
export function useViewMode(): ViewMode {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => mode, () => '3d');
}

// ---- Decorative trees (device-local, default on) ---------------------------------
const TREES_KEY = 'atlas.trees.v1';
const treeListeners = new Set<() => void>();
let trees = (() => {
  try { return typeof window === 'undefined' || localStorage.getItem(TREES_KEY) !== 'off'; } catch { return true; }
})();
export const getTreesEnabled = () => trees;
export function setTreesEnabled(v: boolean) {
  trees = v;
  try { localStorage.setItem(TREES_KEY, v ? 'on' : 'off'); } catch { /* not persisted */ }
  treeListeners.forEach((l) => l());
}
export function useTreesEnabled(): boolean {
  return useSyncExternalStore((l) => { treeListeners.add(l); return () => treeListeners.delete(l); }, () => trees, () => true);
}
