/**
 * Minimal accessible popover: toggle button with aria-expanded/controls,
 * closes on Escape (returning focus) and on outside click.
 *
 * The panel is portalled to <body> and positioned (fixed) under the trigger,
 * so it is never clipped by scrolling side panels; it follows the trigger on
 * scroll/resize and is limited to the space below it. Keyboard order is kept
 * as if the panel followed the trigger: Tab from the open trigger enters the
 * panel, and tabbing out of either end returns to the trigger.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Popover({ trigger, children, align = 'right', label }: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerEl = () => wrapRef.current?.querySelector<HTMLElement>('[aria-expanded]') ?? null;
  const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerEl()?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const [pos, setPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(panelRef.current?.offsetWidth ?? 320, vw - 16);
      // Align to the trigger's right or left edge, clamped inside the viewport.
      const left = Math.min(Math.max(8, align === 'right' ? r.right - w : r.left), vw - w - 8);
      const below = vh - r.bottom;
      // Open upwards when there is clearly more room above (e.g. bottom toolbar).
      const up = below < 260 && r.top > below;
      setPos(up
        ? { left, bottom: vh - r.top + 8, maxHeight: r.top - 16 }
        : { left, top: r.bottom + 8, maxHeight: Math.max(160, below - 20) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  const close = () => setOpen(false);

  // Tab from the open trigger moves into the panel (it is not adjacent in the DOM).
  const onTriggerKey = (e: ReactKeyboardEvent) => {
    if (!open || e.key !== 'Tab' || e.shiftKey || e.target !== triggerEl()) return;
    const first = focusables()[0];
    if (first) { e.preventDefault(); first.focus(); }
  };
  // Tabbing out of either end of the panel returns to the trigger.
  const onPanelKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = focusables();
    const atEdge = e.shiftKey ? document.activeElement === items[0] : document.activeElement === items[items.length - 1];
    if (items.length === 0 || atEdge) {
      e.preventDefault();
      if (!e.shiftKey) setOpen(false);
      triggerEl()?.focus();
    }
  };

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onTriggerKey}>
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open && createPortal(
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          onKeyDown={onPanelKey}
          style={{ position: 'fixed', ...(pos ?? { visibility: 'hidden' }) }}
          className="z-50 max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl bg-white shadow-float ring-1 ring-black/5 animate-rise-in"
        >
          {typeof children === 'function' ? children(close) : children}
        </div>,
        document.body,
      )}
    </div>
  );
}
