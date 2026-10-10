/**
 * Living-map features in a real browser (no backend): interactive previews,
 * category Discover with real OpenStreetMap POIs from the basemap tiles,
 * Hide All, distance, save flows with attendance, selection emphasis, and
 * ambient animation controls.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickMapAt, createGroupInPicker, freshGuest, waitForMap, type AtlasWindow, openMap } from './helpers';

const CENTRAL_PARK: [number, number] = [-73.9705, 40.7735];

async function at(page: Page, center: [number, number], zoom: number, categories: string[]) {
  await page.addInitScript(([c, z, cats]) => {
    if (sessionStorage.getItem('__lm')) return;
    sessionStorage.setItem('__lm', '1');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: c, zoom: z }));
    localStorage.setItem('atlas.discover.categories.v1', JSON.stringify({ visible: cats, subs: {} }));
  }, [center, zoom, categories] as const);
}

const renderedCount = (page: Page, layer: string) =>
  page.evaluate((l) => {
    const m = (window as AtlasWindow).__atlasMap!;
    return m.getLayer(l) ? m.queryRenderedFeatures({ layers: [l] }).length : -1;
  }, layer);

async function waitForPlaces(page: Page) {
  await waitForMap(page);
  await expect.poll(() => renderedCount(page, 'atlas-places'), { timeout: 20_000 }).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => freshGuest(page));

test('hover and keyboard focus show a preview; click opens rich details', async ({ page }) => {
  await at(page, [-74.0007, 40.7309], 15, ['events']);
  await page.goto('/');
  await waitForMap(page);
  await expect.poll(() => renderedCount(page, 'discover-points')).toBeGreaterThan(0);
  // Hover the real marker.
  const pt = await page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    const p = m.project([-74.0007, 40.7309]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.move(pt.x, pt.y);
  const preview = page.getByTestId('marker-preview');
  await expect(preview).toContainText('Late Night Jazz');
  await expect(preview).toContainText('Development sample');
  await page.mouse.move(pt.x + 300, pt.y + 200);
  await expect(preview).toHaveCount(0);
  // Keyboard focus in the results list shows the same preview.
  await page.getByRole('button', { name: /Late Night Jazz/ }).focus();
  await expect(page.getByTestId('marker-preview')).toContainText('Late Night Jazz');
  // Click opens details; preview hides for the selected item.
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByRole('article', { name: /Event: Sample: Late Night Jazz/ })).toBeVisible();
  await expect(page.getByTestId('selection-halo')).toBeVisible();
});

test('category Discover: real OSM places, subcategories, list/map sync, details with attribution', async ({ page }) => {
  await at(page, CENTRAL_PARK, 15.5, ['food']);
  await page.goto('/');
  await waitForPlaces(page);
  const list = page.locator('[data-tour="places-in-view"]');
  await expect(list.getByText(/Food & Drink/).first()).toBeVisible();
  const firstPlace = list.locator('li button').first();
  await expect(firstPlace).toBeVisible();

  // Subcategory: only cafés.
  await page.getByRole('button', { name: 'Food & Drink types' }).click();
  await page.getByRole('checkbox', { name: 'Cafés' }).check();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await list.locator('li button').allInnerTexts()).every((t) => t.includes('Cafés'))).toBe(true);
  await expect(page.getByRole('button', { name: /Food & Drink/, pressed: true })).toContainText('1');

  // Hovering a list item previews the place; clicking opens details.
  const item = list.locator('li button').first();
  const name = (await item.getByTestId('result-name').innerText()).trim();
  await item.hover();
  await expect(page.getByTestId('marker-preview')).toContainText(name);
  await item.click();
  const card = page.getByRole('article', { name: `Place: ${name}` });
  await expect(card).toBeVisible();
  await expect(card.getByText('Data © OpenStreetMap contributors (ODbL)')).toBeVisible();
  await expect(card.getByRole('link', { name: /View on OSM/ })).toHaveAttribute('href', /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
  // No backend here: extra details are honestly unavailable, never invented.
  await expect(card.getByText(/More details need the Atlas server/)).toBeVisible();
  await expect(card.getByText('Unavailable').first()).toBeVisible();
});

test('Hide All hides Discover overlays only; Show all restores; no leakage into personal maps', async ({ page }) => {
  await at(page, CENTRAL_PARK, 15.5, ['events', 'food', 'parks']);
  await page.goto('/');
  // A personal (guest) pin must stay visible regardless of Discover categories.
  await openMap(page);
  await waitForMap(page);
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  await clickMapAt(page);
  const dlg = page.getByRole('dialog', { name: 'New custom pin' });
  await dlg.getByLabel('Title').fill('My secret spot');
  await createGroupInPicker(dlg, 'Mine');
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  await expect(page.getByRole('toolbar', { name: 'Discover categories' })).toHaveCount(0); // not in personal context
  expect(await renderedCount(page, 'atlas-places')).toBe(0);

  await page.getByRole('link', { name: 'Discover' }).click();
  await waitForPlaces(page);
  await page.getByRole('button', { name: 'Hide all' }).click();
  await expect(page.getByText('All Discover categories are hidden.')).toBeVisible();
  await expect.poll(() => renderedCount(page, 'atlas-places')).toBe(0);
  await expect.poll(() => renderedCount(page, 'discover-points')).toBe(0);
  await expect(page.getByRole('toolbar', { name: 'Discover categories' }).getByRole('button', { pressed: true })).toHaveCount(0);
  await openMap(page);
  await expect(page.getByRole('button', { name: 'My secret spot', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Discover' }).click();
  await page.getByRole('button', { name: 'Show all' }).click();
  await waitForPlaces(page);
  await expect(page.getByRole('button', { name: /Events/, pressed: true })).toBeVisible();
});

test('distance is shown only after sharing location, labelled straight-line', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.7681, longitude: -73.9819 }); // Columbus Circle
  await at(page, CENTRAL_PARK, 15.5, ['parks']);
  await page.goto('/');
  await waitForPlaces(page);
  const list = page.locator('[data-tour="places-in-view"]');
  await expect(list).not.toContainText('straight line');
  await page.getByRole('button', { name: 'Use my location to show distances' }).click();
  await expect(list.locator('li').first()).toContainText(/away \(straight line\)/);
  // Every distance is labelled straight-line; none claims walking/driving time or distance.
  const lines = await list.getByTestId('result-distance').allInnerTexts();
  expect(lines.length).toBe(await list.locator('li').count()); // every place shows one
  for (const l of lines) {
    expect(l).toMatch(/away \(straight line\)$/);
    expect(l).not.toMatch(/(walking|driving|drive|by car|min walk)/i);
  }
});

test('denied location is handled honestly', async ({ page }) => {
  await at(page, CENTRAL_PARK, 15.5, ['parks']);
  await page.goto('/');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok: unknown, err: (e: { code: number; PERMISSION_DENIED: number }) => void) => err({ code: 1, PERMISSION_DENIED: 1 }) } });
  });
  await page.getByRole('button', { name: 'Use my location to show distances' }).click();
  await expect(page.getByRole('button', { name: 'Location permission denied — distances unavailable' })).toBeVisible();
});

test('save a place to a guest map (group required, no duplicate) and an event with attendance', async ({ page }) => {
  await at(page, CENTRAL_PARK, 15.5, ['food', 'events']);
  await page.goto('/');
  await waitForPlaces(page);
  const item = page.locator('[data-tour="places-in-view"] li button').first();
  const name = (await item.getByTestId('result-name').innerText()).trim();
  await item.click();
  // Inline "Add to map" in the inspector.
  const form = page.getByRole('region', { name: 'Add to map' });
  await expect(form.getByLabel('Select map')).toContainText('My Map');
  await form.getByRole('radio', { name: 'Collaboration Map' }).click();
  await expect(form.getByText(/Collaboration maps need an account/)).toBeVisible();
  await form.getByRole('radio', { name: 'Personal Map' }).click();
  await form.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(form.getByText('Choose at least one group.')).toBeVisible();
  await createGroupInPicker(form, 'Eats');
  await form.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Added to My Map');
  // Saved state: bookmark filled, and the form now updates instead of duplicating.
  await expect(page.getByRole('article', { name: `Place: ${name}` }).getByRole('button', { name: 'Saved to a map — edit' })).toBeVisible();
  await expect(form.getByText(/already on this map/)).toBeVisible();
  await expect(form.getByRole('button', { name: 'Update on map' })).toBeVisible();

  // Event with attendance.
  await page.evaluate(() => (window as AtlasWindow).__atlasMap!.jumpTo({ center: [-74.0007, 40.7309], zoom: 14 }));
  await page.getByRole('button', { name: /Late Night Jazz/ }).click();
  const ef = page.getByRole('region', { name: 'Add to map' });
  await ef.getByRole('radio', { name: 'Going' }).click();
  await ef.getByRole('checkbox', { name: 'Eats' }).check();
  await ef.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(ef.getByRole('status')).toContainText('Added to My Map');

  // Both appear on the personal map; attendance shown on the pin.
  await openMap(page);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Late Night Jazz/ }).first().click();
  await expect(page.getByRole('radio', { name: 'Going' })).toHaveAttribute('aria-checked', 'true');
});

test('selected building footprint is emphasised from real geometry; halo is static with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await at(page, [-73.9857, 40.7484], 17, ['attractions']); // Empire State Building area
  await page.goto('/');
  await waitForPlaces(page);
  const item = page.locator('[data-tour="places-in-view"] li button').filter({ hasText: 'Empire State Building' }).first();
  await item.click();
  await expect(page.getByTestId('selection-halo')).toBeVisible();
  // The highlighted polygon is the OSM building footprint containing the selected point.
  await expect.poll(() => page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    return m.querySourceFeatures('atlas-emphasis').length;
  }), { timeout: 10_000 }).toBeGreaterThan(0);
  const anim = await page.locator('.atlas-halo').first().evaluate((el) => getComputedStyle(el).animationName).catch(() => 'none');
  expect(anim).toBe('none');
});

test('ambient life runs on real geometry, stops when disabled, and never blocks the map', async ({ page }) => {
  await at(page, [-73.9857, 40.758], 15.5, ['events']);
  await page.goto('/');
  await waitForMap(page);
  const ambientCount = () => page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    return m.getSource('atlas-ambient') ? m.querySourceFeatures('atlas-ambient').length : -1;
  });
  await expect.poll(ambientCount, { timeout: 15_000 }).toBeGreaterThan(0);
  const pos1 = await page.evaluate(() => JSON.stringify((window as AtlasWindow).__atlasMap!.querySourceFeatures('atlas-ambient').map((f) => (f.geometry as GeoJSON.Point).coordinates)));
  await page.waitForTimeout(800);
  const pos2 = await page.evaluate(() => JSON.stringify((window as AtlasWindow).__atlasMap!.querySourceFeatures('atlas-ambient').map((f) => (f.geometry as GeoJSON.Point).coordinates)));
  expect(pos2).not.toBe(pos1); // moving
  // Map stays interactive while ambience runs: a mouse drag pans the map.
  const before = await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getCenter().toArray());
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  const after = await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getCenter().toArray());
  expect(after[0]).not.toBeCloseTo(before[0], 4);
  // ...and the Filters control still opens.
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('dialog', { name: 'Event filters' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Turning it off in Settings removes it.
  await page.goto('/settings/appearance');
  await page.getByRole('switch', { name: 'Ambient map life' }).click();
  await page.goto('/');
  await waitForMap(page);
  await page.waitForTimeout(1500);
  expect(await ambientCount()).toBe(-1);
});

test('ambient life is off under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await at(page, [-73.9857, 40.758], 15.5, ['events']);
  await page.goto('/');
  await waitForMap(page);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => !!(window as AtlasWindow).__atlasMap!.getSource('atlas-ambient'))).toBe(false);
  await page.goto('/settings/appearance');
  await expect(page.getByText('Off because your system asks for reduced motion.')).toBeVisible();
});
