/** Help entry point (top bar): start/resume/restart the tour or jump to a chapter. */
import { CircleHelp, Play, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popover } from '@/components/ui/Popover';
import { useTutorial } from './tutorialStore';
import { CHAPTERS, startTour } from './tutorialActions';

export function HelpMenu() {
  const active = useTutorial((s) => s.active);
  const completed = useTutorial((s) => s.completed);
  const navigate = useNavigate();
  const go = (chapter: number, close: () => void) => {
    close();
    navigate('/');
    startTour(chapter);
  };
  return (
    <Popover label="Help and tutorial" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} data-tour="help-button" aria-label="Help and tutorial"
        className="flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-medium shadow-panel ring-1 ring-black/5 hover:bg-neutral-50">
        <CircleHelp className="size-4" aria-hidden />Help
      </button>
    )}>
      {(close) => (
        <div className="w-72 p-1.5">
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-neutral-100" onClick={() => go(0, close)}>
            {completed || active ? <RotateCcw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {completed || active ? 'Restart the interactive tour' : 'Take the interactive tour'}
          </button>
          <div className="my-1 border-t border-neutral-100" />
          <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Jump to a chapter</p>
          <ol>
            {CHAPTERS.map((c, i) => (
              <li key={c}>
                <button type="button" className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-neutral-100" onClick={() => go(i, close)}>
                  {i + 1}. {c}
                </button>
              </li>
            ))}
          </ol>
          <p className="px-3 pb-2 pt-1 text-[11px] text-neutral-500">The tour uses a practice sandbox; your own maps aren’t changed.</p>
        </div>
      )}
    </Popover>
  );
}
