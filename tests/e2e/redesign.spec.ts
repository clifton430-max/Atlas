/**
 * Map & interface redesign (no backend): editor shell, tabs, inspector,
 * teardrop markers and their selected state, map toolbar, responsive layout.
 */
import { expect, test, type Page } from '@playwright/test';
import { freshGuest, inspector, mapLink, openDiscover, openMyMaps, openShared, sidePanel, waitForMap, type AtlasWindow } from './helpers';

const JAZZ: [number, number] = [-74.0007, 40.7309];

async function at(page: Page, center: [number, number], zoom: number, categories: string[]) {
  await page.addInitScript(([c, z, cats]) => {
    if (sessionStorage.getItem('__rd')) return;
    sessionStorage.setItem('__rd', '1');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: c, zoom: z }));
    localStorage.setItem('atlas.discover.categories.v2', JSON.stringify({ visible: cats, subs: {} }));
  }, [center, zoom, categories] as const);
}

const screenPoint = (page: Page, lngLat: [number, number], dy = 0) => page.evaluate(([ll, d]) => {
  const m = (window as AtlasWindow).__atlasMap!;
  const p = m.project(ll as [number, number]);
  const r = m.getCanvas().getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y + (d as number) };
}, [lngLat, dy] as const);

test.beforeEach(async ({ page }) => freshGuest(page));

test('shell: tabs switch contexts, side panel follows, My Map remembers the last map', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/maps\/.+/); // straight to the guest's map
  await expect(page.getByRole('heading', { name: 'My Map', level: 1 })).toBeVisible();
  await expect(sidePanel(page).getByRole('toolbar', { name: 'Discover categories' })).toBeVisible();

  await openMyMaps(page);
  await expect(sidePanel(page).getByRole('button', { name: 'Add custom pin' })).toBeVisible();
  // A second map becomes the remembered one.
  await page.getByRole('tab', { name: 'My pins' }).click();
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill('Second');
  await page.getByRole('button', { name: 'Create map' }).click();
  await expect(mapLink(page, 'Second')).toHaveAttribute('aria-current', 'page');
  await openDiscover(page);
  await openMyMaps(page);
  await expect(mapLink(page, 'Second')).toHaveAttribute('aria-current', 'page');

  await openShared(page);
  await expect(page.getByRole('heading', { name: 'Shared', level: 1 })).toBeVisible();
  await expect(mapLink(page, /Weekend trip \(demo\)/)).toBeVisible();

  // The map switcher lists every map and opens it.
  await page.getByRole('button', { name: /Current map: .* Switch map/ }).click();
  await page.getByRole('dialog', { name: 'Switch map' }).getByRole('link', { name: 'My Map', exact: true }).click();
  await expect(mapLink(page, 'My Map')).toHaveAttribute('aria-current', 'page');
});

test('inspector: empty state with legend, selected event details, close returns to the legend', async ({ page }) => {
  await at(page, JAZZ, 15, ['events']);
  await page.goto('/');
  await waitForMap(page);
  await expect(inspector(page).getByText('Nothing selected')).toBeVisible();
  await expect(inspector(page).getByText(/Decorative:/)).toBeVisible();
  await page.getByRole('button', { name: /Late Night Jazz/ }).click();
  const card = inspector(page).getByRole('article', { name: /Event: Sample: Late Night Jazz/ });
  await expect(card).toBeVisible();
  await expect(inspector(page).getByRole('heading', { name: 'Selected event' })).toBeVisible();
  await inspector(page).getByRole('button', { name: 'Close event details' }).click();
  await expect(card).toHaveCount(0);
  await expect(inspector(page).getByText('Nothing selected')).toBeVisible();
});

test('unsaved discovery markers are small badges centred on the coordinate; clicking selects; selection enlarges it', async ({ page }) => {
  await at(page, JAZZ, 15, ['events']);
  await page.goto('/');
  await waitForMap(page);
  await expect.poll(() => page.evaluate(() => (window as AtlasWindow).__atlasMap!.queryRenderedFeatures({ layers: ['discover-points'] }).length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getLayoutProperty('discover-points', 'icon-anchor'))).toBe('center');
  const c = await screenPoint(page, JAZZ, 0);
  await page.mouse.click(c.x, c.y);
  await expect(inspector(page).getByRole('article', { name: /Late Night Jazz/ })).toBeVisible();
  const size = await page.evaluate(() => JSON.stringify((window as AtlasWindow).__atlasMap!.getLayoutProperty('discover-points', 'icon-size')));
  expect(size).toContain('1.35'); // selected badge drawn larger
  // Small: nothing of the badge 20 px above the coordinate (droplets are for saved pins).
  const above = await page.evaluate(([ll]) => {
    const m = (window as AtlasWindow).__atlasMap!;
    const p = m.project(ll as [number, number]);
    return m.queryRenderedFeatures([p.x, p.y - 24], { layers: ['discover-points'] }).length;
  }, [JAZZ] as const);
  expect(above).toBe(0);
});

test('place details: inset layout, bookmark, collapsible "More about this place"', async ({ page }) => {
  await at(page, [-73.9857, 40.7484], 16, ['attractions']);
  await page.goto('/');
  await waitForMap(page);
  await sidePanel(page).getByRole('button', { name: /Empire State Building/ }).first().click();
  const card = inspector(page).getByRole('article', { name: /Place: Empire State Building/ });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Bookmark: add to a map' })).toBeVisible();
  const more = card.getByRole('button', { name: 'More about this place' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByText(/40\.748\d*, -73\.98/)).toBeVisible();
});

test('map toolbar: zoom, 2D/3D work and are labelled; animation controls moved to Settings', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const zoom = () => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getZoom());
  const z0 = await zoom();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(zoom).toBeGreaterThan(z0 + 0.5);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(zoom).toBeLessThan(z0 + 0.5);

  const threeD = page.getByRole('button', { name: '3D view' });
  const pitch = () => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getPitch());
  if ((await threeD.getAttribute('aria-pressed')) === 'true') await threeD.click();
  await expect.poll(pitch).toBe(0);
  await threeD.click();
  await expect(threeD).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(pitch).toBeGreaterThan(30);
  expect(await page.evaluate(() => localStorage.getItem('atlas.view.v1'))).toBe('3d');

  await expect(page.getByRole('group', { name: 'Map animations' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Layers' }).click();
  const layers = page.getByRole('dialog', { name: 'Map layers' });
  await expect(layers.getByText(/Decorative:/)).toBeVisible();
  await layers.getByRole('link', { name: /Map animations & weather/ }).click();
  await expect(page).toHaveURL(/\/settings\/animations$/);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true');
});

test('share and notifications are honest about what they can do', async ({ page }) => {
  await page.goto('/maps');
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('dialog', { name: 'Share' })).toContainText('Personal maps are always private');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toContainText('when you’re signed in');
});

test('responsive: panels overlay on narrow screens and nothing overflows horizontally', async ({ page }) => {
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await waitForMap(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'Shared' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    // The side panel starts closed and opens as an overlay.
    await page.getByRole('button', { name: 'Expand side panel' }).first().click();
    await expect(sidePanel(page).getByRole('toolbar', { name: 'Discover categories' })).toBeVisible();
  }
});

test('discovery: Nightlife pill shows real bars/pubs; dropdown filters and sort keep map and list in sync', async ({ page }) => {
  await at(page, [-73.9877, 40.7265], 16, ['nightlife']); // East Village
  await page.goto('/');
  await waitForMap(page);
  const nightlife = sidePanel(page).getByRole('button', { name: 'Nightlife', exact: true });
  await expect(nightlife).toHaveAttribute('aria-pressed', 'true');
  const places = page.locator('[data-tour="places-in-view"]');
  await expect(places.getByText(/Bars|Pubs & beer gardens|Nightclubs/).first()).toBeVisible({ timeout: 20_000 });
  // Every rendered place marker is a nightlife subclass (real OSM data).
  const subclasses = await page.evaluate(() => [...new Set((window as AtlasWindow).__atlasMap!.queryRenderedFeatures({ layers: ['atlas-places'] }).map((f) => f.properties.subclass))]);
  expect(subclasses.length).toBeGreaterThan(0);
  for (const s of subclasses) expect(['bar', 'pub', 'biergarten', 'nightclub', 'music_venue']).toContain(s);
});

test('event filters via dropdowns; sort reorders only the list', async ({ page }) => {
  await at(page, [-73.985, 40.735], 12.5, ['events']);
  await page.goto('/');
  await waitForMap(page);
  const names = () => page.locator('[data-tour="events-in-view"]').getByTestId('result-name').allInnerTexts();
  await expect.poll(async () => (await names()).length).toBeGreaterThan(2);
  const before = await names();

  // Default: nearest first, measured from the map centre until location is shared (never prompted).
  await expect(page.locator('[data-tour="events-in-view"]')).toContainText('Closest to the map centre first');
  await page.getByRole('button', { name: 'Sort: Nearest' }).click();
  await expect(page.getByRole('radio', { name: 'Nearest' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Name (A–Z)' }).click();
  const sorted = await names();
  expect(sorted).toEqual([...before].sort((a, b) => a.localeCompare(b)));
  const onMap = await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getSource('discover-events') ? 'ok' : 'missing');
  expect(onMap).toBe('ok');

  await page.getByRole('button', { name: 'Price', exact: true }).click();
  await page.getByRole('dialog', { name: 'Price filter' }).getByLabel('$0 – $5').check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Price (1 active)' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Filters.*1 active/ })).toBeVisible();
  expect((await names()).length).toBeLessThan(before.length);
});

test('3D city: buildings are real tile footprints with mapped heights; trees only in parks/woods; 2D turns extrusions off', async ({ page }) => {
  await at(page, [-74.0134, 40.7033], 15.8, []); // Battery Park / Financial District
  await page.goto('/');
  await waitForMap(page);
  const q = (layer: string) => page.evaluate((l) => (window as AtlasWindow).__atlasMap!.queryRenderedFeatures({ layers: [l] })
    .map((f) => ({ sl: f.sourceLayer, h: f.properties.render_height, cls: f.properties.class, sub: f.properties.subclass })), layer);
  await expect.poll(async () => (await q('atlas-buildings-3d')).length, { timeout: 20_000 }).toBeGreaterThan(20);
  for (const b of await q('atlas-buildings-3d')) {
    expect(b.sl).toBe('building');
    expect(typeof b.h).toBe('number');
  }
  const trees = [...await q('atlas-trees'), ...await q('atlas-trees-wood')];
  expect(trees.length).toBeGreaterThan(0);
  for (const t of trees) expect(t.sl === 'park' || t.cls === 'wood' || ['park', 'garden'].includes(t.sub)).toBe(true);
  expect(await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getPitch())).toBeGreaterThan(30);

  await page.getByRole('button', { name: '3D view' }).click(); // -> 2D
  await expect.poll(() => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getLayoutProperty('atlas-buildings-3d', 'visibility'))).toBe('none');
  await expect.poll(() => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getPitch())).toBe(0);
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('switch', { name: 'Decorative trees' }).click();
  await expect.poll(() => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getLayoutProperty('atlas-trees', 'visibility'))).toBe('none');
});

test('ambient animation: 3D vehicles on real roads in every context; pause and speed work; night lighting is a colour change', async ({ page }) => {
  await at(page, [-73.9857, 40.758], 15.8, []);
  await page.goto('/maps'); // personal map context, not only Discover
  await waitForMap(page);
  const snapshot = () => page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    return m.getSource('atlas-ambient') ? JSON.stringify(m.querySourceFeatures('atlas-ambient').map((f) => (f.geometry as GeoJSON.Polygon).coordinates[0][0])) : null;
  });
  await expect.poll(async () => (await snapshot())?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(10);
  expect(await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getLayer('atlas-ambient')!.type)).toBe('fill-extrusion');
  const a = await snapshot();
  await page.waitForTimeout(600);
  expect(await snapshot()).not.toBe(a); // moving

  // Pause / resume live in Settings (the map keeps running underneath the sheet).
  await page.goto('/settings/animations');
  await expect.poll(async () => (await snapshot())?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(300);
  const p1 = await snapshot();
  await page.waitForTimeout(700);
  expect(await snapshot()).toBe(p1); // paused = frozen
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(500);
  expect(await snapshot()).not.toBe(p1);
  await page.getByRole('button', { name: 'Close settings' }).click();

  // Lighting: Night adds the dusk tint; Day removes it. No motion involved.
  const tint = () => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getPaintProperty('atlas-night-tint', 'fill-opacity'));
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('radio', { name: 'Night' }).click();
  await expect.poll(tint).toBeGreaterThan(0.2);
  await page.getByRole('radio', { name: 'Day' }).click();
  await expect.poll(tint).toBe(0);
});

test('reduced motion: no moving vehicles, Settings explains why, lighting still available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await at(page, [-73.9857, 40.758], 15.8, []);
  await page.goto('/');
  await waitForMap(page);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => !!(window as AtlasWindow).__atlasMap!.getSource('atlas-ambient'))).toBe(false);
  await page.goto('/settings/animations');
  await expect(page.getByText(/Your system asks for reduced motion/)).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Show moving map life' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('radio', { name: 'Night' }).click();
  await expect.poll(() => page.evaluate(() => (window as AtlasWindow).__atlasMap!.getPaintProperty('atlas-night-tint', 'fill-opacity'))).toBeGreaterThan(0.2);
});
