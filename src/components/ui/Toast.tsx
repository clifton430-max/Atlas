/**
 * Toast notifications rendered in an aria-live region so screen readers
 * announce successes and failures. Success toasts are only raised after the
 * underlying operation has actually succeeded.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from './cn';

type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; tone: Tone }

interface ToastApi {
  success(message: string): void;
  error(message: unknown): void;
  info(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push(m, 'success'),
    info: (m) => push(m, 'info'),
    error: (e) => push(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.', 'error'),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex max-w-[480px] items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm shadow-float animate-rise-in',
              t.tone === 'error' ? 'bg-danger text-white' : 'bg-neutral-900 text-white',
            )}
          >
            {t.tone === 'error' ? <AlertCircle className="size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
            <span>{t.message}</span>
            <button
              className="ml-1 rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
