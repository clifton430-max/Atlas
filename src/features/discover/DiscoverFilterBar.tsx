/**
 * Discover filters in the side panel:
 *
 *   ⚲ Filters (n active)                 Sort: Soonest ▾
 *   [Date ▾]        [Price ▾]
 *   [Category ▾]    [More filters ▾]
 *
 * "Filters" opens every event filter at once; the four dropdowns open one
 * dimension each. Filters apply to events (places follow the category pills).
 * Sort only reorders the lists.
 */
import type { ReactNode } from 'react';
import { ArrowUpDown, Calendar, Check, ChevronDown, DollarSign, ListFilter, SlidersHorizontal, Tag } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/components/ui/cn';
import { useUserLocation } from '@/features/places/userLocation';
import { activeFilterCount, categoriesOf } from './filters';
import {
  CategoryFilterSection, ClearFiltersButton, DateFilterSection, DiscoverFilterPanel, MoreFiltersSection, PriceFilterSection,
} from './DiscoverFilterPanel';
import { SORT_OPTIONS } from './sort';
import { useDiscoverEvents } from './useDiscoverEvents';

export function DiscoverFilterBar() {
  const f = useUi((s) => s.discoverFilters);
  const { all, eventsVisible } = useDiscoverEvents();
  const n = activeFilterCount(f);
  const available = categoriesOf(all);
  const counts = {
    date: (f.dateFrom ? 1 : 0) + (f.dateTo ? 1 : 0),
    price: f.priceBands.length,
    category: f.categories.length,
    more: (f.eventTime ? 1 : 0) + (f.venueHours ? 1 : 0),
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Popover align="left" label="Event filters" trigger={({ open, toggle, id }) => (
          <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} data-tour="filters-button"
            className="-ml-1 flex h-8 items-center gap-2 rounded-lg px-1.5 text-[13px] font-semibold text-neutral-900 hover:bg-neutral-100">
            <ListFilter className="size-4" aria-hidden />
            Filters{n > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{n} active</span>}
          </button>
        )}>
          <DiscoverFilterPanel availableCategories={available} />
        </Popover>
        <SortMenu />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FilterDropdown label="Date" popoverLabel="Date filter" icon={<Calendar className="size-4" aria-hidden />} count={counts.date}>
          <DateFilterSection />
        </FilterDropdown>
        <FilterDropdown label="Price" popoverLabel="Price filter" icon={<DollarSign className="size-4" aria-hidden />} count={counts.price}>
          <PriceFilterSection />
        </FilterDropdown>
        <FilterDropdown label="Category" popoverLabel="Event category filter" icon={<Tag className="size-4" aria-hidden />} count={counts.category}>
          <CategoryFilterSection availableCategories={available} />
        </FilterDropdown>
        <FilterDropdown label="More filters" popoverLabel="More filters" icon={<SlidersHorizontal className="size-4" aria-hidden />} count={counts.more}>
          <MoreFiltersSection />
        </FilterDropdown>
      </div>
      <p className="text-[11px] text-neutral-500">
        {eventsVisible ? 'Filters apply to events. Places follow the categories above.' : 'Turn on Events to use these filters.'}
      </p>
    </div>
  );
}

function FilterDropdown({ label, popoverLabel, icon, count, children }: { label: string; popoverLabel: string; icon: ReactNode; count: number; children: ReactNode }) {
  return (
    <Popover align="left" label={popoverLabel} trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
        aria-label={count ? `${label} (${count} active)` : label}
        className={cn('flex h-10 w-full items-center gap-2 rounded-xl border bg-white px-3 text-[13px] font-medium text-neutral-800 hover:bg-neutral-50',
          count ? 'border-accent bg-accent-soft/50' : 'border-line')}>
        <span className="text-neutral-500">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {count > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white" aria-hidden>{count}</span>}
        <ChevronDown className="size-3.5 shrink-0 text-neutral-500" aria-hidden />
      </button>
    )}>
      <div className="w-[340px] space-y-3 p-4">
        {children}
        <div className="flex justify-end border-t border-neutral-100 pt-2"><ClearFiltersButton /></div>
      </div>
    </Popover>
  );
}

function SortMenu() {
  const sort = useUi((s) => s.discoverSort);
  const { location } = useUserLocation();
  const current = SORT_OPTIONS.find((o) => o.id === sort)!;
  return (
    <Popover label="Sort results" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} aria-label={`Sort: ${current.label}`}
        className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-[12px] text-neutral-600 hover:bg-neutral-100">
        <ArrowUpDown className="size-3.5" aria-hidden />Sort: <span className="font-medium text-neutral-800">{current.label}</span>
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
    )}>
      {(close) => (
        <div role="radiogroup" aria-label="Sort results" className="w-60 p-1.5">
          {SORT_OPTIONS.map((o) => {
            const disabled = o.id === 'nearest' && !location;
            return (
              <button key={o.id} type="button" role="radio" aria-checked={sort === o.id} disabled={disabled}
                onClick={() => { uiStore.set({ discoverSort: o.id }); close(); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent">
                <span className="w-4">{sort === o.id && <Check className="size-4" aria-hidden />}</span>
                <span className="flex-1">{o.label}</span>
              </button>
            );
          })}
          <p className="px-3 pb-1.5 pt-1 text-[11px] text-neutral-500">
            {location ? 'Sorting changes only the order of the lists.' : '“Nearest” needs your location — use “Distance”.'}
          </p>
        </div>
      )}
    </Popover>
  );
}
