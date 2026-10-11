/**
 * Interactive tutorial (no backend): entry points, controls, task validation,
 * robustness, accessibility, and the guarantee that the practice sandbox never
 * touches the guest workspace.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickMapAt, freshGuest, mapLink, openMyMaps, waitForMap } from './helpers';

const card = (page: Page) => page.getByTestId('tour-card');
const counter = (page: Page) => page.getByTestId('tour-counter');
const next = (page: Page) => card(page).getByRole('button', { name: /^(Next|Finish)/ });

async function openHelpChapter(page: Page, label: RegExp | string) {
  await page.getByRole('button', { name: 'Help and tutorial' }).click();
  await page.getByRole('button', { name: label }).click();
  await expect(card(page)).toBeVisible();
}

test('first visit offers the tour; Skip dismisses it for good', async ({ page }) => {
  await freshGuest(page, { firstRun: true });
  await page.goto('/');
  await expect(page.getByTestId('first-run-offer')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByTestId('first-run-offer')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Help and tutorial' })).toBeVisible();
  await expect(page.getByTestId('first-run-offer')).toHaveCount(0);
});

test('first-visit Start, Next/Back, task gating, Exit and Restart', async ({ page }) => {
  await freshGuest(page, { firstRun: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start the tour' }).click();
  await expect(card(page).getByRole('heading', { name: 'Welcome to the Atlas tour' })).toBeVisible();
  await expect(counter(page)).toContainText('Step 1 of');
  await expect(page.getByRole('button', { name: /Tutorial sandbox/ })).toBeVisible();

  await next(page).click();
  await expect(counter(page)).toContainText('Step 2 of');
  await card(page).getByRole('button', { name: 'Back' }).click();
  await expect(counter(page)).toContainText('Step 1 of');
  await next(page).click();
  await next(page).click();

  // Step 3 requires a real pan/zoom before Next unlocks.
  await expect(card(page).getByRole('heading', { name: 'Move around the map' })).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await waitForMap(page);
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await expect(card(page).getByText('Done!')).toBeVisible();
  await expect(next(page)).toBeEnabled();
  await next(page).click();

  // Skip step works without doing the task.
  await expect(card(page).getByRole('heading', { name: 'Select an event' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Skip step' }).click();
  await expect(card(page).getByRole('heading', { name: 'Panels open and close' })).toBeVisible();

  // Exit, then Restart from Help starts again at step 1.
  await card(page).getByRole('button', { name: 'Exit tour' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Guest · on this device/ })).toBeVisible();
  await openHelpChapter(page, /Take the interactive tour|Restart the interactive tour/);
  await expect(counter(page)).toContainText('Step 1 of');
});

test('Escape (focus in the card) exits; keyboard can drive the tour', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/');
  await openHelpChapter(page, 'Take the interactive tour');
  // Focus moves to the step heading.
  await expect(card(page).getByRole('heading', { name: 'Welcome to the Atlas tour' })).toBeFocused();
  await next(page).focus();
  await page.keyboard.press('Enter');
  await expect(counter(page)).toContainText('Step 2 of');
  await expect(card(page).getByRole('heading', { name: 'One map, two views' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
});

test('panel tasks reopen hidden panels; collapsing then expanding completes the step', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/');
  // Hide the left panel before the tour: the "contexts" step must reopen it.
  await page.getByRole('button', { name: 'Collapse side panel' }).click();
  await openHelpChapter(page, '1. Getting around Atlas');
  await next(page).click();
  await expect(card(page).getByRole('heading', { name: 'One map, two views' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse side panel' })).toBeVisible(); // reopened
  for (let i = 0; i < 3; i++) {
    const s = card(page).getByRole('button', { name: 'Skip step' });
    if (await s.isVisible()) await s.click(); else await next(page).click();
  }
  await expect(card(page).getByRole('heading', { name: 'Panels open and close' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse side panel' }).click();
  await page.getByRole('button', { name: 'Expand side panel' }).click();
  await expect(card(page).getByText('Done!')).toBeVisible();
});

test('practice actions are verified, and the sandbox never touches guest data', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/maps');
  // A guest map that must survive the tour untouched.
  await page.getByRole('tab', { name: 'My pins' }).click();
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill('Keep me');
  await page.getByRole('button', { name: 'Create map' }).click();
  const before = await page.evaluate(() => localStorage.getItem('atlas.guest.v1'));

  await openHelpChapter(page, '3. Personal maps');
  await expect(card(page).getByRole('heading', { name: 'Create a map' })).toBeVisible();
  await expect(mapLink(page, 'Keep me')).toHaveCount(0); // sandbox shows practice maps only
  await page.getByRole('tab', { name: 'My pins' }).click();
  await page.getByRole('button', { name: 'New map' }).click();
  await page.getByRole('dialog', { name: 'New private map' }).getByLabel('Name').fill('Practice A');
  await page.getByRole('button', { name: 'Create map' }).click();
  await expect(card(page).getByText('Done!')).toBeVisible();
  await next(page).click();
  await expect(card(page).getByText('Done!')).toBeVisible(); // already viewing the new map
  await next(page).click();
  await card(page).getByRole('button', { name: 'Skip step' }).click(); // save-event
  // Custom pin task
  await expect(card(page).getByRole('heading', { name: 'Add a custom pin' })).toBeVisible();
  await waitForMap(page);
  await page.getByRole('tab', { name: 'My pins' }).click();
  await page.getByRole('button', { name: 'Add custom pin' }).click();
  await clickMapAt(page, 40, 40);
  const dlg = page.getByRole('dialog', { name: 'New custom pin' });
  await dlg.getByLabel('Title').fill('Practice pin');
  await dlg.getByLabel('New group name').fill('Practice');
  await dlg.getByRole('button', { name: 'Add group' }).click();
  await dlg.getByRole('button', { name: 'Create pin' }).click();
  await expect(card(page).getByText('Done!')).toBeVisible();

  // Exit: sandbox discarded, guest workspace byte-for-byte unchanged.
  await card(page).getByRole('button', { name: 'Exit tour' }).click();
  await openMyMaps(page);
  await expect(mapLink(page, 'Keep me')).toBeVisible();
  await expect(mapLink(page, 'Practice A')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('atlas.guest.v1'))).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('atlas.sandbox.v1'))).toBeNull();
});

test('image chapter: sample image becomes the marker; missing targets fall back gracefully', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/');
  await openHelpChapter(page, '5. Pin customization and images');
  await expect(card(page).getByRole('heading', { name: 'Customize a pin' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Skip step' }).click();
  await expect(card(page).getByRole('heading', { name: 'Use an image as the marker' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Skip step' }).click();

  // No image exists yet -> the target is missing -> explained fallback, Next still works.
  await expect(card(page).getByRole('heading', { name: 'The image is the marker' })).toBeVisible();
  await expect(card(page).getByText(/isn’t visible right now/)).toBeVisible({ timeout: 6000 });
  await card(page).getByRole('button', { name: 'Back' }).click();

  // Do it for real with the sample image.
  await expect(page.getByRole('article', { name: /Pin: Practice pin/ })).toBeVisible();
  await page.getByRole('article', { name: /Pin: Practice pin/ }).getByRole('button', { name: 'Customize' }).click();
  const ap = page.getByRole('dialog', { name: 'Customize pin' });
  await ap.getByRole('button', { name: 'Upload image' }).click();
  await ap.getByRole('button', { name: 'Use a sample image instead' }).click();
  await ap.getByRole('button', { name: 'Use this image' }).click();
  await ap.getByRole('button', { name: 'Save appearance' }).click();
  await expect(card(page).getByText('Done!')).toBeVisible();
  await next(page).click();
  await expect(card(page).getByRole('heading', { name: 'The image is the marker' })).toBeVisible();
  await expect(page.getByRole('article', { name: /Pin: Practice pin/ })).toHaveCount(0); // step cleared the selection
  const marker = page.locator('[data-tour="image-marker"]');
  await expect(marker).toBeVisible();
  await marker.click();
  await expect(card(page).getByText('Done!')).toBeVisible();
});

test('reduced motion: the tour works with animations disabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await freshGuest(page);
  await page.goto('/');
  await openHelpChapter(page, 'Take the interactive tour');
  const duration = await card(page).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
  await next(page).click();
  await expect(counter(page)).toContainText('Step 2 of');
});

test('every chapter and step is reachable and the tour can be completed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshGuest(page);
  await page.goto('/');
  await openHelpChapter(page, 'Take the interactive tour');
  const total = Number((await counter(page).innerText()).match(/of (\d+)/)![1]);
  const seenChapters = new Set<string>();
  for (let i = 1; i <= total; i++) {
    await expect(counter(page)).toContainText(`Step ${i} of ${total}`);
    const header = await card(page).locator('span').first().innerText();
    seenChapters.add(header.split('·')[0].trim());
    if (i === total) break;
    const skip = card(page).getByRole('button', { name: 'Skip step' });
    if (await skip.isVisible()) await skip.click(); else await next(page).click();
  }
  expect(seenChapters.size).toBe(7);
  await card(page).getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Tour complete!')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('atlas.tutorial.v1')!).completed)).toBe(true);
  expect(errors).toEqual([]);
});

test('tour progress survives a refresh mid-tour', async ({ page }) => {
  await freshGuest(page);
  await page.goto('/');
  await openHelpChapter(page, '4. Groups and filtering');
  await expect(card(page).getByRole('heading', { name: 'Groups' })).toBeVisible();
  await page.reload();
  await expect(card(page).getByRole('heading', { name: 'Groups' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tutorial sandbox/ })).toBeVisible();
});
