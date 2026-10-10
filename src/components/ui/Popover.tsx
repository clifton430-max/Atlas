/**
 * Minimal accessible popover: toggle button with aria-expanded/controls,
 * closes on Escape (returning focus) and on outside click.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

export function Popover({ trigger, children, align = 'right', label }: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        wrapRef.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={wrapRef} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn('absolute top-full z-40 mt-2 max-h-[calc(100vh-96px)] overflow-y-auto rounded-2xl bg-white shadow-float ring-1 ring-black/5 animate-rise-in', align === 'right' ? 'right-0' : 'left-0')}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
