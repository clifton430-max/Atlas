import { expect, type Page } from '@playwright/test';

export type AtlasWindow = Window & { __atlasMap?: import('maplibre-gl').Map };

/** Fresh guest: fixed viewport, first-run tour offer already answered. */
export async function freshGuest(page: Page, opts: { firstRun?: boolean } = {}) {
  await page.addInitScript((firstRun) => {
    if (sessionStorage.getItem('__seeded')) return; // only on the first load of the test
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.985, 40.748], zoom: 12 }));
    if (!firstRun) localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
  }, opts.firstRun ?? false);
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
