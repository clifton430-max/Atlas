/**
 * Part 2 bug fixes (no backend): compass, Discover tab, labelled share links,
 * Atlas deep links, nearest-first sorting, routing fallback, stale panels.
 */
import { expect, test, type Page } from '@playwright/test';
import { freshGuest, inspector, openDiscover, openMyMaps, sidePanel, waitForMap, type AtlasWindow } from './helpers';

async function at(page: Page, center: [number, number], zoom: number, categories: string[]) {
  await page.addInitScript(([c, z, cats]) => {
    if (sessionStorage.getItem('__fx')) return;
    sessionStorage.setItem('__fx', '1');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: c, zoom: z }));
    localStorage.setItem('atlas.discover.categories.v2', JSON.stringify({ visible: cats, subs: {} }));
  }, [center, zoom, categories] as const);
}
const bearing = (page: Page) => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getBearing());

test.beforeEach(async ({ page }) => freshGuest(page));

test('compass shows the bearing and resets the map to north from any bearing', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  for (const b of [-20, 90, 200]) {
    await page.evaluate((x) => (window as AtlasWindow).__atlasMap!.jumpTo({ bearing: x }), b);
    const compass = page.getByRole('button', { name: /Reset to north/ });
    await expect(compass).toHaveAttribute('data-bearing', String(Math.round(((b + 180) % 360 + 360) % 360 - 180)));
    await compass.click();
    await expect.poll(() => bearing(page)).toBeCloseTo(0, 1);
    await expect(page.getByRole('button', { name: 'Map faces north' })).toBeVisible();
  }
});

test('My Map / Shared tabs work in both directions and open the side panel even when collapsed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Collapse side panel' }).click();
  await page.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'Shared' }).click();
  await expect(sidePanel(page).getByRole('heading', { name: 'Shared', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse side panel' }).click();
  await openDiscover(page);
  await expect(page.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'My Map' })).toHaveAttribute('aria-current', 'page');
  await expect(sidePanel(page).getByRole('heading', { name: 'My Map', level: 1 })).toBeVisible();
  await openMyMaps(page);
  await expect(sidePanel(page).getByRole('button', { name: 'Add custom pin' })).toBeVisible();
});

test('share menu separates the Atlas link, official website and OpenStreetMap page; Atlas link opens the same place', async ({ page }) => {
  await at(page, [-73.9857, 40.7484], 16.5, ['attractions']);
  await page.goto('/');
  await waitForMap(page);
  await sidePanel(page).getByRole('button', { name: /Empire State Building/ }).first().click();
  await expect(inspector(page).getByRole('article', { name: /Place: Empire State Building/ })).toBeVisible();
  await page.getByRole('button', { name: 'Share' }).click();
  const share = page.getByRole('dialog', { name: 'Share' });
  const atlas = await share.getByRole('textbox', { name: 'Atlas link' }).inputValue();
  expect(atlas).toMatch(/\/\?place=osm%3A(way|node|relation)%2F\d+&at=/);
  await expect(share.getByRole('textbox', { name: 'OpenStreetMap page' })).toHaveValue(/^https:\/\/www\.openstreetmap\.org\/(way|node|relation)\/\d+$/);
  // Without the server there are no verified details: the website is never substituted by another URL.
  await expect(share.getByRole('textbox', { name: 'Official website' })).toHaveCount(0);
  await expect(share).toContainText(/No official website is listed|Checking/);

  // Open the Atlas link fresh: the same place (by OSM id) is selected.
  await page.goto(new URL(atlas).pathname + new URL(atlas).search);
  await waitForMap(page);
  await expect(inspector(page).getByRole('article', { name: /Place: Empire State Building/ })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/maps\/[0-9a-f-]{36}$/); // unified map; params consumed
});

test('event deep link selects the event by id; malformed links are ignored', async ({ page }) => {
  await page.goto('/?place=Eiffel%20Tower&at=1,2');
  await waitForMap(page);
  await expect(inspector(page).getByText('Nothing selected')).toBeVisible();
  await page.goto('/?event=00000000-0000-4000-8000-000000000006'); // development fixture: Street Food Market
  await expect(inspector(page).getByRole('article', { name: /Event: Sample: Street Food Market/ })).toBeVisible({ timeout: 15_000 });
});

test('directions without a backend: honest message plus a simple distance (never called a route)', async ({ page, context }) => {
  await at(page, [-74.0007, 40.7309], 15, ['events']);
  await page.goto('/');
  await waitForMap(page);
  await page.getByRole('button', { name: /Late Night Jazz/ }).click();
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.7359, longitude: -73.9911 });
  const dir = inspector(page).getByRole('region', { name: 'Directions' });
  await dir.getByRole('button', { name: 'Get route from my location' }).click();
  await expect(dir).toContainText('Routing needs the Atlas server');
  await expect(dir).toContainText(/\d mi away/);
  await expect(dir).not.toContainText(/straight/i);
  await expect(dir).not.toContainText(/\bmin\b/); // no fabricated travel time
});

test('switching markers never shows stale details', async ({ page }) => {
  await at(page, [-73.9857, 40.7484], 16, ['attractions']);
  await page.goto('/');
  await waitForMap(page);
  const items = sidePanel(page).locator('[data-tour="places-in-view"] li button');
  await expect.poll(() => items.count()).toBeGreaterThan(1);
  const names = await items.getByTestId('result-name').allInnerTexts();
  for (const n of names.slice(0, 3)) {
    await items.filter({ hasText: n }).first().click();
    await expect(inspector(page).getByRole('article')).toHaveAttribute('aria-label', `Place: ${n}`);
    await expect(inspector(page).getByRole('heading', { level: 3 })).toHaveText(n);
  }
});
