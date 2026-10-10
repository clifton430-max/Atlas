/** Announces loss of connectivity: live events and account data can't load, local guest data still works. */
import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-xs text-white shadow-float">
      <WifiOff className="size-4" aria-hidden />
      You’re offline. Live events, map tiles and account data can’t load; maps saved on this device still work.
    </div>
  );
}
