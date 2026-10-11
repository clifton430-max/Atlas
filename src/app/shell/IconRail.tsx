/**
 * Left icon rail: quick access to the panel sections and the side-panel
 * toggle. Every item has a visible tooltip (title) and an accessible name.
 */
import { NavLink, useMatch } from 'react-router-dom';
import { Box, Gem, MapPin, PanelLeftClose, PanelLeftOpen, Settings, SlidersHorizontal, UserRound, Users } from 'lucide-react';
import { uiStore, useUi } from '../store';
import { cn } from '@/components/ui/cn';

const itemCls = (active: boolean) => cn(
  'grid size-10 place-items-center rounded-xl transition-colors',
  active ? 'bg-lime-soft text-brand ring-1 ring-lime-strong/60' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
);

/**
 * Choosing a context (tab or rail) always shows its side panel. Root cause of
 * "Discover does nothing": with the panel collapsed — the default below
 * 1024 px — switching context changed only the map, so the tab looked dead.
 */
export function openSidePanel() {
  if (!uiStore.get().leftPanelOpen) uiStore.set((s) => ({ leftPanelOpen: true, panelToggles: s.panelToggles + 1 }));
}

export function toggleSidePanel() {
  uiStore.set((s) => ({ leftPanelOpen: !s.leftPanelOpen, panelToggles: s.panelToggles + 1 }));
}

export function IconRail() {
  const left = useUi((s) => s.leftPanelOpen);
  const discover = !!useMatch('/');
  const maps = !!useMatch('/maps/*');
  const collab = !!useMatch('/collab/*');
  const friends = !!useMatch('/settings/friends');
  const treasure = !!useMatch('/treasure');
  const settings = !!useMatch('/settings/*') && !friends;

  /** On Discover, "Filters" opens the side panel and focuses the filter controls. */
  const focusFilters = () => {
    if (!uiStore.get().leftPanelOpen) uiStore.set((s) => ({ leftPanelOpen: true, panelToggles: s.panelToggles + 1 }));
    requestAnimationFrame(() => document.getElementById('discover-filters')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  return (
    <nav aria-label="Sections" className="hidden w-16 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-white py-3 md:flex">
      <NavLink to="/" end aria-label="Explore" title="Explore" className={() => itemCls(discover)} onClick={openSidePanel}><MapPin className="size-5" aria-hidden /></NavLink>
      <NavLink to="/maps" aria-label="Your maps" title="Your maps" className={() => itemCls(maps)} onClick={openSidePanel}><Box className="size-5" aria-hidden /></NavLink>
      <NavLink to="/collab" aria-label="Collaboration maps" title="Collaboration maps" className={() => itemCls(collab)} onClick={openSidePanel}><Users className="size-5" aria-hidden /></NavLink>
      {discover && (
        <button type="button" aria-label="Jump to filters" title="Jump to filters" className={itemCls(false)} onClick={focusFilters}><SlidersHorizontal className="size-5" aria-hidden /></button>
      )}
      <NavLink to="/treasure" aria-label="Treasure" title="Treasure: monument and map skin crates" className={() => itemCls(treasure)}><Gem className="size-5" aria-hidden /></NavLink>
      <NavLink to="/settings/friends" aria-label="Friends" title="Friends" className={() => itemCls(friends)}><UserRound className="size-5" aria-hidden /></NavLink>
      <NavLink to="/settings/account" aria-label="Settings" title="Settings" className={() => itemCls(settings)}><Settings className="size-5" aria-hidden /></NavLink>
      <span className="flex-1" />
      <button type="button" data-tour="toggle-left" aria-expanded={left} onClick={toggleSidePanel}
        aria-label={left ? 'Collapse side panel' : 'Expand side panel'} title={left ? 'Collapse side panel' : 'Expand side panel'} className={itemCls(false)}>
        {left ? <PanelLeftClose className="size-5" aria-hidden /> : <PanelLeftOpen className="size-5" aria-hidden />}
      </button>
    </nav>
  );
}
