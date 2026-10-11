/**
 * Chess room (no backend): appears only at the World Chess Hall of Fame (by
 * OSM id), complete local two-player games with special moves, persistence,
 * offline play, and keyboard access.
 */
import { expect, test, type Page } from '@playwright/test';
import { freshGuest, inspector, sidePanel, waitForMap } from './helpers';

async function atHallOfFame(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__ch')) return;
    sessionStorage.setItem('__ch', '1');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-90.2611, 38.6444], zoom: 17 }));
    localStorage.setItem('atlas.discover.categories.v2', JSON.stringify({ visible: ['arts'], subs: {} }));
  });
}
const sq = (page: Page, s: string) => page.getByRole('gridcell', { name: new RegExp(`^${s},`) });
async function play(page: Page, moves: [string, string][]) {
  for (const [f, t] of moves) { await sq(page, f).click(); await sq(page, t).click(); }
}

test.beforeEach(async ({ page }) => { await freshGuest(page); await atHallOfFame(page); });

test('the chess action appears at the World Chess Hall of Fame only', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const places = sidePanel(page).locator('[data-tour="places-in-view"]');
  await places.getByRole('button', { name: /Championship Staunton|Public art/ }).first().click();
  await expect(inspector(page).getByRole('article')).toBeVisible();
  await expect(inspector(page).getByRole('link', { name: /Enter Chess Room/ })).toHaveCount(0);
  await places.getByRole('button', { name: /World Chess Hall of Fame/ }).click();
  await expect(inspector(page).getByRole('link', { name: /Enter Chess Room/ })).toBeVisible();
  // Normal place actions are preserved.
  await expect(inspector(page).getByRole('region', { name: 'Add to map' })).toBeVisible();
  await expect(inspector(page).getByRole('region', { name: 'Directions' })).toBeVisible();
});

test('local game: legal moves only, castling, checkmate, persistence, return to map', async ({ page }) => {
  await page.goto('/chess?venue=osm%3Anode%2F9209122821');
  await expect(page.getByRole('heading', { name: 'Chess room' })).toBeVisible();
  // Illegal destination: e2 pawn can't reach e5, and black can't move first.
  await sq(page, 'e2').click();
  await expect(sq(page, 'e5')).not.toHaveAccessibleName(/legal move/);
  await sq(page, 'e5').click();
  await expect(page.getByRole('status')).toHaveText('White to move');
  await sq(page, 'e7').click();
  await expect(sq(page, 'e7')).toHaveAttribute('aria-selected', 'false');
  // Italian opening, then White castles kingside.
  await play(page, [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['e1', 'g1']]);
  await expect(page.getByRole('region', { name: 'Move history' })).toContainText('O-O');
  await expect(sq(page, 'g1')).toHaveAccessibleName(/white king/);
  await expect(sq(page, 'f1')).toHaveAccessibleName(/white rook/);
  // Persistence: reload resumes the same position.
  await page.reload();
  await expect(sq(page, 'g1')).toHaveAccessibleName(/white king/);
  // New game, then fool's mate.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('dialog', { name: 'Start a new game?' }).getByRole('button', { name: 'New game' }).click();
  await play(page, [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
  await expect(page.getByRole('status')).toHaveText('Black wins — Checkmate');
  await expect(page.getByRole('region', { name: 'Move history' })).toContainText('Qh4#');
  await page.getByRole('button', { name: 'Return to map' }).click();
  await expect(page).toHaveURL(/\/maps\//); // the unified map
  await waitForMap(page);
});

test('en passant and promotion through the board UI', async ({ page }) => {
  await page.goto('/chess');
  await play(page, [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5'], ['e5', 'd6']]);
  await expect(page.getByRole('region', { name: 'Move history' })).toContainText('exd6');
  await expect(sq(page, 'd5')).toHaveAccessibleName(/empty/); // captured pawn removed
  await play(page, [['a6', 'a5'], ['d6', 'c7'], ['a5', 'a4']]);
  await sq(page, 'c7').click();
  await sq(page, 'b8').click(); // capture-promote
  await page.getByRole('button', { name: 'Promote to knight' }).click();
  await expect(page.getByRole('region', { name: 'Move history' })).toContainText('cxb8=N');
  await expect(sq(page, 'b8')).toHaveAccessibleName(/white knight/);
});

test('keyboard play and offline local play', async ({ page, context }) => {
  await page.goto('/chess');
  await expect(sq(page, 'e2')).toBeVisible(); // app + chess assets loaded first
  await context.setOffline(true);
  await sq(page, 'e2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(sq(page, 'e4')).toHaveAccessibleName(/white pawn/);
  await expect(page.getByRole('status').filter({ hasText: 'to move' })).toHaveText('Black to move');
  await expect(page.getByText('You’re offline')).toBeVisible(); // really offline
  await context.setOffline(false);
  await page.getByRole('tab', { name: 'Play online' }).click();
  await expect(page.getByText('Online games need an account')).toBeVisible();
});
