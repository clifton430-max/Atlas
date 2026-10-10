import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryClient';
import { createGroup } from './api';
import type { GroupSelection } from './GroupPicker';

/** Create pending groups (on confirm) and return the final list of group ids. */
export async function commitGroupSelection(sel: GroupSelection, qc: QueryClient): Promise<string[]> {
  const created: string[] = [];
  for (const p of sel.pending) {
    created.push((await createGroup({ name: p.name, color: p.color })).id);
  }
  if (created.length) await qc.invalidateQueries({ queryKey: qk.groups });
  return [...sel.selectedIds, ...created];
}
