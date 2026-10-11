/**
 * Real UI flows against the live backend. Each test creates uniquely named
 * data and deletes it through the UI at the end (which also tests deletion).
 */
import { expect, test } from '@playwright/test';
import { liveConfigured, signedIn } from '../live/env';
import { makePng, RUN, signIn, waitForMap } from './helpers';

test.skip(!liveConfigured, 'live test accounts not configured');

test('auth: sign in, session persists across reload, sign out protects routes', async ({ page }) => {
  await signIn(page, 'A');
  await page.reload();
  await expect(page.getByRole('button', { name: /Account menu for/ })).toBeVisible();
  await page.getByRole('button', { name: /Account menu for/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
  // Account-only sections explain the need for an account (no silent redirect, no data shown).
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'An account is needed for this' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in or create account' })).toHaveAttribute('href', '/auth?next=%2Fsettings%2Faccount');
});

test('personal map: create map, custom pin with required group, group filter, image marker, move, delete', async ({ page }) => {
  await signIn(page, 'A');
  const mapName = `E2E map ${RUN}`;
  const pinTitle = `E2E pin ${RUN}`;
  const groupName = `E2E group ${RUN}`;

  // Create a map (My Map tab -> My pins)
  await page.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'My Map', exact: true }).click();
  await page.getByRole('tab', { name: 'My pins' }).click();
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill(mapName);
  await page.getByRole('button', { name: 'Create map' }).click();
  await expect(page).toHaveURL(/\/maps\//);
  await waitForMap(page);

  // Place a custom pin: group is mandatory
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  const canvas = page.getByTestId('map-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const dlg = page.getByRole('dialog', { name: 'New custom pin' });
  await dlg.getByLabel('Title').fill(pinTitle);
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  await expect(dlg.getByText('Choose at least one group.')).toBeVisible(); // not saved without a group
  if (await dlg.getByRole('button', { name: 'New group' }).isVisible()) await dlg.getByRole('button', { name: 'New group' }).click();
  await dlg.getByLabel('New group name').fill(groupName);
  await dlg.getByRole('button', { name: 'Coffee' }).click(); // group icon
  await dlg.getByRole('button', { name: 'Add group' }).click();
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  await expect(dlg).toBeHidden();
  {
    const { client } = await signedIn('A');
    const g = await client.from('groups').select('color, icon').eq('name', groupName).single();
    expect(g.data!.icon).toBe('coffee'); // icon persisted for the account
  }
  const marker = page.getByRole('button', { name: pinTitle, exact: true });
  await expect(marker).toBeVisible();

  // Group filter: select the group -> label changes, pin still shown; back to All Groups
  await page.getByRole('button', { name: /Group filter: All Groups/ }).click();
  await page.getByRole('checkbox', { name: groupName }).check();
  await expect(page.getByRole('button', { name: `Group filter: Group: ${groupName}` })).toBeVisible();
  await expect(marker).toBeVisible();
  await page.getByRole('checkbox', { name: groupName }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'All Groups' })).toBeChecked();
  await page.keyboard.press('Escape');

  // Customize with an uploaded image -> image becomes the actual marker
  const card = page.getByRole('article', { name: `Pin: ${pinTitle}` });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Customize' }).click();
  const appearance = page.getByRole('dialog', { name: 'Customize pin' });
  await appearance.getByRole('button', { name: 'Upload image' }).click();
  await appearance.getByLabel('Choose marker image').setInputFiles({ name: 'marker.png', mimeType: 'image/png', buffer: await makePng(page) });
  await appearance.getByRole('button', { name: 'Use this image' }).click();
  await appearance.getByRole('button', { name: 'Save appearance' }).click();
  await expect(appearance).toBeHidden();
  await expect(marker).toHaveAttribute('data-image-marker', 'true');
  // The image fills the droplet pin's head, loaded from a signed Storage URL.
  await expect(marker.locator('[data-droplet="true"] image')).toHaveCount(1);
  const src = await marker.locator('image').getAttribute('href');
  expect(src).toContain('/storage/v1/object/sign/pin-images/');
  const loaded = await page.evaluate(async (u) => { const r = await fetch(u!); return r.ok && (r.headers.get('content-type') ?? '').startsWith('image/'); }, src);
  expect(loaded).toBe(true);

  // Interactive: close card, click the image marker to reopen
  await card.getByRole('button', { name: 'Close pin details' }).click();
  await marker.click();
  await expect(card).toBeVisible();

  // Move the pin's location (Move on map -> click -> Save location)
  await card.getByRole('button', { name: 'Move' }).click();
  await page.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60);
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByText('Pin moved.')).toBeVisible();

  // Delete the map (cascades its pins)
  await page.getByRole('link', { name: mapName }).hover();
  await page.getByRole('button', { name: `Delete ${mapName}` }).click();
  await page.getByRole('button', { name: 'Delete map' }).click();
  await expect(page.getByRole('link', { name: mapName })).toHaveCount(0);

  // Clean up the group via Settings
  await page.goto('/settings/groups');
  await page.getByRole('listitem').filter({ hasText: groupName }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete group' }).click();
  await expect(page.getByText(groupName)).toHaveCount(0);
});

test('discover: saving an event requires a group and does not duplicate', async ({ page }) => {
  // Start clean: remove any saved copy of the test event left by an aborted earlier run (A's own data, via the API).
  const { client } = await signedIn('A');
  const ev = await client.from('events').select('id').eq('provider', 'atlas-live-test').single();
  await client.from('pins').delete().eq('event_id', ev.data!.id);
  await signIn(page, 'A');
  await page.evaluate(() => localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-30, 0.5], zoom: 9 })));
  await page.goto('/');
  await waitForMap(page);
  const item = page.getByRole('button', { name: /Atlas live-test event/ });
  await item.click();
  const card = page.getByRole('article', { name: /Atlas live-test event/ });
  await expect(card.getByText('Development sample', { exact: true })).toBeVisible();
  const form = card.getByRole('region', { name: 'Add to map' });
  await form.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(form.getByText('Choose at least one group.')).toBeVisible();
  if (await form.getByRole('button', { name: 'New group' }).isVisible()) await form.getByRole('button', { name: 'New group' }).click();
  await form.getByLabel('New group name').fill(`Saved ${RUN}`);
  await form.getByRole('button', { name: 'Add group' }).click();
  await form.getByRole('button', { name: 'Add to map', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Added to');
  await expect(card.getByRole('button', { name: 'Saved to a map — edit' })).toBeVisible();
  // Saving again updates instead of creating a duplicate
  await expect(form.getByText(/already on this map/)).toBeVisible();
  await form.getByRole('button', { name: 'Update on map' }).click();
  await expect(form.getByRole('status')).toContainText('Updated on');
  const pins = (await client.from('pins').select('id').eq('event_id', ev.data!.id)).data!;
  expect(pins).toHaveLength(1);

  // Clean up: delete the saved pin and group via Settings
  await page.goto('/settings/pins');
  await page.getByRole('row').filter({ hasText: 'Atlas live-test event' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete pin' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Atlas live-test event' })).toHaveCount(0); // wait for the delete to finish
  await page.goto('/settings/groups');
  await page.getByRole('listitem').filter({ hasText: `Saved ${RUN}` }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete group' }).click();
  await expect(page.getByText(`Saved ${RUN}`)).toHaveCount(0);
});

test('collaboration: invite link, explicit accept, viewer role, removal revokes access', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const memberCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const member = await memberCtx.newPage();
  const collabName = `E2E collab ${RUN}`;

  await signIn(owner, 'A');
  await owner.getByRole('navigation', { name: 'Map contexts' }).getByRole('link', { name: 'Shared' }).click();
  await owner.getByRole('button', { name: 'New collaboration map' }).click();
  await owner.getByRole('dialog', { name: 'New collaboration map' }).getByLabel('Name').fill(collabName);
  await owner.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(owner).toHaveURL(/\/collab\//);
  const collabUrl = owner.url();

  await owner.getByRole('button', { name: 'Invite', exact: true }).click();
  await owner.getByRole('button', { name: 'Create invitation' }).click();
  const link = await owner.locator('#share-link-field').inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);
  await expect(owner.getByRole('img', { name: /QR code for/ })).toBeVisible();
  await owner.getByRole('button', { name: 'Done' }).click();

  // Member opens the link; must sign in, then explicitly accept.
  await member.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  // Signed out: the invite page explains an account is needed, then sign-in returns to the invite.
  await expect(member.getByRole('heading', { name: 'An account is needed for this' })).toBeVisible();
  await member.getByRole('link', { name: 'Sign in or create account' }).click();
  await expect(member).toHaveURL(/\/auth\?next=%2Finvite%2F/);
  await signIn(member, 'C', new URL(link).pathname);
  await expect(member.getByText(/invited you to join/)).toBeVisible();
  await member.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(member).toHaveURL(/\/collab\//);
  await expect(member.getByRole('region', { name: `${collabName} details` })).toBeVisible();
  await expect(member.getByRole('button', { name: 'Invite', exact: true })).toHaveCount(0); // viewer: no owner controls

  // Owner removes the member -> member loses access
  await owner.reload();
  await owner.getByRole('button', { name: 'Remove atlas_live_c' }).click();
  await owner.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(owner.getByRole('button', { name: 'Remove atlas_live_c' })).toHaveCount(0);
  await member.goto(new URL(collabUrl).pathname);
  await expect(member.getByText(/no longer a member/)).toBeVisible();

  // Owner deletes the collaboration map
  await owner.getByRole('button', { name: 'Delete', exact: true }).click();
  await owner.getByRole('button', { name: 'Delete map' }).click();
  await expect(owner).toHaveURL(/\/collab$/);
  await ownerCtx.close();
  await memberCtx.close();
});

test('friends: search, request, accept, remove via the UI', async ({ browser }) => {
  // Start clean (participants' own data via the API).
  const { client: a } = await signedIn('A');
  const { data: rows } = await a.from('friendships').select('id, status');
  for (const f of rows ?? []) if (f.status === 'accepted' || f.status === 'pending') await a.rpc('remove_friendship', { p_friendship_id: f.id });
  const { client: c } = await signedIn('C');
  const { data: rowsC } = await c.from('friendships').select('id, status');
  for (const f of rowsC ?? []) if (f.status === 'accepted' || f.status === 'pending') await c.rpc('remove_friendship', { p_friendship_id: f.id });

  const ctxA = await browser.newContext();
  const ctxC = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageC = await ctxC.newPage();

  await signIn(pageC, 'C', '/settings/friends');
  await pageC.getByPlaceholder('Search by username or name').fill('atlas_live_a');
  await pageC.getByRole('listitem').filter({ hasText: '@atlas_live_a' }).getByRole('button', { name: 'Add friend' }).click();
  await expect(pageC.getByText('Sent requests')).toBeVisible();

  await signIn(pageA, 'A', '/settings/friends');
  const req = pageA.getByRole('listitem').filter({ hasText: '@atlas_live_c' });
  await req.getByRole('button', { name: 'Accept' }).click();
  await expect(pageA.getByText(/Friends \(1\)/)).toBeVisible();
  await pageA.getByRole('listitem').filter({ hasText: '@atlas_live_c' }).getByRole('button', { name: 'Remove' }).click();
  await expect(pageA.getByText(/Friends \(1\)/)).toHaveCount(0);
  await ctxA.close();
  await ctxC.close();
});

test('password reset: recovery link -> set new password -> sign in with it', async ({ page }) => {
  const { LIVE, withAdmin, anonClient } = await import('../live/env');
  const user = LIVE.users.find((u) => u.id === 'B')!;
  const origin = new URL(page.url() === 'about:blank' ? 'http://localhost:5175' : page.url()).origin;
  const link = await withAdmin(async (admin) => {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: user.email, options: { redirectTo: `${origin}/auth` } });
    if (error) throw error;
    return data.properties.action_link;
  });
  const newPassword = `Reset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await page.getByLabel('New password').fill(newPassword);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('button', { name: /Account menu for/ })).toBeVisible();
    const { error } = await anonClient().auth.signInWithPassword({ email: user.email, password: newPassword });
    expect(error).toBeNull();
  } finally {
    // Restore the provisioned test password so other tests keep working.
    await withAdmin(async (admin) => {
      const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
      const u = data.users.find((x) => x.email === user.email)!;
      await admin.auth.admin.updateUserById(u.id, { password: user.password });
    });
  }
});

test('sign-up form shows server-side validation errors', async ({ page }) => {
  await page.goto('/auth?mode=signup');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByLabel('Password').fill('a-long-enough-password');
  await page.getByLabel('Username').fill('validation_probe');
  await page.getByRole('button', { name: 'Create account' }).last().click();
  // Any server-side rejection must be surfaced (invalid address, or the project's email rate limit).
  await expect(page.getByRole('alert')).toContainText(/isn’t accepted|wasn’t sent|couldn’t send/);
  await expect(page).toHaveURL(/\/auth/);
});

test('discover shows real Ticketmaster events, labelled as live', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.985, 40.755], zoom: 13 }));
    localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true }));
  });
  await page.goto('/');
  await expect(page.getByText(/Live from Ticketmaster|From Ticketmaster · fetched/)).toBeVisible({ timeout: 30_000 });
  const list = page.locator('[data-tour="events-in-view"] li button');
  await expect(list.first()).toBeVisible();
  await list.first().click();
  const card = page.locator('[data-tour="event-card"]');
  await expect(card.getByText(/Source: Ticketmaster/)).toBeVisible();
  await expect(card.getByText('Development sample', { exact: true })).toHaveCount(0);
  const ticket = card.getByRole('link', { name: /Tickets/ });
  if (await ticket.count()) {
    expect(await ticket.getAttribute('href')).toMatch(/^https:\/\//);
    expect(await ticket.getAttribute('rel')).toContain('noopener');
  }
});
