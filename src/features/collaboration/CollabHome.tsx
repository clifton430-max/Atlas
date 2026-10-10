/** /collab — the "Shared" tab before a collaboration map is chosen. */
import { Users } from 'lucide-react';

export function CollabHome() {
  return (
    <div className="absolute left-1/2 top-6 z-10 flex max-w-[min(480px,calc(100%-32px))] -translate-x-1/2 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-panel" role="status">
      <Users className="size-4 shrink-0 text-brand" aria-hidden />
      Choose a collaboration map in the side panel. Only pins people deliberately share appear on these maps.
    </div>
  );
}
