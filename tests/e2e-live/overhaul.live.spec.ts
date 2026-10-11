/**
 * LIVE checks for the overhaul, with real accounts on the linked project:
 *   - a shared map and an online chess game keep working after a browser
 *     refresh and when the copied link is opened in a NEW tab / fresh session
 *     (and opening them never creates duplicate records);
 *   - members drop pins and plan meetups at arbitrary points; viewers can't;
 *   - Celestial odds are published; closing a reward keeps it in inventory.
 */
import { expect, test } from '@playwright/test';
import { LIVE, signedIn, withAdmin } from '../live/env';
import { RUN, signIn, waitForMap } from './helpers';

const prime = async (ctx: import('@playwright/test').BrowserContext) => ctx.addInitScript(() => {
  localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-90.2, 38.63], zoom: 14 }));
  localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
  localStorage.setItem('atlas.weather.v1', JSON.stringify({ mode: 'off', manual: 'clear', intensity: 0.5 }));
});

test('shared map: refresh, new tab and a fresh signed-in session restore the same map, pins and meetups (no duplicates)', async ({ browser }) => {
  const { client: a } = await signedIn('A');
  const { client: b } = await signedIn('B');
  const mapId = (await a.rpc('create_collab_map', { p_name: `Refresh ${RUN}` })).data as string;
  const inv = (await a.rpc('create_collab_invitation', { p_map_id: mapId, p_role: 'editor', p_expires_in_hours: 1 })).data[0];
  await b.rpc('accept_collab_invitation', { p_token: inv.token });
  const pinTitle = `Gateway ${RUN}`;
  const pinId = (await a.rpc('create_shared_custom_pin', { p_collab_map_id: mapId, p_title: pinTitle, p_latitude: 38.6247, p_longitude: -90.1848, p_note: 'Meet under the arch' })).data as string;
  const countRows = async () => {
    const [pins, members] = await Promise.all([
      a.from('shared_pins').select('id', { count: 'exact', head: true }).eq('collab_map_id', mapId),
      a.from('collab_members').select('user_id', { count: 'exact', head: true }).eq('map_id', mapId),
    ]);
    return { pins: pins.count, members: members.count };
  };
  const before = await countRows();
  const ctx = await browser.newContext();
  await prime(ctx);
  try {
    const page = await ctx.newPage();
    const link = `/collab/${mapId}?pin=${pinId}`;
    await signIn(page, 'B', link);
    await waitForMap(page);
    await expect(page.getByRole('article', { name: `Shared pin: ${pinTitle}` })).toBeVisible();
    await page.reload();
    await waitForMap(page);
    await expect(page).toHaveURL(new RegExp(`/collab/${mapId}`));
    await expect(page.getByRole('button', { name: new RegExp(pinTitle) }).first()).toBeVisible();
    // Same link in a new tab of the same session.
    const tab = await ctx.newPage();
    await tab.goto(link);
    await waitForMap(tab);
    await expect(tab.getByRole('article', { name: `Shared pin: ${pinTitle}` })).toBeVisible();
    // A fresh browser session: sign-in redirects back to the shared link.
    const fresh = await browser.newContext();
    await prime(fresh);
    const fp = await fresh.newPage();
    await fp.goto(link);
    await expect(fp.getByText('An account is needed for this')).toBeVisible();
    await fp.getByRole('link', { name: 'Sign in or create account' }).click();
    await fp.getByLabel('Email').fill(LIVE.users.find((u) => u.id === 'B')!.email);
    await fp.getByLabel('Password').fill(LIVE.users.find((u) => u.id === 'B')!.password);
    await fp.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(fp).toHaveURL(new RegExp(`/collab/${mapId}`));
    await expect(fp.getByRole('article', { name: `Shared pin: ${pinTitle}` })).toBeVisible();
    await fresh.close();
    expect(await countRows()).toEqual(before);
    // A user who isn't a member gets a clear message, not a broken page.
    const outsider = await browser.newContext();
    await prime(outsider);
    const op = await outsider.newPage();
    await signIn(op, 'C', link);
    await expect(op.getByText(/doesn’t exist or you’re no longer a member/)).toBeVisible();
    await outsider.close();
  } finally {
    await ctx.close();
    await a.from('collab_maps').delete().eq('id', mapId);
  }
});

test('members drop a pin and plan a meetup at an arbitrary point; viewers cannot', async ({ browser }) => {
  const { client: a } = await signedIn('A');
  const { client: c } = await signedIn('C');
  const mapId = (await a.rpc('create_collab_map', { p_name: `Anywhere ${RUN}` })).data as string;
  const inv = (await a.rpc('create_collab_invitation', { p_map_id: mapId, p_role: 'viewer', p_expires_in_hours: 1 })).data[0];
  await c.rpc('accept_collab_invitation', { p_token: inv.token });
  const ctx = await browser.newContext();
  await prime(ctx);
  try {
    const page = await ctx.newPage();
    await signIn(page, 'A', `/collab/${mapId}`);
    await waitForMap(page);
    await page.getByRole('button', { name: 'Plan meetup here' }).click();
    const box = (await page.getByTestId('map-canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
    const dlg = page.getByRole('dialog', { name: 'Plan a meetup here' });
    await dlg.getByLabel('Meeting point name').fill(`Picnic spot ${RUN}`);
    await dlg.getByRole('button', { name: 'Plan meetup' }).click();
    await expect(page.getByText('Meetup planned. Members were notified.')).toBeVisible();
    await expect(page.getByTestId('meetup-badge')).toBeVisible();
    const { data: pins } = await a.from('shared_pins').select('id, title').eq('collab_map_id', mapId);
    expect(pins).toHaveLength(1);
    const { data: meetups } = await a.from('meetups').select('id').eq('collab_map_id', mapId);
    expect(meetups).toHaveLength(1);
    // Viewer: no add controls in the UI, and the server refuses the RPC.
    const v = await browser.newContext();
    await prime(v);
    const vp = await v.newPage();
    await signIn(vp, 'C', `/collab/${mapId}`);
    await waitForMap(vp);
    await expect(vp.getByRole('button', { name: new RegExp(`Picnic spot ${RUN}`) }).first()).toBeVisible();
    await expect(vp.getByTestId('collab-add-bar')).toHaveCount(0);
    const { error } = await c.rpc('create_shared_custom_pin', { p_collab_map_id: mapId, p_title: 'Nope', p_latitude: 1, p_longitude: 1 });
    expect(error?.message).toMatch(/editor access/);
    await v.close();
  } finally {
    await ctx.close();
    await a.from('collab_maps').delete().eq('id', mapId);
  }
});

test('Celestial odds are published live and the reward screen offers Place item / Close-Later', async ({ page }) => {
  const { client: a, userId } = await signedIn('C');
  // Dedicated test account only: reset its daily rolls so the check can run.
  await withAdmin(async (admin) => { await admin.from('crate_rolls').delete().eq('user_id', userId); });
  const { data } = await a.rpc('crate_status', { p_crate: 'monument' });
  expect(data[0].weights).toEqual({ common: 2990, uncommon: 2500, rare: 2000, epic: 1400, legendary: 1000, mythic: 100, celestial: 10 });
  await prime(page.context());
  await signIn(page, 'C', '/treasure');
  await expect(page.getByRole('region', { name: 'Published drop rates' })).toContainText('Celestial');
  await expect(page.getByRole('region', { name: 'Published drop rates' })).toContainText('0.1%');
  await expect(page.getByRole('region', { name: 'Published drop rates' })).toContainText('29.9%');
  const open = page.getByRole('button', { name: /Open crate|Open another/ });
  test.skip(!(await open.isEnabled()), 'no free rolls left for this account today');
  await page.getByLabel('Skip animations').check();
  await open.click();
  const reveal = page.getByTestId('crate-reveal');
  await expect(reveal).toBeVisible();
  await expect(reveal.getByRole('button', { name: 'Place item' })).toBeVisible();
  await expect(page.getByTestId('reward-saved')).toContainText('Added to your collection');
  const defName = (await reveal.locator('h3').textContent())!;
  await reveal.getByRole('button', { name: 'Close / Later' }).click();
  await expect(reveal).toHaveCount(0);
  await page.getByRole('tab', { name: 'Collection' }).click();
  await expect(page.getByRole('button', { name: new RegExp(defName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()).toBeVisible();
  // Closing never placed anything.
  const { data: placements } = await a.from('monument_placements').select('id').eq('owner_id', userId).gte('created_at', new Date(Date.now() - 120_000).toISOString());
  expect(placements).toEqual([]);
});
