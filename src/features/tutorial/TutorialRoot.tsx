/**
 * Mounts the tour overlay while a tour is active, and the first-visit offer
 * (start / skip) otherwise. Never shown on the standalone /auth page.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTutorial } from './tutorialStore';
import { TutorialOverlay } from './TutorialOverlay';
import { dismissFirstRun, startTour } from './tutorialActions';

export function TutorialRoot() {
  const active = useTutorial((s) => s.active);
  const handled = useTutorial((s) => s.firstRunHandled);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname.startsWith('/auth') || pathname.startsWith('/__dev')) return null;
  if (active) return <TutorialOverlay />;
  if (handled) return null;
  return (
    <aside aria-labelledby="first-run-title" data-testid="first-run-offer"
      className="fixed bottom-6 left-1/2 z-[60] w-[420px] -translate-x-1/2 rounded-2xl bg-white p-4 shadow-float ring-1 ring-black/10 animate-rise-in">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"><GraduationCap className="size-5" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <h2 id="first-run-title" className="text-[15px] font-semibold">New to Atlas? Take the interactive tour</h2>
          <p className="mt-0.5 text-sm text-neutral-600">Learn everything by trying it in the real app, about 10 minutes. It uses a practice sandbox, so nothing you do in the tour is kept.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => { navigate('/'); startTour(0); }}>Start the tour</Button>
            <Button size="sm" variant="ghost" onClick={dismissFirstRun}>Skip for now</Button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">You can start it later from Help.</p>
        </div>
      </div>
    </aside>
  );
}
