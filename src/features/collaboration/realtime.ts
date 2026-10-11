/**
 * Realtime sync for a collaboration map (Supabase Realtime, postgres_changes).
 *
 * Realtime is a SIGNAL, not the data source: every change triggers a refetch
 * of the affected queries through RLS, so payloads never leak anything and
 * duplicate / out-of-order events are harmless. Bursts are debounced. After a
 * reconnect everything is refetched (anything missed while offline is
 * recovered). Each user's camera is never moved by collaborators.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import { meetupsKey } from './meetups';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'off';

export function useCollabRealtime(mapId: string | undefined, enabled: boolean): LiveStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('off');
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!supabase || !mapId || !enabled) { setStatus('off'); return; }
    const sb = supabase;
    const flush = () => {
      const kinds = [...pending.current];
      pending.current.clear();
      if (kinds.includes('pins')) void qc.invalidateQueries({ queryKey: qk.sharedPins(mapId) });
      if (kinds.includes('meetups')) void qc.invalidateQueries({ queryKey: meetupsKey(mapId) });
    };
    const signal = (kind: 'pins' | 'meetups') => () => {
      pending.current.add(kind);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 150);
    };
    let everConnected = false;
    setStatus('connecting');
    const filter = `collab_map_id=eq.${mapId}`;
    // Realtime can't filter DELETE events, and for RLS tables they carry only the
    // primary key. Refetch only when the deleted row belongs to this map's cache.
    const pinCached = (id: unknown) => !!qc.getQueryData<{ id: string }[]>(qk.sharedPins(mapId))?.some((p) => p.id === id);
    const meetupCached = (id: unknown) => !!qc.getQueryData<{ id: string }[]>(meetupsKey(mapId))?.some((m) => m.id === id);
    const onDelete = (kind: 'pins' | 'meetups', match: (old: Record<string, unknown>) => boolean) =>
      (p: { old: Record<string, unknown> }) => { if (match(p.old ?? {})) signal(kind)(); };
    const channel = sb.channel(`collab:${mapId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shared_pins', filter }, signal('pins'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shared_pins', filter }, signal('pins'))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'shared_pins' }, onDelete('pins', (o) => pinCached(o.id)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetups', filter }, signal('meetups'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meetups', filter }, signal('meetups'))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meetups' }, onDelete('meetups', (o) => meetupCached(o.id)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetup_attendees', filter }, signal('meetups'))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meetup_attendees' }, onDelete('meetups', (o) => meetupCached(o.meetup_id)))
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          if (everConnected) { pending.current.add('pins').add('meetups'); flush(); } // resync after reconnect
          everConnected = true;
          setStatus('live');
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus(everConnected ? 'reconnecting' : 'connecting');
        }
      });
    return () => {
      clearTimeout(timer.current);
      void sb.removeChannel(channel);
    };
  }, [mapId, enabled, qc]);

  return status;
}

// Online/offline is reflected immediately (Realtime reconnects on its own).
export function useOnlineStatus() {
  return useSyncExternalStore(
    (l) => { window.addEventListener('online', l); window.addEventListener('offline', l); return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l); }; },
    () => navigator.onLine, () => true,
  );
}
