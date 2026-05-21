/**
 * Highlight spec for the zfb example.
 *
 * Covers three behaviours:
 *   (a) Panel is togglable on every primary route.
 *   (b) Eye-icon highlight activates — overlay div appears with non-zero
 *       bounding rect and a box-shadow using the slot colour.
 *   (c) "Disable all highlights" button clears active overlays.
 *
 * Prerequisites
 * -------------
 *  - Preview server on port 4173 (started by `playwright.config.ts`
 *    webServer: `pnpm run build && pnpm exec zfb preview --port 4173`).
 *
 * webServer MUST use preview, NOT dev. zfb dev does NOT inject the islands
 * script tag so `window.zfb` is never defined. See playwright.config.ts.
 *
 * Route inventory (6 routes):
 *   /                        → Home
 *   /prose/                  → Prose demo
 *   /components/forms/       → Form controls
 *   /components/status/      → Status surfaces
 *   /components/widgets/     → Interactive widgets
 *   /components/data/        → Data & media
 *
 * Panel storage prefix: `zfb-example-tokens`
 * Console namespace:    `window.zfb`
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'zfb-example-tokens';
const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

// Primary routes to smoke-test panel toggle.
const PRIMARY_ROUTES = [
  { label: 'Home',     path: '/' },
  { label: 'Prose',    path: '/prose/' },
  { label: 'Forms',    path: '/components/forms/' },
  { label: 'Status',   path: '/components/status/' },
  { label: 'Widgets',  path: '/components/widgets/' },
  { label: 'Data',     path: '/components/data/' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed the visible flag in localStorage and reload, causing PanelMount's
 * useEffect to eagerly load the panel module before first paint.
 */
async function openPanel(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((key) => {
    localStorage.setItem(key, '1');
  }, STORAGE_KEY_VISIBLE);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  // Wait for the panel shell to appear.
  await page.locator('.tokenpanel-shell').waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Close the panel and clear the visible flag so subsequent tests start clean.
 */
async function closePanel(page: Page): Promise<void> {
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, STORAGE_KEY_VISIBLE);
  // Click the close button if it exists.
  const closeBtn = page.locator('.tokenpanel-close-btn').first();
  const isVisible = await closeBtn.isVisible();
  if (isVisible) await closeBtn.click();
}

// ---------------------------------------------------------------------------
// (a) Panel toggle on every primary route
// ---------------------------------------------------------------------------

test.describe('zfb example — panel toggle on primary routes', () => {
  for (const route of PRIMARY_ROUTES) {
    test(`${route.label}: panel opens and shows Design Tokens heading`, async ({ page }) => {
      await page.goto(route.path);
      await openPanel(page);

      // The panel header title is "Design Tokens".
      const title = page.locator('.tokenpanel-title');
      await expect(title).toBeVisible({ timeout: 5_000 });
      await expect(title).toHaveText(/Design Tokens/i);

      await closePanel(page);
    });
  }
});

// ---------------------------------------------------------------------------
// (b) Highlight outline visible — non-zero bounding rect + box-shadow
// ---------------------------------------------------------------------------

test.describe('zfb example — highlight outline visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await openPanel(page);
  });

  test.afterEach(async ({ page }) => {
    await closePanel(page);
  });

  test('eye-icon on a color token activates an overlay div with non-zero rect and box-shadow', async ({ page }) => {
    // Navigate to the Color tab.
    const colorTab = page.getByRole('tab', { name: /color/i }).first();
    await colorTab.waitFor({ state: 'visible', timeout: 5_000 });
    await colorTab.click();

    // Click the first VISIBLE highlight toggle button (eye icon) in the panel.
    // Hidden-tab buttons are in the DOM but not visible; filter to visible only.
    const eyeBtn = page.locator('.tokenpanel-highlight-toggle').filter({ visible: true }).first();
    await eyeBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await eyeBtn.click();

    // After clicking the eye icon the overlay portal should appear.
    const overlay = page.locator('.tokenpanel-highlight-overlay').first();
    await overlay.waitFor({ state: 'attached', timeout: 5_000 });

    // Bounding rect must be non-zero (overlay is positioned over a real element).
    const rect = await overlay.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBeGreaterThan(0);

    // The overlay must carry a box-shadow (hostile-host fallback ring).
    const boxShadow = await overlay.evaluate((el) =>
      window.getComputedStyle(el).boxShadow,
    );
    // box-shadow should not be 'none' — it is the inset ring drawn by the overlay.
    expect(boxShadow).not.toBe('none');
  });
});

// ---------------------------------------------------------------------------
// (c) Disable all highlights button clears active overlays
// ---------------------------------------------------------------------------

test.describe('zfb example — disable all highlights', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await openPanel(page);
  });

  test.afterEach(async ({ page }) => {
    await closePanel(page);
  });

  test('"Disable all highlights" clears active overlay divs', async ({ page }) => {
    // Activate the Color tab.
    const colorTab = page.getByRole('tab', { name: /color/i }).first();
    await colorTab.waitFor({ state: 'visible', timeout: 5_000 });
    await colorTab.click();

    // Toggle the first VISIBLE eye icon to create an active highlight.
    // Hidden-tab buttons are in the DOM but not visible; filter to visible only.
    const eyeBtn = page.locator('.tokenpanel-highlight-toggle').filter({ visible: true }).first();
    await eyeBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await eyeBtn.click();

    // Confirm overlay appeared.
    await page.locator('.tokenpanel-highlight-overlay').first().waitFor({ state: 'attached', timeout: 5_000 });

    // Open the highlight settings popover via the gear button.
    const gearBtn = page.locator('.tokenpanel-gear-btn').first();
    await gearBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await gearBtn.click();

    // Click "Disable all highlights".
    const disableAllBtn = page.getByRole('button', { name: /disable all highlights/i }).first();
    await disableAllBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await disableAllBtn.click();

    // All overlays should be gone.
    await expect(page.locator('.tokenpanel-highlight-overlay')).toHaveCount(0, { timeout: 3_000 });
  });
});
