/**
 * The personal map most recently opened, per workspace (account / guest /
 * sandbox), so the "My Maps" tab and the map switcher return to it.
 * Device-local UI preference only; never used for authorization.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'atlas.activeMap.v1';
const listeners = new Set<() => void>();

function readAll(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function getActiveMapId(scope: string): string | null {
  return readAll()[scope] ?? null;
}

export function setActiveMapId(scope: string, id: string) {
  const all = readAll();
  if (all[scope] === id) return;
  all[scope] = id;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* not persisted */ }
  listeners.forEach((l) => l());
}

export function useActiveMapId(scope: string): string | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => getActiveMapId(scope),
    () => null,
  );
}
