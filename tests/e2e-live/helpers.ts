import { expect, type Page } from '@playwright/test';
import { LIVE } from '../live/env';

export const RUN = Date.now().toString(36);

export async function signIn(page: Page, which: 'A' | 'B' | 'C', next = '/') {
  const u = LIVE.users.find((x) => x.id === which)!;
  await page.goto(`/auth?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: /Account menu for/ })).toBeVisible();
}

/** A real PNG produced by the browser's canvas (valid image bytes). */
export async function makePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0e7490'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(64, 64, 40, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

export async function waitForMap(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __atlasMap?: { loaded(): boolean } }).__atlasMap?.loaded());
}
