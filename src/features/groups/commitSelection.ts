import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import type { WorkspaceValue } from '@/features/workspace/WorkspaceProvider';
import { createGroup } from './api';
import type { GroupSelection } from './GroupPicker';

/** Create pending groups (on confirm) in the active workspace and return the final group ids. */
export async function commitGroupSelection(sel: GroupSelection, qc: QueryClient, ws: WorkspaceValue): Promise<string[]> {
  const created: string[] = [];
  for (const p of sel.pending) {
    created.push((await createGroup(ws, { name: p.name, color: p.color, icon: p.icon ?? null })).id);
  }
  if (created.length) await qc.invalidateQueries({ queryKey: qk.groups });
  return [...sel.selectedIds, ...created];
}
