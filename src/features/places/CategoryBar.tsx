/**
 * Category pills for Discover: one pill per category (tinted icon + label;
 * the pressed state is shown by a colored outline, tint AND a check badge —
 * never color alone), a dropdown per category for subcategories / "only this
 * category", and a Hide all / Show all pill. Multiple categories can be on.
 */
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useUi } from '@/app/store';
import { Popover } from '@/components/ui/Popover';
import { Checkbox } from '@/components/ui/Field';
import { cn } from '@/components/ui/cn';
import { CATEGORIES, type Category } from './categories';
import { LucideNode } from './CategoryIcon';
import { hideAll, setSubcategories, showAll, showOnly, toggleCategory } from './categoryActions';

export function CategoryBar() {
  const visible = useUi((s) => s.discoverCategories);
  const none = visible.length === 0;
  return (
    <div role="toolbar" aria-label="Discover categories" data-tour="category-bar"
      className="flex flex-wrap items-center gap-1.5">
      {CATEGORIES.map((c) => <CategoryChip key={c.id} category={c} on={visible.includes(c.id)} />)}
      <button type="button" onClick={none ? showAll : hideAll} data-tour="hide-all"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-medium text-neutral-800 ring-1 ring-line hover:bg-neutral-50">
        {none ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        {none ? 'Show all' : 'Hide all'}
      </button>
    </div>
  );
}

function CategoryChip({ category: c, on }: { category: Category; on: boolean }) {
  const subs = useUi((s) => s.discoverSubcategories[c.id]) ?? [];
  return (
    <div className={cn('flex shrink-0 items-center rounded-full bg-white transition-shadow', !on && 'ring-1 ring-line hover:ring-neutral-300')}
      style={on ? { background: `${c.color}14`, boxShadow: `inset 0 0 0 2px ${c.color}` } : undefined}>
      <button type="button" aria-pressed={on} onClick={() => toggleCategory(c.id)}
        className="flex h-8 items-center gap-1.5 rounded-l-full pl-1 pr-0.5 text-[12px] font-medium text-neutral-800">
        <span className="relative grid size-6 place-items-center rounded-full" style={on ? { background: c.color, color: '#fff' } : { background: `${c.color}1f`, color: c.color }}>
          <LucideNode icon={c.icon} className="size-3.5" />
          {on && (
            <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-white ring-1" style={{ color: c.color, ['--tw-ring-color' as string]: c.color }}>
              <Check className="size-2.5" strokeWidth={3.5} aria-hidden />
            </span>
          )}
        </span>
        {c.label}
        {on && subs.length > 0 && <span className="rounded-full px-1.5 text-[10px] font-semibold text-white" style={{ background: c.color }}>{subs.length}</span>}
      </button>
      <Popover label={`${c.label} options`} align="left" trigger={({ open, toggle, id }) => (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} aria-label={`${c.label} types`}
          className="grid h-8 w-6 place-items-center rounded-r-full pr-1 text-neutral-500 hover:text-neutral-900">
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      )}>
        {(close) => (
          <fieldset className="w-64 p-3">
            <legend className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{c.label}</legend>
            <Checkbox label="All types" checked={subs.length === 0} onChange={() => setSubcategories(c.id, [])} />
            <div className="my-1 border-t border-neutral-100" />
            {c.subcategories.map((s) => (
              <Checkbox key={s.id} label={s.label}
                adornment={<span className="grid size-4 place-items-center rounded-full text-white" style={{ background: s.color ?? c.color }}><LucideNode icon={s.icon ?? c.icon} className="size-2.5" /></span>}
                checked={subs.includes(s.id)}
                onChange={(v) => {
                  const next = v ? [...subs, s.id] : subs.filter((x) => x !== s.id);
                  setSubcategories(c.id, next.length === c.subcategories.length ? [] : next);
                }} />
            ))}
            <div className="mt-2 flex justify-between border-t border-neutral-100 pt-2">
              <button type="button" className="text-xs font-medium underline" onClick={() => { showOnly(c.id); close(); }}>Show only {c.label}</button>
            </div>
            <p className="mt-2 px-1 text-[11px] text-neutral-500">
              {c.source === 'events' ? 'Event types come from Ticketmaster; events without a known type are hidden while types are picked.' : 'Places come from OpenStreetMap. Zoom in to see them.'}
            </p>
          </fieldset>
        )}
      </Popover>
    </div>
  );
}
