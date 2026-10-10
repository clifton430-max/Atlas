/** Discover category visibility actions (Discover state only; persisted per device). */
import { saveCategories, uiStore } from '@/app/store';
import { CATEGORIES, type CategoryId } from './categories';

const commit = (visible: CategoryId[], subs = uiStore.get().discoverSubcategories) => {
  uiStore.set({ discoverCategories: visible, discoverSubcategories: subs });
  saveCategories(visible, subs);
};

export function toggleCategory(id: CategoryId) {
  const v = uiStore.get().discoverCategories;
  commit(v.includes(id) ? v.filter((x) => x !== id) : [...v, id]);
}
export function showOnly(id: CategoryId) { commit([id]); }
/** Hide All: hides every Discover overlay. Never deletes data or touches personal/collaboration pins. */
export function hideAll() { commit([]); }
export function showAll() { commit(CATEGORIES.map((c) => c.id)); }
export function setSubcategories(id: CategoryId, subs: string[]) {
  const v = uiStore.get().discoverCategories;
  commit(v.includes(id) ? v : [...v, id], { ...uiStore.get().discoverSubcategories, [id]: subs });
}
