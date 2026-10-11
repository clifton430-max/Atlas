/**
 * LIVE online chess through the real UI: two accounts, two browsers.
 * Challenge -> accept -> moves sync in real time -> refresh resumes -> resign.
 */
import { expect, test, type Page } from '@playwright/test';
import { signedIn } from '../live/env';
import { RUN, signIn } from './helpers';

const sq = (page: Page, s: string) => page.getByRole('gridcell', { name: new RegExp(`^${s},`) });

test('online chess between two collaborators syncs live and survives refresh', async ({ browser }) => {
  const { client: a } = await signedIn('A');
  const { client: b } = await signedIn('B');
  const map = (await a.rpc('create_collab_map', { p_name: `Chess UI ${RUN}` })).data as string;
  const inv = (await a.rpc('create_collab_invitation', { p_map_id: map, p_role: 'viewer', p_expires_in_hours: 1 })).data[0];
  await b.rpc('accept_collab_invitation', { p_token: inv.token });
  const { data: bProfile } = await b.from('profiles').select('id, username, display_name').eq('id', (await b.auth.getUser()).data.user!.id).single();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  let gameId = '';
  try {
    for (const c of [ctxA, ctxB]) await c.addInitScript(() => localStorage.setItem('atlas.tutorial.v1', JSON.stringify({ firstRunHandled: true })));
    const pa = await ctxA.newPage();
    const pb = await ctxB.newPage();
    await signIn(pa, 'A', '/chess');
    await signIn(pb, 'B', '/chess');
    await pa.getByRole('tab', { name: 'Play online' }).click();
    await pb.getByRole('tab', { name: 'Play online' }).click();

    // A challenges B as White.
    await pa.getByLabel('Opponent').selectOption(bProfile!.id);
    await pa.getByLabel('You play').selectOption('white');
    await pa.getByRole('button', { name: 'Send challenge' }).click();
    await expect(pa).toHaveURL(/\/chess\/[0-9a-f-]{36}/);
    gameId = pa.url().match(/\/chess\/([0-9a-f-]{36})/)![1];
    await expect(pa.getByText('Waiting for your opponent to accept…')).toBeVisible();

    // B sees the challenge live and accepts.
    const games = pb.getByRole('region', { name: 'Your games' });
    await expect(games.getByRole('button', { name: 'Accept' })).toBeVisible();
    await games.getByRole('button', { name: 'Accept' }).click();
    await expect(pb).toHaveURL(new RegExp(gameId));

    // A (White) moves; B sees it without reloading. B can't move White's pieces.
    await expect(pa.getByRole('status').filter({ hasText: 'your move' })).toBeVisible();
    await sq(pa, 'e2').click(); await sq(pa, 'e4').click();
    await expect(sq(pb, 'e4')).toHaveAccessibleName(/white pawn/);
    await sq(pb, 'd2').click();
    await expect(sq(pb, 'd2')).toHaveAttribute('aria-selected', 'false');
    await sq(pb, 'e7').click(); await sq(pb, 'e5').click();
    await expect(sq(pa, 'e5')).toHaveAccessibleName(/black pawn/);

    // Refresh resumes the persisted game.
    await pa.reload();
    await expect(sq(pa, 'e5')).toHaveAccessibleName(/black pawn/);
    await expect(pa.getByRole('region', { name: 'Move history' })).toContainText('e4');

    // B resigns; A sees the result live.
    await pb.getByRole('button', { name: 'Resign' }).click();
    await pb.getByRole('dialog', { name: 'Resign this game?' }).getByRole('button', { name: 'Resign' }).click();
    await expect(pa.getByRole('status').filter({ hasText: 'wins' })).toContainText('Resignation');
  } finally {
    if (gameId) await a.rpc('resign_chess_game', { p_game_id: gameId });
    await a.from('collab_maps').delete().eq('id', map);
    await ctxA.close(); await ctxB.close();
  }
});
