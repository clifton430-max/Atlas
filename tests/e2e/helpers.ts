import { expect, type Page } from '@playwright/test';

export type AtlasWindow = Window & { __atlasMap?: import('maplibre-gl').Map };

/**
 * Fresh guest: fixed viewport, first-run tour offer already answered, weather
 * off (tests that need it turn it on). `allCategories` keeps the new default
 * (every category visible); otherwise the original three are visible so older
 * tests see the same markers they were written for.
 */
export async function freshGuest(page: Page, opts: { firstRun?: boolean; allCategories?: boolean } = {}) {
  await page.addInitScript(([firstRun, all]) => {
    if (sessionStorage.getItem('__seeded')) return; // only on the first load of the test
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.985, 40.748], zoom: 12 }));
    if (!firstRun) localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
    if (!all) localStorage.setItem('atlas.discover.categories.v2', JSON.stringify({ visible: ['events', 'attractions', 'scenic'], subs: {} }));
    localStorage.setItem('atlas.weather.v1', JSON.stringify({ mode: 'off', manual: 'rain', intensity: 0.6 }));
  }, [opts.firstRun ?? false, opts.allCategories ?? false] as const);
}

export async function waitForMap(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as AtlasWindow).__atlasMap;
    return !!m && m.loaded();
  }, null, { timeout: 30_000 });
}

export async function clickMapAt(page: Page, dx = 0, dy = 0) {
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** A real PNG produced by the browser's canvas. */
export async function makePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#be123c'; ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#fde047'; ctx.fillRect(24, 24, 48, 48);
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

export async function createGroupInPicker(scope: import('@playwright/test').Locator, name: string) {
  if (await scope.getByRole('button', { name: 'New group' }).isVisible()) await scope.getByRole('button', { name: 'New group' }).click();
  await scope.getByLabel('New group name').fill(name);
  await scope.getByRole('button', { name: 'Add group' }).click();
  await expect(scope.getByRole('checkbox', { name })).toBeChecked();
}

// ---- Navigation in the tabbed shell ------------------------------------------------
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Map contexts' });
export const sidePanel = (page: Page) => page.getByRole('complementary', { name: 'Side panel' });
export const inspector = (page: Page) => page.getByRole('complementary', { name: 'Details' });
/** A personal/collab map link in the side panel (exact name: "My Map" ≠ the "My Maps" tab). */
export const mapLink = (page: Page, name: string | RegExp) =>
  sidePanel(page).getByRole('link', typeof name === 'string' ? { name, exact: true } : { name });

/** Discovery now lives on the unified map: "My Map" tab + the side panel's Nearby tab. */
export async function openDiscover(page: Page) {
  await tabs(page).getByRole('link', { name: 'My Map', exact: true }).click();
  await expect(page).toHaveURL(/\/maps\//);
  await sidePanel(page).getByRole('tab', { name: 'Nearby' }).click();
}
/** "My Map" tab: lands on the last-used (or first) personal map, showing the My pins panel. */
export async function openMyMaps(page: Page) {
  await tabs(page).getByRole('link', { name: 'My Map', exact: true }).click();
  await expect(page).toHaveURL(/\/maps/);
  await sidePanel(page).getByRole('tab', { name: 'My pins' }).click();
}
export async function openMap(page: Page, name = 'My Map') {
  await openMyMaps(page);
  await mapLink(page, name).click();
  await expect(mapLink(page, name)).toHaveAttribute('aria-current', 'page');
}
export async function openShared(page: Page) {
  await tabs(page).getByRole('link', { name: 'Shared' }).click();
  await expect(page).toHaveURL(/\/collab/);
}
