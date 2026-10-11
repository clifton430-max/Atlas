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
      <p className="flex items-center gap-2 text-neutral-700">
        <svg viewBox="0 0 36 48" className="h-6 w-[18px] shrink-0" aria-hidden><path d="M18 45C18 45 4.5 30.5 4.5 18.5a13.5 13.5 0 1 1 27 0C31.5 30.5 18 45 18 45Z" fill="#d64532" stroke="#fff" strokeWidth="2.4" /></svg>
        Droplet pins are places you saved and your custom pins; small round icons are places nearby you haven’t saved.
      </p>
      <dl className="space-y-1.5 rounded-xl bg-canvas p-3 text-neutral-600">
        <div><dt className="inline font-medium text-neutral-800">Real data: </dt><dd className="inline">roads, water, parks, building footprints and heights, and places come from OpenStreetMap; events come from Ticketmaster.</dd></div>
        <div><dt className="inline font-medium text-neutral-800">Decorative: </dt><dd className="inline">building colours, tree symbols inside mapped parks and woods, moving cars, people, trains and aircraft are illustrations — not real positions, live traffic or real flights. Automatic weather uses real current conditions from Open-Meteo; manual weather is your choice, not the real weather.</dd></div>
      </dl>
    </section>
  );
}
