/**
 * Exercises the real group-filter widget (checkbox semantics, label) with the
 * groups query stubbed. Verifies the exact contract through the UI.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { uiStore } from '@/app/store';

vi.mock('@/features/groups/api', () => ({
  useGroups: () => ({
    isLoading: false,
    data: [
      { id: 'g1', name: 'Food', color: '#ff0000', icon: null },
      { id: 'g2', name: 'Music', color: '#00ff00', icon: null },
    ],
  }),
}));

import { GroupFilterControl } from '@/features/map/FilterControl';

beforeEach(() => {
  localStorage.clear();
  uiStore.reset();
});

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupFilterControl mapId="m1" />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('GroupFilterControl', () => {
  it('implements All Groups / OR / last-deselect semantics with checkboxes', async () => {
    const user = setup();
    const trigger = screen.getByRole('button', { name: /Group filter: All Groups/ });
    await user.click(trigger);
    const all = screen.getByRole('checkbox', { name: 'All Groups' });
    const food = screen.getByRole('checkbox', { name: 'Food' });
    const music = screen.getByRole('checkbox', { name: 'Music' });
    expect(all).toBeChecked();

    await user.click(food);
    expect(all).not.toBeChecked();
    expect(food).toBeChecked();
    expect(screen.getByRole('button', { name: 'Group filter: Group: Food' })).toBeInTheDocument();

    await user.click(music);
    expect(food).toBeChecked();
    expect(music).toBeChecked();
    expect(screen.getByRole('button', { name: 'Group filter: Groups: Food, Music' })).toBeInTheDocument();

    await user.click(food);
    expect(food).not.toBeChecked();
    expect(music).toBeChecked();

    await user.click(music);
    expect(all).toBeChecked();
    expect(screen.getByRole('button', { name: 'Group filter: All Groups' })).toBeInTheDocument();
  });

  it('persists per map', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: /Group filter/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Music' }));
    expect(JSON.parse(localStorage.getItem('atlas.groupFilter.m1')!)).toEqual({ mode: 'groups', groupIds: ['g2'] });
    expect(localStorage.getItem('atlas.groupFilter.other')).toBeNull();
  });
});
