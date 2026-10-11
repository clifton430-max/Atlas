/**
 * End-to-end checks in a real browser (Chrome) against the dev server in
 * fixture mode (no Supabase). See playwright.config.ts.
 */
import { expect, test, type Page } from '@playwright/test';

type AtlasWindow = Window & { __atlasMap?: import('maplibre-gl').Map };

async function waitForMap(page: Page) {
  await page.waitForFunction(() => {
    const m = (window as AtlasWindow).__atlasMap;
    return !!m && !!m.getSource('discover-events') && m.loaded();
  }, null, { timeout: 30_000 });
}

const eventList = (page: Page) => page.getByRole('region', { name: 'Events in view' }).or(page.locator('section[aria-labelledby="in-view-heading"]'));

test.beforeEach(async ({ page }) => {
  // Start every test from the same viewport (Manhattan).
  await page.addInitScript(() => { localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.985, 40.748], zoom: 11.5 })); localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true })); });
});

test('welcome overlay fades out quickly without blocking the app', async ({ page }) => {
  await page.goto('/');
  // App UI exists underneath while the overlay is still showing.
  await expect(page.getByTestId('welcome-overlay')).toBeVisible();
  await expect(page.getByRole('combobox')).toBeAttached();
  const start = Date.now();
  await expect(page.getByTestId('welcome-overlay')).toBeHidden({ timeout: 3000 });
  expect(Date.now() - start).toBeLessThan(2000);
  // Client-side navigation does not replay it.
  await page.getByRole('link', { name: 'Shared' }).click();
  await expect(page.getByTestId('welcome-overlay')).toHaveCount(0);
});

test('Discover shows labeled development data on the map and in the list', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(page.getByText(/development sample events/i)).toBeVisible();
  const rendered = await page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    return m.queryRenderedFeatures({ layers: ['discover-points', 'discover-clusters'] }).length;
  });
  expect(rendered).toBeGreaterThan(0);
  await expect(eventList(page).getByRole('button', { name: /Late Night Jazz/ })).toBeVisible();
});

test('clicking an event marker on the map opens its details', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  // Zoom close to the jazz venue so it is an unclustered point, then click its pixel.
  await page.evaluate(() => (window as AtlasWindow).__atlasMap!.jumpTo({ center: [-74.0007, 40.7309], zoom: 15 }));
  await page.waitForFunction(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    return m.loaded() && m.queryRenderedFeatures({ layers: ['discover-points'] }).length > 0;
  });
  const pt = await page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    const p = m.project([-74.0007, 40.7309]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(pt.x, pt.y);
  const card = page.getByRole('article', { name: /Late Night Jazz/ });
  await expect(card).toBeVisible();
  await expect(card.getByText('Development sample', { exact: true })).toBeVisible();
  await expect(card.getByText(/Opens .* Closes/)).toBeVisible();
  await expect(card.getByText(/times in America\/New_York/)).toBeVisible();
  // No ticket link for fixtures (no fabricated URLs).
  await expect(card.getByRole('link', { name: /Tickets/ })).toHaveCount(0);
});

test('price filter uses non-overlapping bands and never treats unknown as free', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const list = eventList(page);
  await expect(list.getByRole('button', { name: /Gallery Opening/ })).toBeVisible();

  await page.getByRole('button', { name: /Filters/ }).click();
  const panel = page.getByRole('dialog', { name: 'Event filters' });
  await panel.getByLabel('$0 – $5').check();
  await expect(list.getByRole('button', { name: /Free Morning Yoga/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /Street Food Market/ })).toBeVisible(); // $4.50
  await expect(list.getByRole('button', { name: /Late Night Jazz/ })).toHaveCount(0); // $25
  await expect(list.getByRole('button', { name: /Gallery Opening/ })).toHaveCount(0); // unknown price

  await panel.getByRole('switch', { name: 'Include unknown prices' }).click();
  await expect(list.getByRole('button', { name: /Gallery Opening/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Filters.*1 active/ })).toBeVisible();
});

test('event start-time window can cross midnight (local time)', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await page.getByRole('button', { name: /Filters/ }).click();
  const panel = page.getByRole('dialog', { name: 'Event filters' });
  const eventTime = panel.locator('fieldset', { hasText: 'Event start time' });
  await eventTime.getByRole('checkbox').check();
  await panel.locator('#event-from').fill('22:00');
  await panel.locator('#event-to').fill('01:00');
  await expect(panel.getByText('Crosses midnight.')).toBeVisible();
  const list = eventList(page);
  await expect(list.getByRole('button', { name: /Late Night Jazz/ })).toBeVisible(); // 23:30
  await expect(list.getByRole('button', { name: /Indie Rock/ })).toHaveCount(0); // 21:00
  await expect(list.getByRole('button', { name: /Street Food/ })).toHaveCount(0); // unknown time
});

test('search suggests events and opens the selected one', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const box = page.getByRole('combobox');
  await box.fill('jazz');
  const option = page.getByRole('option', { name: /Late Night Jazz/ });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByRole('article', { name: /Late Night Jazz/ })).toBeVisible();
  // Selecting a result moves the map to it (search lives outside the canvas).
  await page.waitForFunction(() => {
    const c = (window as AtlasWindow).__atlasMap!.getCenter();
    return Math.abs(c.lng - -74.0007) < 0.001 && Math.abs(c.lat - 40.7309) < 0.001;
  }, null, { timeout: 5000 });
});

test('selecting an event in the side list centers the map on it', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await eventList(page).getByRole('button', { name: /Arena Basketball/ }).click();
  await expect(page.getByRole('article', { name: /Arena Basketball/ })).toBeVisible();
  await page.waitForFunction(() => {
    const c = (window as AtlasWindow).__atlasMap!.getCenter();
    return Math.abs(c.lng - -73.9934) < 0.001 && Math.abs(c.lat - 40.7505) < 0.001;
  }, null, { timeout: 5000 });
});

test('collapsing panels preserves the map viewport', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const before = await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getCenter().toArray());
  await page.getByRole('button', { name: 'Collapse side panel' }).click();
  await page.getByRole('button', { name: 'Collapse details panel' }).click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => (window as AtlasWindow).__atlasMap!.getCenter().toArray());
  expect(after[0]).toBeCloseTo(before[0], 4);
  expect(after[1]).toBeCloseTo(before[1], 4);
  await expect(page.getByRole('button', { name: 'Expand side panel' }).first()).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Expand details panel' })).toHaveAttribute('aria-expanded', 'false');
});

test('auth page explains missing configuration honestly', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: 'Accounts are not configured' })).toBeVisible();
});

test('image marker is the actual interactive map marker, anchored to its coordinate', async ({ page }) => {
  await page.goto('/__dev/marker-check');
  await page.waitForFunction(() => (window as AtlasWindow).__atlasMap?.loaded());
  const marker = page.getByRole('button', { name: 'Image marker' });
  await expect(marker).toBeVisible();
  // The image IS the marker: an <img>, no default SVG shape rendered underneath.
  await expect(marker.locator('img')).toHaveCount(1);
  await expect(marker.locator('svg')).toHaveCount(0);

  const centerOf = async () => {
    const b = (await marker.locator('img').boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const expected = () => page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    const p = m.project([-73.9857, 40.7484]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });

  let c = await centerOf();
  let e = await expected();
  expect(Math.abs(c.x - e.x)).toBeLessThan(2);
  expect(Math.abs(c.y - e.y)).toBeLessThan(2);

  // Stays anchored while panning and zooming.
  await page.evaluate(() => (window as AtlasWindow).__atlasMap!.jumpTo({ center: [-73.99, 40.745], zoom: 14 }));
  await page.waitForTimeout(200);
  c = await centerOf();
  e = await expected();
  expect(Math.abs(c.x - e.x)).toBeLessThan(2);
  expect(Math.abs(c.y - e.y)).toBeLessThan(2);

  // Clickable.
  await marker.click();
  await expect(page.getByTestId('clicks')).toHaveText('clicks: 1');
});

test('droplet pin: its tip sits on the coordinate; hover shows a short card; click selects', async ({ page }) => {
  await page.goto('/__dev/marker-check');
  await page.waitForFunction(() => (window as AtlasWindow).__atlasMap?.loaded());
  const pin = page.getByRole('button', { name: 'Droplet marker' });
  await expect(pin).toBeVisible();
  await expect(pin.locator('[data-droplet="true"]')).toHaveCount(1);
  const tip = async () => { const b = (await pin.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height }; };
  const expected = () => page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    const p = m.project([-73.9772, 40.7527]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  // The visual extends 3/48 below the element (its soft shadow); the tip is the element's bottom edge.
  const t = await tip(); const e = await expected();
  expect(Math.abs(t.x - e.x)).toBeLessThan(2);
  expect(Math.abs(t.y - e.y)).toBeLessThan(3);
  await pin.hover();
  await expect(page.getByTestId('pin-hover-card')).toContainText('A short description shown on hover.');
  await pin.click();
  await expect(page.getByTestId('clicks')).toHaveText('clicks: 1');
});
