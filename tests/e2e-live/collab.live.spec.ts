/**
 * LIVE multi-user collaboration: two real accounts in two browsers against
 * the linked Supabase project. Proves realtime sync of pins, meetups and
 * attendance (no reloads), notifications, and that cameras stay independent.
 */
import { expect, test, type Page } from '@playwright/test';
import { signedIn } from '../live/env';
import { RUN, signIn, waitForMap } from './helpers';

const center = (page: Page) => page.evaluate(() => (window as unknown as { __atlasMap: { getCenter(): { lng: number; lat: number } } }).__atlasMap.getCenter());

test('pins, meetups and attendance sync live between two members; cameras stay independent', async ({ browser }) => {
  const { client: a } = await signedIn('A');
  const { client: b } = await signedIn('B');
  const name = `Live collab ${RUN}`;
  const mapId = (await a.rpc('create_collab_map', { p_name: name })).data as string;
  const inv = (await a.rpc('create_collab_invitation', { p_map_id: mapId, p_role: 'editor', p_expires_in_hours: 1 })).data[0];
  await b.rpc('accept_collab_invitation', { p_token: inv.token });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    for (const ctx of [ctxA, ctxB]) {
      await ctx.addInitScript(() => {
        localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-90.2, 38.63], zoom: 14 }));
        localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
        localStorage.setItem('atlas.ambient.v1', 'off');
      });
    }
    const pa = await ctxA.newPage();
    const pb = await ctxB.newPage();
    await signIn(pa, 'A', `/collab/${mapId}`);
    await signIn(pb, 'B', `/collab/${mapId}`);
    await waitForMap(pa); await waitForMap(pb);
    await expect(pa.getByText('Live — changes appear instantly')).toBeVisible();
    await expect(pb.getByText('Live — changes appear instantly')).toBeVisible();

    // A adds a place through the API (same RPC as the UI); B sees it without reloading.
    const pinTitle = `Arch ${RUN}`;
    const pin = (await a.rpc('add_to_collab', { p_collab_map_id: mapId, p_place_ref: 'osm:way/32270917', p_title: pinTitle, p_latitude: 38.6247, p_longitude: -90.1848 })).data as string;
    await expect(pb.getByRole('button', { name: new RegExp(pinTitle) }).first()).toBeVisible();

    // B moves their camera; A's camera must not follow.
    const aBefore = await center(pa);
    await pb.evaluate(() => (window as unknown as { __atlasMap: { jumpTo(o: unknown): void } }).__atlasMap.jumpTo({ center: [-90.3, 38.7] }));
    await pa.waitForTimeout(1500);
    const aAfter = await center(pa);
    expect(aAfter.lng).toBeCloseTo(aBefore.lng, 5);

    // A plans a meetup in the UI; B sees the badge on the map and the meetup in the panel live.
    await pa.getByRole('button', { name: new RegExp(pinTitle) }).first().click();
    await pa.getByRole('button', { name: 'Plan a meetup' }).click();
    await pa.getByRole('button', { name: 'Plan meetup' }).click();
    await expect(pa.getByText('Meetup planned. Members were notified.')).toBeVisible();
    const badgeB = pb.getByTestId('meetup-badge');
    await expect(badgeB).toBeVisible();
    await expect(badgeB).toHaveAccessibleName(/1 going/);

    // B joins from the panel; A's view updates live (count, avatars) and A gets a notification.
    await badgeB.click();
    await pb.getByTestId('meetup').getByRole('button', { name: 'Join' }).click();
    await expect(pb.getByTestId('meetup')).toContainText('2 going');
    await expect(pa.getByTestId('meetup')).toContainText('2 going');
    await expect(pa.getByTestId('meetup-badge')).toHaveAccessibleName(/2 going/);
    await expect(pa.getByRole('button', { name: /Notifications \(\d+ new\)/ })).toBeVisible();
    await pa.getByRole('button', { name: /Notifications/ }).click();
    await expect(pa.getByRole('dialog', { name: 'Notifications' })).toContainText(/joined your meetup/);

    // B received the "pin added" + "meetup planned" notifications; clicking one opens the pin.
    await pb.goto('/');
    await pb.getByRole('button', { name: /Notifications/ }).click();
    const dlg = pb.getByRole('dialog', { name: 'Notifications' });
    await expect(dlg).toContainText(`added “${pinTitle}”`);
    await dlg.getByRole('button', { name: new RegExp(`added “${pinTitle}”`) }).click();
    await expect(pb).toHaveURL(new RegExp(`/collab/${mapId}`));
    await expect(pb.getByRole('article', { name: `Shared pin: ${pinTitle}` })).toBeVisible();
    await expect(pb.getByTestId('pin-attribution')).toContainText('Added by');

    // Removing the pin syncs too.
    await a.from('shared_pins').delete().eq('id', pin);
    await expect(pb.getByRole('button', { name: new RegExp(pinTitle) })).toHaveCount(0);
  } finally {
    await a.from('collab_maps').delete().eq('id', mapId);
    await ctxA.close(); await ctxB.close();
  }
});
