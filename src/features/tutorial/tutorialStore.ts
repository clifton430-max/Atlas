/**
 * Tutorial progress store (browser-local, versioned).
 *
 * While a tour is active the app runs in the disposable *tutorial sandbox*
 * workspace, so practice actions never touch account data or the guest
 * workspace. Progress survives a refresh (the sandbox is persisted too) and is
 * discarded when the tour ends.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'atlas.tutorial.v1';

export interface TutorialState {
  active: boolean;
  stepIndex: number;
  /** Highest chapter number completed at least once. */
  completed: boolean;
  /** The first-visit offer was answered (started, skipped or dismissed). */
  firstRunHandled: boolean;
}

const initial: TutorialState = { active: false, stepIndex: 0, completed: false, firstRunHandled: false };

function load(): TutorialState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        active: raw.active === true,
        stepIndex: Number.isInteger(raw.stepIndex) && raw.stepIndex >= 0 ? raw.stepIndex : 0,
        completed: raw.completed === true,
        firstRunHandled: raw.firstRunHandled === true,
      };
    }
  } catch {
    /* storage unavailable or corrupt -> defaults */
  }
  return initial;
}

let state: TutorialState = typeof window === 'undefined' ? initial : load();
const listeners = new Set<() => void>();

export const tutorialStore = {
  get: () => state,
  set(patch: Partial<TutorialState>) {
    state = { ...state, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* non-persistent: tour still works for this session */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Test helper */
  reload() {
    state = load();
    listeners.forEach((l) => l());
  },
};

export function useTutorial<T>(sel: (s: TutorialState) => T): T {
  return useSyncExternalStore(tutorialStore.subscribe, () => sel(tutorialStore.get()), () => sel(initial));
}
