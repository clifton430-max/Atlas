import { useSyncExternalStore } from 'react';
import type { LocalState, LocalWorkspace } from './localWorkspace';

/** Reactive read of a local workspace's state (null in account mode). */
export function useLocalSnapshot(ws: LocalWorkspace | null): Readonly<LocalState> | null {
  return useSyncExternalStore(
    (cb) => (ws ? ws.subscribe(cb) : () => undefined),
    () => (ws ? ws.snapshot() : null),
    () => null,
  );
}
