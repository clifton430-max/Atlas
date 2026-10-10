/**
 * /maps — the "My Maps" tab. Opens the map you used last (or your first
 * map); with no maps yet, shows a prompt to create one.
 */
import { Navigate } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/Feedback';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useMaps } from './api';
import { getActiveMapId } from './activeMap';

export function MapsHome() {
  const ws = useWorkspace();
  const maps = useMaps();
  if (maps.isLoading || ws.scope === 'pending') {
    return <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel"><Spinner /></div>;
  }
  const remembered = getActiveMapId(ws.scope);
  const target = maps.data?.find((m) => m.id === remembered) ?? maps.data?.[0];
  if (target) return <Navigate to={`/maps/${target.id}`} replace />;
  return (
    <div className="absolute left-1/2 top-6 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-panel" role="status">
      <MapIcon className="size-4 text-brand" aria-hidden />
      {maps.error ? 'Your maps couldn’t be loaded.' : 'You don’t have any maps yet. Create one with “New map” in the side panel.'}
    </div>
  );
}
