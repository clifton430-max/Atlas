/**
 * Guest Mode in a real browser (no backend configured): Atlas is usable
 * without signing in; guest data is local, persistent, validated, and
 * account-only features explain themselves instead of faking success.
 */
import { expect, test } from '@playwright/test';
import { clickMapAt, createGroupInPicker, freshGuest, makePng, mapLink, openMap, openMyMaps, openShared, waitForMap, type AtlasWindow } from './helpers';

test.beforeEach(async ({ page }) => freshGuest(page));

test('opens without an auth wall and shows Guest Mode clearly', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /Guest · on this device/ })).toBeVisible();
  await page.getByRole('button', { name: /Guest · on this device/ }).click();
  await expect(page.getByText('saved only in this browser on this device', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  // A ready-to-use local map exists; the My Maps tab opens it.
  await openMyMaps(page);
  await expect(mapLink(page, 'My Map')).toBeVisible();
  await expect(page).toHaveURL(/\/maps\//);
  await expect(page.getByRole('button', { name: 'Add custom pin' })).toBeVisible();
});

test('guest maps, groups (with icons), pins, edit, move, OR filter, persistence and deletion', async ({ page }) => {
  await page.goto('/maps');
  await waitForMap(page);

  // Create + rename a map
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill('Guest trip');
  await page.getByRole('button', { name: 'Create map' }).click();
  await expect(page).toHaveURL(/\/maps\//);
  await page.getByRole('link', { name: 'Guest trip' }).hover();
  await page.getByRole('button', { name: 'Rename Guest trip' }).click();
  await page.getByRole('dialog', { name: 'Rename map' }).getByLabel('Name').fill('Guest trip 2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Guest trip 2' })).toBeVisible();

  // Group with a color and an icon via the Groups section
  await page.getByRole('button', { name: 'New group' }).click();
  const gd = page.getByRole('dialog', { name: 'New group' });
  await gd.getByLabel('Name').fill('Food');
  await gd.getByRole('button', { name: 'Food' }).click(); // the "Food" (utensils) icon
  await gd.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('[data-tour="groups-section"]').getByText('Food')).toBeVisible();

  // Two custom pins; group required
  const addPin = async (title: string, dx: number, groups: string[], newGroup?: string) => {
    await page.getByRole('button', { name: 'Add custom pin' }).click();
    await clickMapAt(page, dx, 0);
    const dlg = page.getByRole('dialog', { name: 'New custom pin' });
    await dlg.getByLabel('Title').fill(title);
    if (newGroup) await createGroupInPicker(dlg, newGroup);
    for (const g of groups) await dlg.getByRole('checkbox', { name: g }).check();
    await dlg.getByRole('button', { name: 'Create pin' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  };
  // Required group: attempt without one first
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  await clickMapAt(page, -150, 0);
  const d0 = page.getByRole('dialog', { name: 'New custom pin' });
  await d0.getByLabel('Title').fill('No group');
  await d0.getByRole('button', { name: 'Create pin' }).click();
  await expect(d0.getByText('Choose at least one group.')).toBeVisible();
  await d0.getByRole('button', { name: 'Cancel' }).click();

  await addPin('Cafe', -120, ['Food']);
  await addPin('Club', 120, [], 'Music');

  // OR filter
  await page.getByRole('button', { name: /Group filter: All Groups/ }).click();
  await page.getByRole('checkbox', { name: 'Food' }).check();
  await expect(page.getByRole('button', { name: 'Cafe', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Club', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Music' }).check();
  await expect(page.getByRole('button', { name: 'Group filter: Groups: Food, Music' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Club', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Food' }).uncheck();
  await page.getByRole('checkbox', { name: 'Music' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'All Groups' })).toBeChecked();
  await page.keyboard.press('Escape');

  // Edit note, move
  await page.getByRole('button', { name: 'Cafe', exact: true }).click();
  const card = page.getByRole('article', { name: 'Pin: Cafe' });
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Private note').fill('Great espresso');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('Great espresso')).toBeVisible();
  await card.getByRole('button', { name: 'Move' }).click();
  await clickMapAt(page, -60, 80);
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByText('Pin moved.')).toBeVisible();

  // Persistence across refresh
  await page.reload();
  await expect(page.getByRole('link', { name: 'Guest trip 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cafe', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Club', exact: true })).toBeVisible();

  // Delete a pin, then the map
  await page.getByRole('button', { name: 'Club', exact: true }).click();
  await page.getByRole('button', { name: 'Delete pin' }).click();
  await page.getByRole('dialog', { name: 'Delete pin?' }).getByRole('button', { name: 'Delete pin' }).click();
  await expect(page.getByRole('button', { name: 'Club', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Guest trip 2' }).hover();
  await page.getByRole('button', { name: 'Delete Guest trip 2' }).click();
  await page.getByRole('button', { name: 'Delete map' }).click();
  await expect(page.getByRole('link', { name: 'Guest trip 2' })).toHaveCount(0);
});

test('guest image upload becomes the actual, anchored, interactive map marker', async ({ page }) => {
  await page.goto('/');
  await openMap(page);
  await waitForMap(page);
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  await clickMapAt(page);
  const dlg = page.getByRole('dialog', { name: 'New custom pin' });
  await dlg.getByLabel('Title').fill('Photo spot');
  await createGroupInPicker(dlg, 'Photos');
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  const card = page.getByRole('article', { name: 'Pin: Photo spot' });
  await card.getByRole('button', { name: 'Customize' }).click();
  const ap = page.getByRole('dialog', { name: 'Customize pin' });
  await ap.getByRole('button', { name: 'Upload image' }).click();
  await ap.getByLabel('Choose marker image').setInputFiles({ name: 'm.png', mimeType: 'image/png', buffer: await makePng(page) });
  await ap.getByRole('button', { name: 'Use this image' }).click();
  await ap.getByRole('button', { name: 'Save appearance' }).click();
  await expect(ap).toBeHidden();

  const marker = page.getByRole('button', { name: 'Photo spot', exact: true });
  await expect(marker).toHaveAttribute('data-image-marker', 'true');
  await expect(marker.locator('img')).toHaveAttribute('src', /^data:image\//); // local, not uploaded
  await expect(marker.locator('svg')).toHaveCount(0);

  // Anchored: the marker's center stays on the coordinate after the map moves.
  const coord = await page.evaluate(() => {
    const m = (window as AtlasWindow).__atlasMap!;
    const c = m.getCenter();
    return [c.lng, c.lat];
  });
  await page.evaluate(() => (window as AtlasWindow).__atlasMap!.panBy([140, 60], { duration: 0 }));
  await page.waitForTimeout(150);
  const [b, p] = await Promise.all([
    marker.locator('img').boundingBox(),
    page.evaluate((c) => {
      const m = (window as AtlasWindow).__atlasMap!;
      const pt = m.project(c as [number, number]);
      const r = m.getCanvas().getBoundingClientRect();
      return { x: r.left + pt.x, y: r.top + pt.y };
    }, coord),
  ]);
  expect(Math.abs(b!.x + b!.width / 2 - p.x)).toBeLessThan(3);
  expect(Math.abs(b!.y + b!.height / 2 - p.y)).toBeLessThan(3);

  // Interactive: close and reopen via the image marker.
  await card.getByRole('button', { name: 'Close pin details' }).click();
  await marker.click();
  await expect(card).toBeVisible();

  // Survives a refresh.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Photo spot', exact: true })).toHaveAttribute('data-image-marker', 'true');
});

test('guest can save a public event with a required group', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await page.getByRole('button', { name: /Late Night Jazz/ }).click();
  const card = page.getByRole('article', { name: /Late Night Jazz/ });
  const form = card.getByRole('region', { name: 'Add to map' });
  await card.getByRole('button', { name: 'Bookmark: add to a map' }).click();
  await expect(form.getByLabel('Select map')).toBeFocused();
  await expect(form.getByText('Saved only in this browser on this device.')).toBeVisible();
  await form.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(form.getByText('Choose at least one group.')).toBeVisible();
  await createGroupInPicker(form, 'Jazz');
  await form.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Added to My Map');
  await expect(card.getByRole('button', { name: 'Saved to a map — edit' })).toBeVisible();
  await openMap(page);
  await expect(page.getByRole('button', { name: /Late Night Jazz/ }).first()).toBeVisible();
});

test('account-only features explain the need for an account and never fake success', async ({ page }) => {
  for (const path of ['/settings/friends', '/settings/account', '/collab/some-map', '/invite/abc', '/friend/abc']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'An account is needed for this' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Keep exploring' })).toBeVisible();
  }

  // Collaboration demo: clearly labelled, invite explains instead of pretending.
  await page.goto('/');
  await openShared(page);
  await mapLink(page, /Weekend trip \(demo\)/).click();
  await expect(page).toHaveURL(/\/collab\/demo$/);
  await expect(page.getByText(/Demo collaboration map — stored only on this device/)).toBeVisible();
  await page.getByRole('button', { name: 'Invite people…' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toContainText('No invitation is created in this demo');
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('group', { name: 'Preview role' }).getByRole('button', { name: 'viewer' }).click();
  await expect(page.getByText('Cannot: share copies of their own pins')).toBeVisible();
  await page.getByRole('button', { name: /Remove Riley/ }).click();
  await expect(page.getByText(/would lose access immediately/)).toBeVisible();
});

test('sharing a guest pin goes to the local demo map only', async ({ page }) => {
  await page.goto('/');
  await openMap(page);
  await waitForMap(page);
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  await clickMapAt(page);
  const dlg = page.getByRole('dialog', { name: 'New custom pin' });
  await dlg.getByLabel('Title').fill('Shared spot');
  await dlg.getByLabel('Private note (optional)').fill('my secret');
  await createGroupInPicker(dlg, 'Spots');
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  await page.getByRole('article', { name: 'Pin: Shared spot' }).getByRole('button', { name: 'Share' }).click();
  const share = page.getByRole('dialog', { name: /Share pin/ });
  await expect(share.getByText('Demo', { exact: true })).toBeVisible();
  await share.getByRole('button', { name: 'Review' }).click();
  await share.getByRole('button', { name: 'Share to demo' }).click();
  await expect(page.getByText('Shared a copy to the demo map (only on this device).')).toBeVisible();
  await openShared(page);
  await mapLink(page, /Weekend trip \(demo\)/).click();
  await page.getByRole('button', { name: /Shared spot \(demo shared copy\)/ }).click();
  const copy = page.getByRole('article', { name: /Demo shared pin: Shared spot/ });
  await expect(copy).toBeVisible();
  await expect(copy.getByText('my secret')).toHaveCount(0); // note not shared by default
});

test('reset guest workspace from Settings → Guest data', async ({ page }) => {
  await page.goto('/maps');
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill('Temp');
  await page.getByRole('button', { name: 'Create map' }).click();
  await page.goto('/settings/guest');
  await expect(page.getByText(/2 maps/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset guest workspace' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText(/1 map, 0 groups, 0 pins/)).toBeVisible();
  await page.goto('/maps');
  await expect(mapLink(page, 'Temp')).toHaveCount(0);
  await expect(mapLink(page, 'My Map')).toBeVisible();
});

test('corrupt local data is backed up and the app still loads', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__corrupted')) {
      sessionStorage.setItem('__corrupted', '1');
      localStorage.setItem('atlas.guest.v1', '{this is not json');
    }
  });
  await page.goto('/settings/guest');
  await expect(page.getByText(/could not be read, so a fresh workspace was started/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('atlas.guest.v1.corrupt-backup'))).toBe('{this is not json');
});

test('full browser storage is reported and nothing is half-saved', async ({ page }) => {
  await page.goto('/maps');
  await expect(mapLink(page, 'My Map')).toBeVisible();
  // Simulate a full quota from now on.
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'atlas.guest.v1') throw new DOMException('full', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill('Wont fit');
  await page.getByRole('button', { name: 'Create map' }).click();
  await expect(page.getByRole('dialog', { name: 'New private map' }).getByRole('alert')).toContainText('storage is full');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name: 'Wont fit' })).toHaveCount(0);
});
