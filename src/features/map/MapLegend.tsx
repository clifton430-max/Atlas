/**
 * Map legend: what each kind of marker means and — just as important — which
 * parts of the map are verified data and which are decorative. Shown in the
 * empty inspector and in the Layers popover.
 */
import { CATEGORIES } from '@/features/places/categories';
import { CategoryDot } from '@/features/places/CategoryIcon';
import { cn } from '@/components/ui/cn';

export function MapLegend({ className }: { className?: string }) {
  return (
    <section aria-labelledby="legend-heading" className={cn('space-y-3 text-xs', className)}>
      <h3 id="legend-heading" className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Map legend</h3>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {CATEGORIES.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5 text-neutral-700">
            <CategoryDot color={c.color} icon={c.icon} />{c.label}
          </li>
        ))}
      </ul>
      <dl className="space-y-1.5 rounded-xl bg-canvas p-3 text-neutral-600">
        <div><dt className="inline font-medium text-neutral-800">Real data: </dt><dd className="inline">roads, water, parks, building footprints and heights, and places come from OpenStreetMap; events come from Ticketmaster.</dd></div>
        <div><dt className="inline font-medium text-neutral-800">Decorative: </dt><dd className="inline">building colours, tree symbols inside mapped parks and woods, moving vehicles and walkers are illustrations, not real positions or live traffic.</dd></div>
      </dl>
    </section>
  );
}
