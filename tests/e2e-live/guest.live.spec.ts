/**
 * Guest Mode against the LIVE backend: guest data must stay local, signing in
 * must not upload it, import only happens on explicit request, signing out
 * shows no account data, and the tutorial never changes account data.
 */
import { expect, test, type Page, type Request } from '@playwright/test';
import { signedIn } from '../live/env';
import { RUN, signIn, waitForMap } from './helpers';

// Read-only RPCs that PostgREST invokes with POST.
const READ_ONLY_RPC = /\/rpc\/(my_pending_invitations|get_my_friend_code|my_orphaned_pin_images|preview_collab_invitation)$/;
const isWrite = (h: string) => /^(POST|PATCH|PUT|DELETE)/.test(h) && !/\/auth\//.test(h) && !READ_ONLY_RPC.test(h);

const PRIVATE = /\/rest\/v1\/(maps|pins|groups|pin_groups|pin_images|shared_pins|collab_|friendships|profiles)|\/rest\/v1\/rpc\/(?!.*discover)|\/storage\/v1\//;

function recordPrivateRequests(page: Page) {
  const hits: string[] = [];
  page.on('request', (r: Request) => {
    const u = r.url();
    if (PRIVATE.test(u)) hits.push(`${r.method()} ${u.replace(/\?.*/, '')}`);
  });
  return hits;
}

async function accountCounts() {
  const { client } = await signedIn('A');
  const c = async (t: 'maps' | 'pins' | 'groups' | 'pin_images') =>
    (await client.from(t).select('id', { count: 'exact', head: true })).count ?? -1;
  return { maps: await c('maps'), pins: await c('pins'), groups: await c('groups'), images: await c('pin_images') };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.985, 40.748], zoom: 12 }));
  });
});

test('guest work never touches private tables or Storage; sign-in does not upload it', async ({ page }) => {
  const hits = recordPrivateRequests(page);
  const before = await accountCounts();

  await page.goto('/');
  await expect(page.getByRole('button', { name: /Guest · on this device/ })).toBeVisible();
  await page.getByRole('link', { name: 'My Map' }).click();
  await waitForMap(page);
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const dlg = page.getByRole('dialog', { name: 'New custom pin' });
  await dlg.getByLabel('Title').fill(`Guest pin ${RUN}`);
  await dlg.getByLabel('New group name').fill(`Guest group ${RUN}`);
  await dlg.getByRole('button', { name: 'Add group' }).click();
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  const card = page.getByRole('article', { name: `Pin: Guest pin ${RUN}` });
  await card.getByRole('button', { name: 'Customize' }).click();
  const ap = page.getByRole('dialog', { name: 'Customize pin' });
  await ap.getByRole('button', { name: 'Upload image' }).click();
  await ap.getByRole('button', { name: 'Use a sample image instead' }).click();
  await ap.getByRole('button', { name: 'Use this image' }).click();
  await ap.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByRole('button', { name: `Guest pin ${RUN}`, exact: true })).toHaveAttribute('data-image-marker', 'true');

  expect(hits, `guest mode made private requests:\n${hits.join('\n')}`).toEqual([]);

  // Signing in shows ACCOUNT data and does not upload the guest workspace.
  await signIn(page, 'A');
  await expect(page.getByRole('button', { name: /Guest · on this device/ })).toHaveCount(0);
  await expect(page.getByText(`Guest pin ${RUN}`)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('atlas.guest.v1'))).toContain(`Guest pin`);
  expect(await accountCounts()).toEqual(before);
  expect(hits.filter(isWrite), 'writes after sign-in').toEqual([]);

  // Signing out returns to the guest workspace — no account data shown.
  await page.getByRole('button', { name: /Account menu for/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: /Guest · on this device/ })).toBeVisible();
  await page.getByRole('link', { name: 'My Map' }).click();
  await expect(page.getByRole('button', { name: `Guest pin ${RUN}`, exact: true })).toBeVisible();
});

test('explicit import copies guest data into the account without overwriting anything', async ({ page }) => {
  const before = await accountCounts();
  await page.goto('/');
  await page.getByRole('link', { name: 'My Map' }).click();
  await waitForMap(page);
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const dlg = page.getByRole('dialog', { name: 'New custom pin' });
  await dlg.getByLabel('Title').fill(`Import me ${RUN}`);
  await dlg.getByLabel('New group name').fill(`Imported group ${RUN}`);
  await dlg.getByRole('button', { name: 'Add group' }).click();
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  const card = page.getByRole('article', { name: `Pin: Import me ${RUN}` });
  await card.getByRole('button', { name: 'Customize' }).click();
  const ap = page.getByRole('dialog', { name: 'Customize pin' });
  await ap.getByRole('button', { name: 'Upload image' }).click();
  await ap.getByRole('button', { name: 'Use a sample image instead' }).click();
  await ap.getByRole('button', { name: 'Use this image' }).click();
  await ap.getByRole('button', { name: 'Save appearance' }).click();
  await expect(ap).toBeHidden();

  await signIn(page, 'A', '/settings/guest');
  expect(await accountCounts()).toEqual(before); // nothing uploaded yet
  await page.getByRole('button', { name: 'Import guest data…' }).click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Import finished')).toBeVisible({ timeout: 30_000 });

  const { client } = await signedIn('A');
  const maps = (await client.from('maps').select('id, name').like('name', '%(from guest)')).data!;
  expect(maps.length).toBeGreaterThanOrEqual(1);
  const pins = (await client.from('pins').select('id, title, image_id, pin_groups(group_id)').eq('title', `Import me ${RUN}`)).data!;
  expect(pins).toHaveLength(1);
  expect(pins[0].image_id).not.toBeNull(); // image re-uploaded to private Storage
  expect(pins[0].pin_groups.length).toBe(1);
  const after = await accountCounts();
  expect(after.maps).toBe(before.maps + maps.length);
  // Guest data is still on the device until the user clears it.
  expect(await page.evaluate(() => localStorage.getItem('atlas.guest.v1'))).toContain(`Import me ${RUN}`);

  // Cleanup (A's own data).
  const imgs = (await client.from('pins').select('image_id').in('map_id', maps.map((m) => m.id))).data!.map((p) => p.image_id).filter(Boolean) as string[];
  const paths = (await client.from('pin_images').select('id, storage_path').in('id', imgs)).data ?? [];
  await client.from('maps').delete().in('id', maps.map((m) => m.id));
  await client.from('pin_images').delete().in('id', paths.map((p) => p.id));
  if (paths.length) await client.storage.from('pin-images').remove(paths.map((p) => p.storage_path));
  await client.from('groups').delete().eq('name', `Imported group ${RUN}`);
  expect(await accountCounts()).toEqual(before);
});

test('a signed-in tutorial runs in the sandbox and never changes account data', async ({ page }) => {
  const before = await accountCounts();
  const hits = recordPrivateRequests(page);
  await signIn(page, 'A');
  hits.length = 0;
  await page.getByRole('button', { name: 'Help and tutorial' }).click();
  await page.getByRole('button', { name: '3. Personal maps' }).click();
  const card = page.getByTestId('tour-card');
  await expect(card.getByRole('heading', { name: 'Create a map' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tutorial sandbox/ })).toBeVisible();
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill(`Tour map ${RUN}`);
  await page.getByRole('button', { name: 'Create map' }).click();
  await expect(card.getByText('Done!')).toBeVisible();
  await card.getByRole('button', { name: 'Exit tour' }).click();
  expect(hits.filter(isWrite), 'tour wrote to the account').toEqual([]);
  expect(await accountCounts()).toEqual(before);
});
