import { describe, expect, it } from 'vitest';
import {
  ALL_GROUPS, applyGroupFilter, groupFilterLabel, isGroupSelected, loadGroupFilter,
  pruneGroupFilter, saveGroupFilter, toggleGroup, type GroupFilter,
} from '@/features/groups/groupFilter';

const pins = [
  { id: 'p1', groupIds: ['food'] },
  { id: 'p2', groupIds: ['music'] },
  { id: 'p3', groupIds: ['food', 'music'] },
  { id: 'p4', groupIds: [] },
  { id: 'p5', groupIds: ['travel'] },
];
const ids = (f: GroupFilter) => applyGroupFilter(pins, f).map((p) => p.id);

describe('group filter contract', () => {
  it('All Groups is the default and shows every pin, including ungrouped', () => {
    expect(ids(ALL_GROUPS)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('selecting one group deselects All Groups and shows only that group', () => {
    const f = toggleGroup(ALL_GROUPS, 'food');
    expect(f).toEqual({ mode: 'groups', groupIds: ['food'] });
    expect(ids(f)).toEqual(['p1', 'p3']);
  });

  it('selecting another group preserves prior selections and uses OR', () => {
    const f = toggleGroup(toggleGroup(ALL_GROUPS, 'food'), 'travel');
    expect(f).toEqual({ mode: 'groups', groupIds: ['food', 'travel'] });
    expect(ids(f)).toEqual(['p1', 'p3', 'p5']);
  });

  it('a pin in several selected groups appears once', () => {
    const f = toggleGroup(toggleGroup(ALL_GROUPS, 'food'), 'music');
    expect(ids(f)).toEqual(['p1', 'p2', 'p3']);
  });

  it('deselecting a group removes only that group', () => {
    let f = toggleGroup(toggleGroup(toggleGroup(ALL_GROUPS, 'food'), 'music'), 'travel');
    f = toggleGroup(f, 'music');
    expect(f).toEqual({ mode: 'groups', groupIds: ['food', 'travel'] });
    expect(isGroupSelected(f, 'music')).toBe(false);
  });

  it('deselecting the last group returns to All Groups', () => {
    const f = toggleGroup(toggleGroup(ALL_GROUPS, 'food'), 'food');
    expect(f).toEqual(ALL_GROUPS);
    expect(ids(f)).toHaveLength(5);
  });

  it('filtering never mutates pins or memberships', () => {
    const snapshot = JSON.stringify(pins);
    applyGroupFilter(pins, toggleGroup(ALL_GROUPS, 'food'));
    expect(JSON.stringify(pins)).toBe(snapshot);
  });

  it('prunes deleted groups and falls back to All Groups', () => {
    const f: GroupFilter = { mode: 'groups', groupIds: ['food', 'gone'] };
    expect(pruneGroupFilter(f, ['food', 'music'])).toEqual({ mode: 'groups', groupIds: ['food'] });
    expect(pruneGroupFilter({ mode: 'groups', groupIds: ['gone'] }, ['food'])).toEqual(ALL_GROUPS);
  });

  it('produces a textual active-filter label', () => {
    const groups = [{ id: 'food', name: 'Food' }, { id: 'music', name: 'Music' }];
    expect(groupFilterLabel(ALL_GROUPS, groups)).toBe('All Groups');
    expect(groupFilterLabel({ mode: 'groups', groupIds: ['food'] }, groups)).toBe('Group: Food');
    expect(groupFilterLabel({ mode: 'groups', groupIds: ['food', 'music'] }, groups)).toBe('Groups: Food, Music');
  });

  it('persists filters per map', () => {
    saveGroupFilter('map-a', { mode: 'groups', groupIds: ['food'] });
    saveGroupFilter('map-b', ALL_GROUPS);
    expect(loadGroupFilter('map-a')).toEqual({ mode: 'groups', groupIds: ['food'] });
    expect(loadGroupFilter('map-b')).toEqual(ALL_GROUPS);
    localStorage.setItem('atlas.groupFilter.bad', '{not json');
    expect(loadGroupFilter('bad')).toEqual(ALL_GROUPS);
  });
});
