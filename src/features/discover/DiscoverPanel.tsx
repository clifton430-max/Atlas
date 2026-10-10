/**
 * Discover side panel: category pills + Hide all, filters and sort, distance,
 * and the events / places currently in view (the same data as the map
 * markers, so list and map always agree).
 */
import { CategoryBar } from '@/features/places/CategoryBar';
import { PlaceResults } from '@/features/places/PlaceResults';
import { LocationButton } from '@/features/places/LocationButton';
import { DiscoverEventList } from './DiscoverEventList';
import { DiscoverFilterBar } from './DiscoverFilterBar';

export function DiscoverPanel() {
  return (
    <div className="atlas-scroll h-full overflow-y-auto px-5 pb-6">
      <CategoryBar />
      <section id="discover-filters" aria-label="Filters and sorting" className="mt-5 border-t border-line pt-4">
        <DiscoverFilterBar />
        <div className="mt-3"><LocationButton /></div>
      </section>
      <div className="mt-4 space-y-6 border-t border-line pt-4">
        <DiscoverEventList />
        <PlaceResults />
      </div>
    </div>
  );
}
