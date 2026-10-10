import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const control =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 transition-colors hover:border-neutral-400 focus:border-accent focus:outline-none focus-visible:outline-2 disabled:bg-neutral-100';

interface FieldWrapProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
  hideLabel?: boolean;
}

export function FieldWrap({ label, hint, error, children, hideLabel }: FieldWrapProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={cn('block text-[13px] font-medium text-neutral-700', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && !error && <p id={hintId} className="text-xs text-neutral-500">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, hideLabel, className, ...rest },
  ref,
) {
  return (
    <FieldWrap label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {({ id, describedBy }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(control, 'h-9', className)}
          {...rest}
        />
      )}
    </FieldWrap>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextArea({ label, hint, error, className, ...rest }: TextAreaProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(control, 'min-h-20 py-2', className)}
          {...rest}
        />
      )}
    </FieldWrap>
  );
}

export function SelectField({
  label, hint, error, children, className, ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <FieldWrap label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          className={cn(control, 'h-9 pr-8', className)}
          {...rest}
        >
          {children}
        </select>
      )}
    </FieldWrap>
  );
}

/** Checkbox with label; used for group selection (never radios). */
export function Checkbox({
  checked, onChange, label, description, swatch, disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  swatch?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-neutral-100', disabled && 'cursor-not-allowed opacity-50')}>
      <input
        id={id}
        type="checkbox"
        className="size-4 shrink-0 rounded border-neutral-400 accent-neutral-900"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {swatch && <span className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: swatch }} aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-neutral-800">{label}</span>
        {description && <span className="block text-xs text-neutral-500">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-neutral-800">{label}</label>
        {description && <p className="text-xs text-neutral-500">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-neutral-900' : 'bg-neutral-300')}
      >
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
