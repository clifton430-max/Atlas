/**
 * Accessible modal dialog built on the native <dialog> element:
 * showModal() gives us a focus trap, inert background and Escape-to-close
 * for free. We add initial focus, focus restoration and a labelled title.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { cn } from './cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Prevent Escape/backdrop closing (e.g. while saving). */
  dismissible?: boolean;
}

const widths = { sm: 'w-[420px]', md: 'w-[520px]', lg: 'w-[680px]' };

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      el.showModal?.();
      // Focus the first field/control in the body rather than the close button.
      const target = el.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), select, textarea')
        ?? el.querySelector<HTMLElement>('button');
      target?.focus();
    } else if (!open && el.open) {
      el.close?.();
      restoreFocus.current?.focus?.();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onMouseDown={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto max-h-[86vh] max-w-[calc(100vw-48px)] overflow-hidden rounded-2xl bg-white p-0 text-neutral-900 shadow-float animate-rise-in',
        widths[size],
      )}
    >
      <div className="flex max-h-[86vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            {description && <div id={descId} className="mt-0.5 text-sm text-neutral-500">{description}</div>}
          </div>
          {dismissible && (
            <IconButton label="Close dialog" size="sm" onClick={onClose}>
              <X className="size-4" aria-hidden />
            </IconButton>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">{footer}</footer>}
      </div>
    </dialog>
  );
}

/** Convenience confirm dialog for destructive actions. */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => unknown;
  onClose: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size="sm"
      dismissible={!props.busy}
      footer={
        <>
          <button className="h-9 rounded-lg px-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200/70" onClick={props.onClose} disabled={props.busy}>
            Cancel
          </button>
          <button
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium text-white disabled:opacity-60',
              props.danger ? 'bg-danger' : 'bg-neutral-900',
            )}
            onClick={() => void props.onConfirm()}
            disabled={props.busy}
            data-autofocus
          >
            {props.busy ? 'Working…' : props.confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-neutral-700">{props.message}</div>
    </Dialog>
  );
}
