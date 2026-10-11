/**
 * / and /maps — the unified map. Opens the personal map you used last (or
 * your first map), where discovery and your saved pins share one world. Any
 * share-link query (?place=, ?event=, ?landmark=) is carried along. With no
 * maps yet, discovery still works and a prompt offers to create one.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { DiscoverView } from '@/features/discover/DiscoverView';
import { Map as MapIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/Feedback';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useMaps } from './api';
import { getActiveMapId } from './activeMap';

export function MapsHome() {
  const ws = useWorkspace();
  const maps = useMaps();
  const { search } = useLocation();
  if (maps.isLoading || ws.scope === 'pending') {
    return <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel"><Spinner /></div>;
  }
  const remembered = getActiveMapId(ws.scope);
  const target = maps.data?.find((m) => m.id === remembered) ?? maps.data?.[0];
  if (target) return <Navigate to={`/maps/${target.id}${search}`} replace />;
  return (
    <>
    <DiscoverView />
    <div className="absolute left-1/2 top-6 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-panel" role="status">
      <MapIcon className="size-4 text-brand" aria-hidden />
      {maps.error ? 'Your maps couldn’t be loaded — you can still explore.' : 'Explore freely. Create a map (“New map” in the side panel) to save places.'}
    </div>
    </>
  );
}
