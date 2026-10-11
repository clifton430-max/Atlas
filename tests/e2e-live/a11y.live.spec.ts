/** axe-core WCAG 2.1 A/AA audit of signed-in screens with real backend data. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { liveConfigured, signedIn } from '../live/env';
import { RUN, signIn, waitForMap } from './helpers';

test.skip(!liveConfigured, 'live test accounts not configured');

async function audit(page: Page, label: string) {
  await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running' || x.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => undefined);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.maplibregl-canvas').exclude('.maplibregl-ctrl-attrib').analyze();
  const summary = r.violations.map((v) => `${label} ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('signed-in screens have no WCAG A/AA violations', async ({ page }) => {
  // Seed a pin + collab map through the API (A's own data), removed at the end.
  const { client } = await signedIn('A');
  const map = (await client.from('maps').select('id').order('created_at').limit(1).single()).data!;
  const g = (await client.from('groups').insert({ name: `A11y ${RUN}`, color: '#2f5bea' }).select('id').single()).data!;
  const pinId = (await client.rpc('create_custom_pin', { p_map_id: map.id, p_title: `A11y pin ${RUN}`, p_note: 'note', p_latitude: 40.75, p_longitude: -73.99, p_address: '', p_group_ids: [g.id] })).data as string;
  const collabId = (await client.rpc('create_collab_map', { p_name: `A11y collab ${RUN}` })).data as string;
  try {
    await signIn(page, 'A');
    await page.evaluate(() => localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.99, 40.75], zoom: 13 })));
    await page.goto(`/maps/${map.id}`);
    await waitForMap(page);
    await page.getByRole('button', { name: `A11y pin ${RUN}`, exact: true }).click();
    await expect(page.getByRole('article', { name: `Pin: A11y pin ${RUN}` })).toBeVisible();
    await audit(page, 'personal map');
    await page.getByRole('button', { name: /Group filter/ }).click();
    await audit(page, 'group filter');
    await page.keyboard.press('Escape');

    await page.goto(`/collab/${collabId}`);
    await expect(page.getByRole('region', { name: /A11y collab/ })).toBeVisible();
    await audit(page, 'collaboration');

    for (const s of ['account', 'privacy', 'friends', 'appearance', 'groups', 'pins', 'collaboration']) {
      await page.goto(`/settings/${s}`);
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await audit(page, `settings/${s}`);
    }
  } finally {
    await client.from('collab_maps').delete().eq('id', collabId);
    await client.from('pins').delete().eq('id', pinId);
    await client.from('groups').delete().eq('id', g.id);
  }
});
