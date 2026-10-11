/**
 * The interactive tour overlay.
 *
 * - Spotlight: a ring around the real target with the rest of the page dimmed.
 *   It never captures pointer events, so the user acts in the real UI.
 * - Card: title, instructions, a "Try it yourself" task, step counter and
 *   progress bar, Back / Next / Skip step / Exit. Next unlocks once the task's
 *   check passes (polled against real app state); Skip step always works.
 * - Robustness: steps navigate to their route and prepare() opens panels or
 *   selects the right pin. If a target can't be found within ~2.5 s, the card
 *   is centred with an explanation instead of breaking.
 * - Accessibility: the card is a labelled, non-modal dialog; focus moves to it
 *   on each step; Escape (while focus is in the card) exits; changes are
 *   announced via a live region. Animations respect reduced motion (global CSS).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, X } from 'lucide-react';
import { uiStore } from '@/app/store';
import { useToast } from '@/components/ui/Toast';
import { Button, IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { getSandboxWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useTutorial } from './tutorialStore';
import { CHAPTERS, STEPS, type Baseline, type TourCtx } from './steps';
import { endTour, goToStep } from './tutorialActions';

const CARD_W = 360;
const MISSING_AFTER_MS = 2500;

function findTarget(id: string | undefined): HTMLElement | null {
  if (!id) return null;
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

function makeCtx(path: string): TourCtx {
  const ws = getSandboxWorkspace();
  return { ws, snap: ws.snapshot(), ui: uiStore.get(), path, q: (s) => document.querySelector<HTMLElement>(s) };
}

const PIN_TARGETS = new Set(['new-map', 'my-maps', 'add-custom-pin', 'groups-section', 'group-filter']);
const NEARBY_TARGETS = new Set(['category-bar', 'hide-all', 'use-location', 'filters-button', 'filter-price', 'filter-event-time', 'events-in-view', 'places-in-view', 'discover-status']);

export function TutorialOverlay() {
  const index = useTutorial((s) => s.stepIndex);
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [done, setDone] = useState(false);
  const baseline = useRef<Baseline | null>(null);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  // Enter a step: capture a baseline, navigate, prepare, focus the card.
  useEffect(() => {
    const ctx = makeCtx(pathRef.current);
    baseline.current = { ui: ctx.ui, snap: ctx.snap };
    setDone(false);
    setMissing(false);
    setRect(null);
    const route = step.route?.(ctx);
    // "/" resolves to the unified map; don't bounce back to it when already on a map.
    if (route && route !== pathRef.current && !(route === '/' && pathRef.current.startsWith('/maps/'))) navigate(route);
    // The unified side panel has two tabs: show the one holding this step's target.
    if (step.target && PIN_TARGETS.has(step.target)) uiStore.set({ panelTab: 'pins' });
    else if (step.target && NEARBY_TARGETS.has(step.target)) uiStore.set({ panelTab: 'nearby' });
    // Let the route render before preparing (opening panels, selecting pins, popovers).
    const t1 = setTimeout(() => step.prepare?.(makeCtx(pathRef.current)), 120);
    const t2 = setTimeout(() => headingRef.current?.focus(), 60);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Track the target's position and verify the task while the step is shown.
  useEffect(() => {
    const started = Date.now();
    let raf = 0;
    const tick = () => {
      const el = findTarget(step.target);
      setRect((prev) => {
        const r = el?.getBoundingClientRect() ?? null;
        if (!r && !prev) return prev;
        if (r && prev && Math.abs(r.x - prev.x) < 0.5 && Math.abs(r.y - prev.y) < 0.5 && Math.abs(r.width - prev.width) < 0.5 && Math.abs(r.height - prev.height) < 0.5) return prev;
        return r;
      });
      setMissing(!!step.target && !el && Date.now() - started > MISSING_AFTER_MS);
    };
    const poll = setInterval(() => {
      tick();
      if (step.done && baseline.current) {
        try {
          if (step.done(makeCtx(pathRef.current), baseline.current)) setDone(true);
        } catch { /* a check must never break the tour */ }
      }
    }, 300);
    const onFrame = () => { tick(); raf = requestAnimationFrame(onFrame); };
    raf = requestAnimationFrame(onFrame);
    return () => { clearInterval(poll); cancelAnimationFrame(raf); };
  }, [step]);

  const isLast = index >= STEPS.length - 1;
  const chapterSteps = STEPS.filter((s) => s.chapter === step.chapter);
  const posInChapter = chapterSteps.indexOf(step) + 1;
  const canAdvance = !step.done || done;

  const next = useCallback(() => {
    if (isLast) {
      endTour(true);
      navigate('/');
      toast.success('Tour complete! Restart it any time from Help.');
    } else goToStep(index + 1);
  }, [index, isLast, navigate, toast]);

  const exit = useCallback(() => {
    endTour(false);
    navigate('/');
    toast.info('Tour closed. Your practice data was discarded — restart from Help any time.');
  }, [navigate, toast]);

  // Card placement: beside the target when there's room, otherwise centred.
  const pos = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (step.placement === 'corner') return { left: vw - CARD_W - 20, top: Math.max(8, vh - 340) };
    if (!rect || missing) return { left: vw / 2 - CARD_W / 2, top: vh / 2 - 140 };
    const pad = 14;
    const estH = 280;
    let left = rect.right + pad;
    let top = rect.top;
    if (left + CARD_W > vw - 8) left = rect.left - CARD_W - pad;
    if (left < 8) {
      left = Math.min(Math.max(8, rect.left), vw - CARD_W - 8);
      top = rect.bottom + pad + estH < vh ? rect.bottom + pad : Math.max(8, rect.top - estH - pad);
    }
    top = Math.min(Math.max(8, top), vh - estH - 8);
    return { left, top };
  }, [rect, missing, step.placement]);

  const spot = rect && !missing ? {
    left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12,
  } : null;

  return (
    <>
      {/* Dimming + spotlight: purely visual, never blocks interaction. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[70]">
        {spot ? (
          <div className="absolute rounded-xl ring-2 ring-accent transition-all duration-200"
            style={{ ...spot, boxShadow: '0 0 0 9999px rgb(10 10 10 / 0.38)' }} />
        ) : (
          <div className="absolute inset-0 bg-neutral-950/30" />
        )}
      </div>

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        data-testid="tour-card"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); exit(); } }}
        className="fixed z-[80] rounded-2xl bg-white p-4 text-neutral-900 shadow-float ring-1 ring-black/10"
        style={{ width: CARD_W, left: pos.left, top: pos.top }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-strong">
            Chapter {step.chapter + 1} of {CHAPTERS.length} · {CHAPTERS[step.chapter]}
          </span>
          <IconButton label="Exit tour" size="sm" className="ml-auto" onClick={exit}><X className="size-4" aria-hidden /></IconButton>
        </div>
        <h2 id="tour-title" ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold outline-none">{step.title}</h2>
        <p id="tour-body" className="mt-1 text-sm text-neutral-700">{step.body}</p>
        {missing && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            The control for this step isn’t visible right now (a panel may be closed or there’s nothing to show yet). You can continue with Next.
          </p>
        )}
        {step.task && (
          <div className={cn('mt-3 flex items-start gap-2 rounded-lg p-2 text-sm', done ? 'bg-emerald-50 text-emerald-900' : 'bg-accent-soft text-accent-strong')} role="status">
            {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span><strong>{done ? 'Done!' : 'Try it yourself:'}</strong> {step.task}</span>
          </div>
        )}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
          <div className="h-full bg-accent transition-[width]" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-neutral-500" data-testid="tour-counter">Step {index + 1} of {STEPS.length} · {posInChapter}/{chapterSteps.length} in chapter</span>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => goToStep(index - 1)} disabled={index === 0} icon={<ChevronLeft className="size-4" aria-hidden />}>Back</Button>
            {step.task && !done && !isLast && <Button size="sm" variant="ghost" onClick={next}>Skip step</Button>}
            <Button size="sm" variant="primary" onClick={next} disabled={!canAdvance}>
              {isLast ? 'Finish' : 'Next'}{!isLast && <ChevronRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">{`Step ${index + 1} of ${STEPS.length}: ${step.title}.${done ? ' Task complete.' : ''}`}</div>
    </>
  );
}
