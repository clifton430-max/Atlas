/** Group identity marker: the group's icon in its color, or a color dot. Always paired with the name text. */
import { PIN_ICONS } from '@/features/pins/icons';
import type { Group } from '@/lib/types';
import { cn } from '@/components/ui/cn';

export function GroupIcon({ group, className }: { group: Pick<Group, 'color' | 'icon'>; className?: string }) {
  const entry = group.icon ? PIN_ICONS[group.icon] : null;
  if (entry) {
    const { Icon } = entry;
    return <Icon className={cn('size-3.5 shrink-0', className)} style={{ color: group.color }} aria-hidden strokeWidth={2.5} />;
  }
  return <span className={cn('size-2.5 shrink-0 rounded-full ring-1 ring-black/10', className)} style={{ background: group.color }} aria-hidden />;
}

/** Icon chooser shared by group forms. */
export function GroupIconPicker({ value, onChange, color }: { value: string | null; onChange: (v: string | null) => void; color: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-neutral-700">Icon <span className="font-normal text-neutral-500">(optional)</span></legend>
      <div className="grid grid-cols-10 gap-1">
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} title="No icon" aria-label="No icon"
          className={cn('grid size-8 place-items-center rounded-md text-[10px] ring-1', value === null ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-600 ring-neutral-200')}>
          none
        </button>
        {Object.entries(PIN_ICONS).map(([key, { label, Icon }]) => (
          <button key={key} type="button" aria-label={label} title={label} aria-pressed={value === key} onClick={() => onChange(key)}
            className={cn('grid size-8 place-items-center rounded-md ring-1', value === key ? 'ring-2 ring-neutral-900' : 'bg-white ring-neutral-200 hover:ring-neutral-400')}>
            <Icon className="size-4" style={{ color }} aria-hidden />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
