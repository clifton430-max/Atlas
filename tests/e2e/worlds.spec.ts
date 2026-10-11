/**
 * My Map <-> Shared worlds (no backend), skins preview, Treasure for guests,
 * and the monument asset pipeline in a real browser.
 */
import { expect, test, type Page } from '@playwright/test';
import { freshGuest, openMyMaps, waitForMap, type AtlasWindow } from './helpers';

const bg = (page: Page) => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getPaintProperty('background', 'background-color'));
const ui = (page: Page, patch: Record<string, unknown>) => page.evaluate((p) => (window as unknown as { __atlasUi: { set(x: unknown): void } }).__atlasUi.set(p), patch);

test.beforeEach(async ({ page }) => {
  await freshGuest(page);
  await page.addInitScript(() => { localStorage.setItem('atlas.lighting.v1', 'day'); });
});

test('switching worlds re-themes the live map (no reload), sweeps, and restores the shared look exactly', async ({ page }) => {
  await page.goto('/collab/demo');
  await waitForMap(page);
  const sharedBg = await bg(page);
  const mapObj = await page.evaluate(() => { (window as unknown as { __first: unknown }).__first = (window as AtlasWindow).__atlasMap; return true; });
  expect(mapObj).toBe(true);
  await openMyMaps(page);
  await expect(page.getByTestId('world-sweep')).toBeAttached();
  await expect.poll(() => bg(page)).toBe('#ece4d2'); // personal world default
  // Same map instance: nothing was rebuilt.
  expect(await page.evaluate(() => (window as unknown as { __first: unknown }).__first === (window as AtlasWindow).__atlasMap)).toBe(true);
  // Empty personal map shows actionable empty state.
  await expect(page.getByRole('region', { name: 'Your map is empty' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your map is empty' }).getByRole('button', { name: 'Add a pin' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'Shared' }).click();
  await expect.poll(() => bg(page)).toBe(sharedBg);
});

test('skin preview changes real map properties on a personal map only; stop preview restores', async ({ page }) => {
  await page.goto('/maps');
  await waitForMap(page);
  const mapId = page.url().split('/maps/')[1];
  await ui(page, { skinPreview: { mapId, defId: 'skin:midnight-navigator' } });
  await expect(page.getByRole('status').filter({ hasText: 'Previewing' })).toContainText('Midnight Navigator');
  await expect.poll(() => bg(page)).toBe('#141b33');
  expect(await page.evaluate(() => JSON.stringify((window as AtlasWindow).__atlasMap!.getLayoutProperty('label_city', 'text-font')))).toContain('Noto Sans Regular');
  await page.getByRole('button', { name: 'Stop preview' }).click();
  await expect.poll(() => bg(page)).toBe('#ece4d2');
  // Previews never leak into shared maps.
  await ui(page, { skinPreview: { mapId, defId: 'skin:celestial-routes' } });
  await page.goto('/collab/demo');
  await waitForMap(page);
  await expect.poll(() => bg(page)).not.toBe('#0b1030');
});

test('reduced motion: worlds switch without the sweep', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/collab/demo');
  await waitForMap(page);
  await openMyMaps(page);
  await expect.poll(() => bg(page)).toBe('#ece4d2');
  await expect(page.getByTestId('world-sweep')).toHaveCount(0);
});

test('the tab indicator glides to the active context', async ({ page }) => {
  await page.goto('/');
  const ind = page.getByTestId('tab-indicator');
  await expect(ind).toBeVisible();
  const x0 = (await ind.boundingBox())!.x;
  await page.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'Shared' }).click();
  await expect.poll(async () => (await ind.boundingBox())!.x).toBeGreaterThan(x0 + 20);
});

test('Treasure without a server: catalog browsable, honest about rolling, no fake odds', async ({ page }) => {
  await page.goto('/treasure');
  await expect(page.getByRole('heading', { name: 'Treasure' })).toBeVisible();
  await expect(page.getByText('Odds are published by the Atlas server')).toBeVisible();
  await expect(page.getByText(/Crates need the Atlas server/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Open crate/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Collection' }).click();
  await expect(page.getByText('0/36 unique collected')).toBeVisible();
  await page.getByRole('tab', { name: 'Map Skin Crates' }).click();
  await page.getByRole('tab', { name: 'Collection' }).click();
  await page.getByRole('radio', { name: 'Map skins' }).click();
  await expect(page.getByRole('list', { name: 'Map skins' }).getByRole('listitem')).toHaveCount(37);
});

test('all 18 monument models load as interactive colour 3D (asset pipeline)', async ({ page }) => {
  for (const pageNo of [0, 1]) {
    await page.goto(`/__dev/monuments?page=${pageNo}`);
    await expect.poll(() => page.locator('[data-state="ready"]').count(), { timeout: 30_000 }).toBe(9);
    expect(await page.locator('[data-state="error"]').count()).toBe(0);
  }
});
