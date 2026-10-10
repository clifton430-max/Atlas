/** LIVE UI: rich place details with real imagery, and saving to authorized collaboration maps. */
import { expect, test } from '@playwright/test';
import { liveConfigured, signedIn } from '../live/env';
import { RUN, signIn, waitForMap } from './helpers';

test.skip(!liveConfigured, 'live test accounts not configured');

test('place details show verified OSM data and an attributed Wikimedia Commons photo', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.9857, 40.7484], zoom: 17 }));
    localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
    localStorage.setItem('atlas.discover.categories.v1', JSON.stringify({ visible: ['attractions'], subs: {} }));
  });
  await page.goto('/');
  await waitForMap(page);
  const item = page.locator('[data-tour="places-in-view"] li button').filter({ hasText: 'Empire State Building' }).first();
  await item.click();
  const card = page.getByRole('article', { name: 'Place: Empire State Building' });
  await expect(card.getByText(/350 5th Avenue/)).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/As listed on OpenStreetMap/)).toBeVisible();
  const photo = card.getByRole('img', { name: 'Photo of Empire State Building' });
  await expect(photo).toBeVisible();
  expect(await photo.getAttribute('src')).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
  await expect(card.getByRole('link', { name: 'Wikimedia Commons' })).toHaveAttribute('href', /commons\.wikimedia\.org\/wiki\/File:/);
  await expect(card.locator('figcaption')).toContainText(/Public domain|CC /);
});

test('save to an editable collaboration map with attendance; viewer maps are not offered', async ({ page }) => {
  const { client: a } = await signedIn('A');
  const { client: b } = await signedIn('B');
  const own = (await a.rpc('create_collab_map', { p_name: `Own ${RUN}` })).data as string;
  const theirs = (await b.rpc('create_collab_map', { p_name: `Viewer-only ${RUN}` })).data as string;
  const inv = (await b.rpc('create_collab_invitation', { p_map_id: theirs, p_role: 'viewer', p_expires_in_hours: 1 })).data[0];
  await a.rpc('accept_collab_invitation', { p_token: inv.token });
  try {
    await page.addInitScript(() => {
      localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-30, 0.5], zoom: 9 }));
      localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
      localStorage.setItem('atlas.discover.categories.v1', JSON.stringify({ visible: ['events'], subs: {} }));
    });
    await signIn(page, 'A');
    await waitForMap(page);
    await page.getByRole('button', { name: /Atlas live-test event/ }).click();
    const form = page.getByRole('article', { name: /Atlas live-test event/ }).getByRole('region', { name: 'Add to map' });
    await form.getByRole('radio', { name: 'Collaboration Map' }).click();
    const select = form.getByLabel('Select map');
    await expect(select.locator('option', { hasText: `Own ${RUN}` })).toHaveCount(1);
    await expect(select.locator('option', { hasText: `Viewer-only ${RUN}` })).toHaveCount(0);
    await select.selectOption({ label: `Own ${RUN} (owner)` });
    await form.getByRole('radio', { name: 'Going' }).click();
    await expect(form.getByTestId('collab-review')).toContainText('That you’re going');
    await form.getByRole('button', { name: 'Add to collaboration map' }).click();
    await expect(form.getByRole('status')).toContainText(`Added to Own ${RUN}`);
    const rows = (await a.from('shared_pins').select('title, attendance, latitude').eq('collab_map_id', own)).data!;
    expect(rows).toEqual([expect.objectContaining({ attendance: 'going', latitude: 0.5 })]);
  } finally {
    await a.from('collab_maps').delete().eq('id', own);
    await b.from('collab_maps').delete().eq('id', theirs);
  }
});
