/**
 * Discover filters: category (multi), price bands (multi, non-overlapping),
 * date range, event start-time window and venue-hours window (separate
 * controls), plus explicit "include unknown" toggles. All compose with AND.
 */
import type { ReactNode } from 'react';
import { uiStore, useUi } from '@/app/store';
import { Checkbox, Switch } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EMPTY_FILTERS, PRICE_BANDS, type DiscoverFilters, type TimeWindow } from './filters';

export const KNOWN_CATEGORIES = ['Music', 'Sports', 'Arts & Theatre', 'Film', 'Miscellaneous'];

export function DiscoverFilterPanel({ availableCategories }: { availableCategories: string[] }) {
  const f = useUi((s) => s.discoverFilters);
  const set = (patch: Partial<DiscoverFilters>) => uiStore.set((s) => ({ discoverFilters: { ...s.discoverFilters, ...patch } }));
  const categories = [...new Set([...KNOWN_CATEGORIES, ...availableCategories])].sort();
  const toggleIn = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

  return (
    <div className="w-[340px] space-y-4 p-4">
      <Section title="Category" tour="filter-category">
        <div className="grid grid-cols-2 gap-x-1">
          {categories.map((c) => (
            <Checkbox key={c} label={c} checked={f.categories.includes(c)} onChange={(on) => set({ categories: toggleIn(f.categories, c, on) })} />
          ))}
        </div>
      </Section>

      <Section title="Price (lowest ticket price)" tour="filter-price">
        <div className="grid grid-cols-2 gap-x-1">
          {PRICE_BANDS.map((b) => (
            <Checkbox key={b.id} label={b.label} checked={f.priceBands.includes(b.id)} onChange={(on) => set({ priceBands: toggleIn(f.priceBands, b.id, on) })} />
          ))}
        </div>
        <div className="mt-2">
          <Switch
            label="Include unknown prices"
            description="Unknown is never treated as free."
            checked={f.includeUnknownPrice}
            onChange={(v) => set({ includeUnknownPrice: v })}
            disabled={f.priceBands.length === 0}
          />
        </div>
      </Section>

      <Section title="Date (event local date)">
        <div className="grid grid-cols-2 gap-2">
          <DateInput label="From" value={f.dateFrom} onChange={(v) => set({ dateFrom: v })} />
          <DateInput label="To" value={f.dateTo} onChange={(v) => set({ dateTo: v })} />
        </div>
      </Section>

      <Section title="Event start time" tour="filter-event-time">
        <WindowInput value={f.eventTime} onChange={(w) => set({ eventTime: w })} idPrefix="event" />
      </Section>

      <Section title="Venue open during" tour="filter-venue-hours">
        <WindowInput value={f.venueHours} onChange={(w) => set({ venueHours: w })} idPrefix="venue" />
      </Section>

      <Switch
        label="Include unknown dates and times"
        description="Times use each event’s local timezone. Windows may cross midnight."
        checked={f.includeUnknownTime}
        onChange={(v) => set({ includeUnknownTime: v })}
        disabled={!f.eventTime && !f.venueHours && !f.dateFrom && !f.dateTo}
      />

      <div className="flex justify-end border-t border-neutral-100 pt-3">
        <Button size="sm" variant="ghost" onClick={() => uiStore.set({ discoverFilters: EMPTY_FILTERS })}>Clear all filters</Button>
      </div>
    </div>
  );
}

function Section({ title, children, tour }: { title: string; children: ReactNode; tour?: string }) {
  return (
    <fieldset data-tour={tour}>
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</legend>
      {children}
    </fieldset>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <label className="block text-xs text-neutral-600">
      {label}
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 h-8 w-full rounded-lg border border-neutral-300 px-2 text-sm"
      />
    </label>
  );
}

function WindowInput({ value, onChange, idPrefix }: { value: TimeWindow | null; onChange: (w: TimeWindow | null) => void; idPrefix: string }) {
  const on = value != null;
  return (
    <div className="space-y-2">
      <Checkbox
        label={on ? 'Filter by time window' : 'Any time'}
        checked={on}
        onChange={(c) => onChange(c ? { from: '18:00', to: '23:59' } : null)}
      />
      {on && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-neutral-600" htmlFor={`${idPrefix}-from`}>
            From
            <input id={`${idPrefix}-from`} type="time" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value || '00:00' })}
              className="mt-1 h-8 w-full rounded-lg border border-neutral-300 px-2 text-sm" />
          </label>
          <label className="block text-xs text-neutral-600" htmlFor={`${idPrefix}-to`}>
            To
            <input id={`${idPrefix}-to`} type="time" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value || '23:59' })}
              className="mt-1 h-8 w-full rounded-lg border border-neutral-300 px-2 text-sm" />
          </label>
          {value.from > value.to && <p className="col-span-2 text-xs text-neutral-500">Crosses midnight.</p>}
        </div>
      )}
    </div>
  );
}
