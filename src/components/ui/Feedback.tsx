import type { ReactNode } from 'react';
import { AlertCircle, Info, Loader2 } from 'lucide-react';
import { cn } from './cn';

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-neutral-500', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </span>
  );
}

export function ErrorMessage({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className={cn('flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{msg}</span>
    </p>
  );
}

export function Notice({ children, tone = 'info', className }: { children: ReactNode; tone?: 'info' | 'warning'; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]',
        tone === 'warning' ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-neutral-100 text-neutral-700',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      {icon && <div className="mb-2 text-neutral-400">{icon}</div>}
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {children && <div className="mt-1 text-xs text-neutral-500">{children}</div>}
    </div>
  );
}

/** Text badge — permissions and states are never conveyed by color alone. */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warning' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        tone === 'neutral' && 'bg-neutral-200/80 text-neutral-700',
        tone === 'accent' && 'bg-accent-soft text-accent-strong',
        tone === 'warning' && 'bg-amber-100 text-amber-900',
      )}
    >
      {children}
    </span>
  );
}
