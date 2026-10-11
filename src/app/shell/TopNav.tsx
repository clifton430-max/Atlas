/**
 * Top navigation bar:
 *   logo · map switcher · Discover / My Maps / Shared · search · notifications · help · account · Share
 *
 * On narrow screens the tabs move to a second row and the search field takes
 * the remaining width; nothing is removed.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useMatch } from 'react-router-dom';
import { cn } from '@/components/ui/cn';
import { SearchBar } from '@/features/search/SearchBar';
import { HelpMenu } from '@/features/tutorial/HelpMenu';
import { WorkspaceBadge } from '@/features/workspace/WorkspaceBadge';
import { AccountMenu } from '../AccountMenu';
import { OfflineBanner } from '../OfflineBanner';
import { MapSwitcher } from './MapSwitcher';
import { NotificationsMenu } from './NotificationsMenu';
import { ShareMenu } from './ShareMenu';
import { openSidePanel } from './IconRail';

export function TopNav() {
  return (
    <header className="relative z-40 shrink-0 border-b border-line bg-white">
      {/* One set of tabs: inline on wide screens, wrapped onto a second row below lg. */}
      <div className="flex flex-wrap items-center gap-x-2 px-3 md:gap-x-3 md:px-4">
        <Link to="/" className="flex h-14 shrink-0 items-center gap-2 pr-1" aria-label="Atlas home">
          <img src="/atlas.svg" alt="" className="size-7" />
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">Atlas</span>
        </Link>
        <span className="hidden h-6 w-px bg-line md:block" aria-hidden />
        <MapSwitcher />
        <ContextTabs className="order-last -mx-3 w-[calc(100%+24px)] border-t border-line px-3 md:-mx-4 md:w-[calc(100%+32px)] md:px-4 lg:order-none lg:mx-0 lg:w-auto lg:border-0 lg:px-0" />
        <div className="flex min-w-0 flex-1 justify-center px-1"><SearchBar /></div>
        <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
          <WorkspaceBadge />
          <NotificationsMenu />
          <HelpMenu />
          <AccountMenu />
          <ShareMenu />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-full z-30 flex justify-center pt-2"><div className="pointer-events-auto"><OfflineBanner /></div></div>
    </header>
  );
}

const tabCls = (active: boolean) => cn(
  'relative flex h-11 items-center px-3 text-sm font-medium transition-colors lg:h-14',
  active ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-900',
);

/**
 * Discover / My Maps / Shared — the three map contexts. One indicator bar
 * glides to the active tab (instantly under reduced motion).
 */
function ContextTabs({ className }: { className?: string }) {
  const discover = !!useMatch('/');
  const maps = !!useMatch('/maps/*');
  const collab = !!useMatch('/collab/*');
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  const active = discover ? 0 : maps ? 1 : collab ? 2 : -1;
  useLayoutEffect(() => {
    const measure = () => {
      const el = nav.current?.querySelectorAll<HTMLElement>('a')[active];
      setBar(el ? { left: el.offsetLeft + 12, width: el.offsetWidth - 24 } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);
  return (
    <nav ref={nav} aria-label="Map contexts" data-tour="nav-contexts" className={cn('relative flex items-center', className)}>
      <NavLink to="/" end className={() => tabCls(discover)} aria-current={discover ? 'page' : undefined} data-tour="nav-discover" onClick={openSidePanel}>Discover</NavLink>
      <NavLink to="/maps" className={() => tabCls(maps)} aria-current={maps ? 'page' : undefined} onClick={openSidePanel}>My Maps</NavLink>
      <NavLink to="/collab" className={() => tabCls(collab)} aria-current={collab ? 'page' : undefined} onClick={openSidePanel}>Shared</NavLink>
      {bar && <span aria-hidden data-testid="tab-indicator" className="absolute bottom-0 h-[3px] rounded-full bg-brand transition-[left,width] duration-300 ease-out motion-reduce:transition-none" style={{ left: bar.left, width: bar.width }} />}
    </nav>
  );
}
