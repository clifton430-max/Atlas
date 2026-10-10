import { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

/** Restrained palette that reads well on light map styles. */
export const PALETTE = [
  '#171717', '#525252', '#2f5bea', '#0e7490', '#15803d', '#a16207',
  '#c2410c', '#be123c', '#7e22ce', '#db2777', '#0f766e', '#4d7c0f',
];

export function ColorPicker({ value, onChange, label, hideLegend }: { value: string | null; onChange: (c: string) => void; label: string; hideLegend?: boolean }) {
  const customId = useId();
  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : 'mb-1.5 text-[13px] font-medium text-neutral-700'}>{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={value?.toLowerCase() === c}
            onClick={() => onChange(c)}
            className={cn('grid size-7 place-items-center rounded-full ring-1 ring-black/10 transition-transform hover:scale-110')}
            style={{ background: c }}
          >
            {value?.toLowerCase() === c && <Check className="size-3.5 text-white" aria-hidden />}
          </button>
        ))}
        <label htmlFor={customId} className="ml-1 flex items-center gap-1.5 text-xs text-neutral-600">
          <input
            id={customId}
            type="color"
            value={value ?? '#171717'}
            onChange={(e) => onChange(e.target.value)}
            className="size-7 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
          />
          Custom
        </label>
      </div>
    </fieldset>
  );
}
