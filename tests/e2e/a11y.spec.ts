/**
 * Automated accessibility audit (axe-core, WCAG 2 A/AA rules) of the main
 * screens available without a backend. The WebGL map canvas itself is
 * excluded (its content is mirrored by the accessible "Events in view" list).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('atlas.viewport', JSON.stringify({ center: [-73.985, 40.748], zoom: 11.5 })));
});

async function audit(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.maplibregl-canvas')
    .exclude('.maplibregl-ctrl-attrib') // third-party attribution control
    .analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('Discover with event card and filters open has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('welcome-overlay')).toBeHidden({ timeout: 3000 });
  await page.getByRole('button', { name: /Late Night Jazz/ }).click();
  await expect(page.getByRole('article', { name: /Late Night Jazz/ })).toBeVisible();
  await audit(page);
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('dialog', { name: 'Event filters' })).toBeVisible();
  await audit(page);
});

test('Auth page has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByTestId('welcome-overlay')).toBeHidden({ timeout: 3000 });
  await audit(page);
});
