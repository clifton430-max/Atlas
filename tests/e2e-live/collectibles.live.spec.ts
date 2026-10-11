/**
 * LIVE end-to-end collectibles journey through the real UI:
 * open a monument crate -> server-selected 3D reward -> place it on a personal
 * map -> reload (persists, renders, selectable) -> rotate/resize -> remove;
 * open a skin crate -> equip -> reload (persists) -> shared maps unchanged.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signedIn, withAdmin } from '../live/env';
import { signIn, waitForMap } from './helpers';

const catalog = JSON.parse(readFileSync('src/features/collectibles/catalog.data.json', 'utf8')) as { skins: { id: string; name: string }[] };
const SKIN_BG: Record<string, string> = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(
  (await import('../../src/features/collectibles/skins')).SKIN_THEMES))).map(([id, t]) => [id, (t as { background: string }).background]));
const bg = (page: Page) => page.evaluate(() => (window as unknown as { __atlasMap: { getPaintProperty(l: string, p: string): string } }).__atlasMap.getPaintProperty('background', 'background-color'));

test('collect a 3D monument, place it, and customise a personal map', async ({ page }) => {
  const { client: a, userId } = await signedIn('A');
  await withAdmin(async (admin) => { await admin.from('crate_rolls').delete().eq('user_id', userId); });
  const { data: map } = await a.from('maps').select('id, name').order('created_at').limit(1).single();
  await a.from('monument_placements').delete().eq('map_id', map!.id);
  await a.from('map_skins').delete().eq('map_id', map!.id);
  await page.addInitScript(() => {
    localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
    localStorage.setItem('atlas.lighting.v1', 'day');
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-90.1848, 38.6247], zoom: 16 }));
  });
  await signIn(page, 'A', '/treasure');
  await page.getByLabel('Skip animations').check();

  // Monument crate: the reveal shows the server's reward as a 3D model.
  await page.getByRole('button', { name: /Open crate|Open another/ }).click();
  const reveal = page.getByTestId('crate-reveal');
  await expect(reveal).toBeVisible();
  const name = await reveal.locator('h3').innerText();
  const { data: lastRoll } = await a.from('crate_rolls').select('def_id, rarity').order('created_at', { ascending: false }).limit(1).single();
  expect(await reveal.getAttribute('data-rarity')).toBe(lastRoll!.rarity);
  await expect(reveal.getByTestId('model-viewer')).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });

  // Place it on the personal map.
  await reveal.getByRole('button', { name: 'Place item' }).click();
  await page.getByRole('radio', { name: map!.name }).check();
  await page.getByRole('button', { name: 'Choose position on map' }).click();
  await expect(page.getByTestId('placement-controls')).toBeVisible();
  await waitForMap(page);
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.click(cx, cy);
  await page.getByRole('button', { name: 'Place monument' }).click();
  await expect(page.getByText(`${name} placed on your map.`)).toBeVisible();
  const { data: rows } = await a.from('monument_placements').select('id, def_id, rotation_deg').eq('map_id', map!.id);
  expect(rows).toHaveLength(1);
  expect(rows![0].def_id).toBe(lastRoll!.def_id);

  // Reload: persisted, rendered by the custom 3D layer, and selectable at its location.
  await page.reload();
  await waitForMap(page);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __atlasMap: { getLayer(id: string): unknown } }).__atlasMap.getLayer('atlas-monuments'))).toBe(true);
  await page.waitForTimeout(1500);
  const { data: placed } = await a.from('monument_placements').select('latitude, longitude').eq('map_id', map!.id).single();
  const screen = await page.evaluate(([lng, lat]) => {
    const m = (window as unknown as { __atlasMap: { project(c: [number, number]): { x: number; y: number }; getCanvas(): HTMLCanvasElement } }).__atlasMap;
    const p = m.project([lng, lat]); const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y - 8 };
  }, [placed!.longitude, placed!.latitude]);
  await page.mouse.click(screen.x, screen.y);
  const inspector = page.getByRole('article', { name: `Monument: ${name}` });
  await expect(inspector).toBeVisible();

  // Rotate/resize and save.
  await inspector.getByRole('button', { name: 'Rotate or resize' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Rotate right 15°' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`${name} updated.`)).toBeVisible();
  expect((await a.from('monument_placements').select('rotation_deg').eq('map_id', map!.id).single()).data!.rotation_deg).toBe(45);

  // Remove: placement gone, collectible kept.
  await page.mouse.click(screen.x, screen.y);
  await page.getByRole('article', { name: `Monument: ${name}` }).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog', { name: /Remove .* from this map/ }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText(/Still in your collection/)).toBeVisible();
  expect((await a.from('monument_placements').select('id').eq('map_id', map!.id)).data).toEqual([]);
  expect((await a.from('user_collectibles').select('copies').eq('def_id', lastRoll!.def_id).single()).data!.copies).toBeGreaterThanOrEqual(1);

  // Skin crate -> equip -> persists after reload; shared maps keep their own style.
  await page.goto('/treasure?tab=skin');
  await page.getByLabel('Skip animations').check();
  await page.getByRole('button', { name: /Open crate|Open another/ }).click();
  const skinName = await page.getByTestId('crate-reveal').locator('h3').innerText();
  const skinId = catalog.skins.find((s) => s.name === skinName)!.id;
  await page.getByRole('button', { name: /Equip or preview/ }).click();
  await page.getByRole('radio', { name: map!.name }).check();
  await page.getByRole('button', { name: 'Equip on this map' }).click();
  await page.waitForURL(new RegExp(`/maps/${map!.id}`));
  await expect.poll(() => bg(page)).toBe(SKIN_BG[skinId]);
  await page.reload();
  await waitForMap(page);
  await expect.poll(() => bg(page)).toBe(SKIN_BG[skinId]);
  expect((await a.from('map_skins').select('def_id').eq('map_id', map!.id).single()).data!.def_id).toBe(`skin:${skinId}`);
  await page.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'Shared' }).click();
  await expect.poll(() => bg(page)).not.toBe(SKIN_BG[skinId]);
  await a.from('map_skins').delete().eq('map_id', map!.id);
});
