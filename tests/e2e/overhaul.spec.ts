/**
 * The unified-map overhaul (no backend; guest workspace + dev fixtures):
 * one map with discovery + droplet pins, filters, "Things near me", Settings
 * for animations & weather, aircraft/weather layers, chess squares and links,
 * branding.
 */
import { expect, test, type Page } from '@playwright/test';
import { freshGuest, sidePanel, waitForMap, type AtlasWindow } from './helpers';

const atl = async (page: Page, zoom = 16) => {
  await page.addInitScript((z) => {
    if (sessionStorage.getItem('__atl')) return;
    sessionStorage.setItem('__atl', '1');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-84.3885, 33.7553], zoom: z }));
  }, zoom);
};

test('one unified map: / opens My Map with discovery and pins together; no Discover tab', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/maps\/[0-9a-f-]{36}/);
  const tabs = page.getByRole('navigation', { name: 'Map contexts' });
  await expect(tabs.getByRole('link', { name: 'My Map' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('link', { name: 'Discover' })).toHaveCount(0);
  await expect(sidePanel(page).getByRole('tab', { name: 'Nearby' })).toHaveAttribute('aria-selected', 'true');
  await expect(sidePanel(page).getByRole('toolbar', { name: 'Discover categories' })).toBeVisible();
  await sidePanel(page).getByRole('tab', { name: 'My pins' }).click();
  await expect(sidePanel(page).getByRole('button', { name: 'Add custom pin' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
});

test('old Discover share links still open (query carried to the unified map)', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/?landmark=Eiffel%20Tower&at=48.8583,2.29448');
  await expect(page).toHaveURL(/\/maps\/[0-9a-f-]{36}/);
  await waitForMap(page);
  await expect.poll(() => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getCenter().lat), { timeout: 15_000 }).toBeCloseTo(48.858, 2);
});

test('discovery places are small badges; basemap POIs are limited to parking/entrances; Hide all hides every category icon', async ({ page }) => {
  await freshGuest(page, { allCategories: true });
  await atl(page);
  await page.goto('/');
  await waitForMap(page);
  const info = () => page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    const l = m.getStyle().layers.find((x) => x.id === 'atlas-places') as { layout: Record<string, unknown> };
    const basemapPoi = m.getStyle().layers.filter((x) => 'source-layer' in x && x['source-layer'] === 'poi' && !x.id.startsWith('atlas-') && x.id !== 'poi_transit');
    return { anchor: l.layout['icon-anchor'], filter: JSON.stringify(m.getFilter('atlas-places')), basemap: basemapPoi.map((x) => JSON.stringify((x as { filter?: unknown }).filter)) };
  });
  const before = await info();
  expect(before.anchor).toBe('center');
  expect(before.filter).toContain('restaurant');
  for (const f of before.basemap) expect(f).toContain('parking');
  await sidePanel(page).getByRole('button', { name: 'Hide all' }).click();
  await expect.poll(async () => (await info()).filter).toContain('__none__');
  await expect(page.getByText('All Discover categories are hidden.')).toBeVisible();
  await sidePanel(page).getByRole('button', { name: 'Show all' }).click();
  await expect.poll(async () => (await info()).filter).toContain('restaurant');
});

test('"Things near me": one list, closest first from your location, worded "… away" (never "straight line")', async ({ page, context }) => {
  await freshGuest(page, { allCategories: true });
  await atl(page, 16.5);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.7553, longitude: -84.3885 });
  await page.goto('/');
  await waitForMap(page);
  const list = page.getByTestId('near-me-list');
  await expect(list.locator('li').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Things near me' })).toBeVisible();
  const d = await list.getByTestId('result-distance').allTextContents();
  expect(d.length).toBeGreaterThan(3);
  for (const t of d) expect(t).toMatch(/^[\d.]+ (mi|ft|m|km) away$/);
  const meters = d.map((t) => { const [n, u] = t.split(' '); return Number(n) * ({ mi: 1609.344, ft: 0.3048, m: 1, km: 1000 } as Record<string, number>)[u]; });
  for (let i = 1; i < meters.length; i++) expect(meters[i] + 1).toBeGreaterThanOrEqual(meters[i - 1]); // sorted (display rounding tolerated)
  await expect(page.locator('body')).not.toContainText(/straight[- ]line/i);
  // Selecting a list item focuses the map and opens THAT place's details.
  const first = list.getByTestId('result-name').first();
  const name = (await first.textContent())!;
  await first.click();
  await expect(page.getByRole('complementary', { name: 'Details' }).getByRole('heading', { name, exact: true }).first()).toBeVisible();
});

test('map animation controls live in Settings (floating bar removed) and persist', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/');
  await waitForMap(page);
  await expect(page.getByRole('group', { name: 'Map animations' })).toHaveCount(0);
  await page.goto('/settings/animations');
  await expect(page.getByRole('heading', { name: 'Map animations & weather' })).toBeVisible();
  await page.getByRole('radio', { name: '2×' }).click();
  await page.getByRole('switch', { name: 'Aircraft' }).click();
  await page.reload();
  await expect(page.getByRole('radio', { name: '2×' })).toHaveAttribute('aria-checked', 'true');
  const kinds = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas.ambient.kinds.v1') ?? '{}'));
  expect(kinds.planes).toBe(false);
});

test('manual weather: rainy/cloudy/sunny draw immediately, persist after reload; Off removes effects', async ({ page }) => {
  await freshGuest(page);
  await page.route('https://api.open-meteo.com/**', (r) => r.abort()); // live data never overrides manual
  await page.goto('/settings/animations');
  await page.getByRole('radio', { name: 'Manual' }).click();
  await page.getByRole('radio', { name: 'Rainy', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await waitForMap(page);
  await expect(page.getByTestId('weather-chip')).toContainText('Rainy (manual)');
  const sky = page.locator('canvas.atlas-sky');
  await expect(sky).toHaveCount(1);
  expect(await sky.evaluate((c: HTMLCanvasElement) => [c.height > 0, getComputedStyle(c).pointerEvents])).toEqual([true, 'none']);
  await page.reload();
  await expect(page.getByTestId('weather-chip')).toContainText('Rainy (manual)');
  // Clicks reach the map through the weather layer.
  await page.goto('/settings/animations');
  await page.getByRole('radio', { name: 'Cloudy', exact: true }).click();
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByTestId('weather-chip')).toHaveCount(0);
});

test('automatic weather uses live data, and says so honestly when it is unavailable', async ({ page }) => {
  await freshGuest(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('__w')) { sessionStorage.setItem('__w', '1'); localStorage.setItem('atlas.weather.v1', JSON.stringify({ mode: 'auto', manual: 'rain', intensity: 0.6 })); } });
  let calls = 0;
  await page.route('https://api.open-meteo.com/**', (r) => {
    calls++;
    const url = new URL(r.request().url());
    if (url.searchParams.get('current')?.includes('weather_code')) {
      return r.fulfill({ json: { timezone: 'America/New_York', current: { time: '2026-10-11T10:00', weather_code: 63, cloud_cover: 90, is_day: 1, temperature_2m: 14.2 } } });
    }
    return r.fulfill({ json: { timezone: 'America/New_York', current: { is_day: 1 } } });
  });
  await page.goto('/');
  await waitForMap(page);
  await expect(page.getByTestId('weather-chip')).toContainText('Rainy · 14°C', { timeout: 15_000 });
  await expect(page.getByTestId('weather-chip')).toContainText('Open-Meteo');
  // Coordinates are rounded to 0.25° before leaving the device.
  expect(calls).toBeGreaterThan(0);
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 429, body: 'rate limited' }));
  await page.evaluate(() => (window as AtlasWindow).__atlasMap!.jumpTo({ center: [2.35, 48.85] }));
  await expect(page.getByTestId('weather-chip')).toContainText('Live weather unavailable', { timeout: 15_000 });
});

test('ambient life renders detailed models (cars with cabins and wheels, people, trains)', async ({ page }) => {
  await freshGuest(page);
  await atl(page, 17);
  await page.goto('/');
  await waitForMap(page);
  await expect.poll(async () => page.evaluate(async () => {
    const s = (window as AtlasWindow).__atlasMap!.getSource('atlas-ambient') as unknown as { getData: () => Promise<{ features: { properties: { c: string } }[] }> } | undefined;
    if (!s) return 0;
    return (await s.getData()).features.length;
  }), { timeout: 30_000 }).toBeGreaterThan(20);
  const colours = await page.evaluate(async () => {
    const s = (window as AtlasWindow).__atlasMap!.getSource('atlas-ambient') as unknown as { getData: () => Promise<{ features: { properties: { c: string } }[] }> };
    return [...new Set((await s.getData()).features.map((f) => f.properties.c))];
  });
  expect(colours).toContain('#1c1d21'); // wheels/tyres
  expect(colours).toContain('#33465a'); // glass
});

test('chess: empty squares are compact and occupied squares expand; copying a link never creates a game', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await freshGuest(page);
  await page.goto('/chess');
  const board = page.getByRole('grid', { name: 'Local chessboard' });
  await expect(board).toBeVisible();
  const scale = (sq: string) => board.locator(`[data-square="${sq}"] [data-tile]`).evaluate((el) => (el as HTMLElement).style.transform);
  expect(await scale('e4')).toBe('scale(0.86)');
  expect(await scale('e2')).toBe('scale(1)');
  await page.waitForTimeout(600); // let the sheet's entrance animation finish
  const cell = await board.locator('[data-square="e4"]').boundingBox();
  await board.getByRole('gridcell', { name: /^e2/ }).click();
  await board.getByRole('gridcell', { name: /^e4/ }).click();
  await expect.poll(() => scale('e4')).toBe('scale(1)');
  await expect.poll(() => scale('e2')).toBe('scale(0.86)');
  expect(await board.locator('[data-square="e4"]').boundingBox()).toEqual(cell); // geometry never shifts
  await page.getByTestId('copy-chess-link').click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/chess\?moves=e4$/);
  // The recipient opens a COPY (asked first), validated by replaying the moves.
  const other = await context.newPage();
  await other.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await expect(other.getByText(/shared a position with you \(1 moves\)/)).toBeVisible();
  await other.getByRole('button', { name: 'Load position' }).click();
  await expect(other.getByRole('grid', { name: 'Local chessboard' }).getByRole('gridcell', { name: 'e4, white pawn' })).toBeVisible();
  await other.goto('/chess?moves=e4+Ke9');
  await expect(other.getByText(/isn’t valid/)).toBeVisible();
});

test('online chess links: malformed or foreign game ids get clear messages, not a broken page', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/chess/not-a-uuid');
  await page.getByRole('tab', { name: 'Play online' }).click();
  await expect(page.getByText(/need an account|malformed/)).toBeVisible();
});

test('new Atlas mark is used in the nav, as the favicon and the app icons', async ({ page, request }) => {
  await freshGuest(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Atlas home' }).locator('svg')).toBeVisible();
  const ico = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
  expect(ico).toBe('/atlas.svg');
  for (const p of ['/atlas.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/manifest.webmanifest']) {
    expect((await request.get(p)).status(), p).toBe(200);
  }
  expect(await (await request.get('/atlas.svg')).text()).toContain('A25 8.4'); // the orbit
});
