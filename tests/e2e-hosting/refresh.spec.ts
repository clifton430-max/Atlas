/**
 * Root cause of "shared pages stop loading after refresh": the host had no
 * SPA fallback, so /collab/<id>, /chess/<id>, /maps/<id> … returned 404 on a
 * direct load (verified against the live site before the fix). vercel.json now
 * rewrites unknown paths to /index.html while real files (assets, models,
 * icons) are served as-is and missing assets still 404.
 */
import { expect, test } from '@playwright/test';

const id = '4f0c9a2e-8a1b-4c3d-9e8f-0123456789ab';

for (const path of [`/collab/${id}?pin=${id}`, `/chess/${id}`, `/chess?venue=osm:node/9209122821`, `/maps/${id}?pin=${id}`, '/treasure?tab=collection', '/settings/animations', `/invite/abc`]) {
  test(`direct open and refresh of ${path} load the app at the same URL`, async ({ page, request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Atlas home' })).toBeVisible({ timeout: 20_000 });
    const before = page.url();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Atlas home' })).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toBe(before);
  });
}

test('real files are served as files; a missing asset is a 404 (never index.html)', async ({ request }) => {
  expect((await request.get('/atlas.svg')).headers()['content-type']).toContain('svg');
  expect((await request.get('/models/monuments/farnese-atlas.glb')).status()).toBe(200);
  expect((await request.get('/assets/does-not-exist.js')).status()).toBe(404);
  expect((await request.get('/models/monuments/nope.glb')).status()).toBe(404);
});

test('back/forward across shared routes keeps working', async ({ page }) => {
  await page.goto(`/chess/${id}`);
  await expect(page.getByRole('heading', { name: 'Chess room' })).toBeVisible({ timeout: 20_000 });
  await page.goto('/settings/animations');
  await expect(page.getByRole('heading', { name: 'Map animations & weather' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/chess/${id}$`));
  await expect(page.getByRole('heading', { name: 'Chess room' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/settings\/animations$/);
});
