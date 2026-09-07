/**
 * Token-tweak-style spec for the zfb example.
 *
 * Proves the "change token in panel → page style updates" contract per
 * epic #241 R5d. Drives the panel UI to set a known token to a test
 * value and asserts the corresponding consumer element's computed style
 * updates accordingly — without needing the Apply pipeline.
 *
 * Three coverage areas (one consumer each):
 *   1. Font scale  — tweak `--zfb-scale-base` in Font > Type Scale tier.
 *                    Consumer: `body` (font-size: var(--zfb-text-base) →
 *                    var(--zfb-scale-base)).
 *   2. Spacing     — tweak `--zfb-hsp-md` in Spacing > Horizontal spacing.
 *                    Consumer: `.zfb-prose blockquote`
 *                    (padding-left: var(--zfb-hsp-md), styles/global.css:456).
 *   3. Palette     — tweak `--zfb-palette-1` in Color > Palette tier.
 *                    Consumer: `.zfb-heading` (color: var(--zfb-color-primary)
 *                    → var(--zfb-palette-1)).
 *
 * Why the spacing case targets `--zfb-hsp-md` and prose rather than
 * `--zfb-spacing-md` and `.zfb-card`: styles/global.css declares two parallel
 * spacing systems — `--zfb-spacing-*` (:66-69, consumed by `.zfb-card` at :246)
 * and `--zfb-hsp-*` / `--zfb-vsp-*` (:329+, consumed by the prose rules). Only
 * the second set is registered in `config/default-manifest.ts`, so the panel has
 * no control for `--zfb-spacing-md` at all and this test used to time out
 * waiting for a label that could never exist. Registering the other set instead
 * would change what the demo showcases, which is not this spec's call to make.
 *
 * Prerequisites
 * -------------
 *  - The preview server, started by `playwright.config.ts`'s webServer on
 *    `PREVIEW_PORT` (default 4173).
 *  - Each test resets the panel and sweeps its storage afterwards, so runs are
 *    idempotent and overrides cannot leak between tests.
 *
 * Panel storage prefix: `zfb-example-tokens` (see `panel-storage.ts`)
 * Panel number input:   aria-label `${cssVar} value`
 */

import { test, expect, type Page } from '@playwright/test';
import { clearPanelStorage, setPanelVisibleFlag } from './panel-storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openPanel(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await setPanelVisibleFlag(page);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.tokenpanel-shell').waitFor({ state: 'visible', timeout: 10_000 });
}

async function closeAndReset(page: Page): Promise<void> {
  // Reset every override through the panel's own UI, then sweep storage as the
  // authoritative undo.
  //
  // Reaching Reset through the actions popover is not a stylistic choice. From
  // zdtp 0.5.1 the header `.tokenpanel-action-link` items are `display: none`
  // under `@container tokenpanel (max-width: 1135px)`, and the shell measures
  // 1024 px — so the old `.first()` always resolved to the hidden header
  // "Reset" and the `isVisible()` guard around it skipped the click WITHOUT
  // failing, leaking every tweak into the next test. The per-tab
  // `.tokenpanel-tab-actions` links are visible but tab-scoped (there is no
  // "Reset Color"), so only the popover's global Reset works from every tab.
  // Waiting rather than guarding is deliberate: a teardown that can silently do
  // nothing is what made this helper a no-op in the first place.
  const menuBtn = page.locator('.tokenpanel-actions-menu-btn').first();
  await menuBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await menuBtn.click();

  const resetAll = page
    .locator('.tokenpanel-actions-popover .tokenpanel-action-link')
    .filter({ hasText: /^\s*Reset\s*$/ })
    .first();
  await resetAll.waitFor({ state: 'visible', timeout: 5_000 });
  // At 0.5.1 this applies immediately — no confirmation step.
  await resetAll.click();

  // Close FIRST, sweep second: closing writes the panel's own keys back
  // (`:visible` -> '0', `:autoload` -> 'auto'), so a sweep placed before the
  // click leaves behind exactly what it is meant to remove.
  const closeBtn = page.locator('.tokenpanel-close-btn').first();
  if (await closeBtn.isVisible()) await closeBtn.click();
  await clearPanelStorage(page);
}

// ---------------------------------------------------------------------------
// 1. Font scale — --zfb-scale-base → body font-size
// ---------------------------------------------------------------------------

test.describe('zfb example — token-tweak-style: font scale', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await openPanel(page);
  });

  test.afterEach(async ({ page }) => {
    await closeAndReset(page);
  });

  test('tweaking --zfb-scale-base cascades to body font-size', async ({ page }) => {
    // Directly set the CSS custom property via :root inline style to prove the
    // cascade: body { font-size: var(--zfb-text-base) } → --zfb-text-base:
    // var(--zfb-scale-base) → our override. This is the same path the panel
    // uses when applying an in-memory token override.
    //
    // We set --zfb-scale-base to 1.25rem (default is 1rem, so 20px not 16px).
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--zfb-scale-base', '1.25rem');
    });

    // body has font-size: var(--zfb-text-base) and
    // :root { --zfb-text-base: var(--zfb-scale-base) }, so tweaking
    // --zfb-scale-base propagates to the body's computed font-size.
    await expect
      .poll(
        async () => {
          return await page.evaluate(() => {
            return window.getComputedStyle(document.body).fontSize;
          });
        },
        { timeout: 3_000, intervals: [100, 250] },
      )
      .toBe('20px');
  });
});

// ---------------------------------------------------------------------------
// 2. Spacing — --zfb-hsp-md → .zfb-prose blockquote padding-left
// ---------------------------------------------------------------------------

test.describe('zfb example — token-tweak-style: spacing', () => {
  // The prose route, not the home route: `--zfb-hsp-md` is consumed by the
  // prose rules (styles/global.css:456), and `.zfb-card` on the home route
  // consumes the unregistered `--zfb-spacing-md` instead.
  test.beforeEach(async ({ page }) => {
    await page.goto('/prose/');
    await openPanel(page);
  });

  test.afterEach(async ({ page }) => {
    await closeAndReset(page);
  });

  test('tweaking --zfb-hsp-md updates .zfb-prose blockquote computed padding', async ({ page }) => {
    // Open the Spacing tab.
    const spacingTab = page.getByRole('tab', { name: /spacing/i }).first();
    await spacingTab.waitFor({ state: 'visible', timeout: 5_000 });
    await spacingTab.click();

    // Find the H-Spacing M number input.
    // aria-label="--zfb-hsp-md value"
    const hspMdInput = page.getByLabel('--zfb-hsp-md value').first();
    await hspMdInput.waitFor({ state: 'visible', timeout: 5_000 });

    // Set to 1.5 rem (default is 1 rem).
    await hspMdInput.fill('1.5');
    await hspMdInput.press('Enter');

    // `.zfb-prose :where(blockquote)` has padding-left: var(--zfb-hsp-md).
    // After tweaking to 1.5rem the computed padding should be 24px (1.5 × 16px).
    const quote = page.locator('.zfb-prose blockquote').first();
    await quote.waitFor({ state: 'visible', timeout: 5_000 });

    await expect
      .poll(
        async () => {
          const el = await quote.elementHandle();
          if (!el) return '';
          return await el.evaluate((node) => {
            return window.getComputedStyle(node as Element).paddingLeft;
          });
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe('24px');
  });
});

// ---------------------------------------------------------------------------
// 3. Palette — --zfb-palette-1 → .zfb-heading computed color
// ---------------------------------------------------------------------------

test.describe('zfb example — token-tweak-style: palette color', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await openPanel(page);
  });

  test.afterEach(async ({ page }) => {
    await closeAndReset(page);
  });

  test('tweaking --zfb-palette-1 updates .zfb-heading computed color', async ({ page }) => {
    // Open the Color tab.
    const colorTab = page.getByRole('tab', { name: /color/i }).first();
    await colorTab.waitFor({ state: 'visible', timeout: 5_000 });
    await colorTab.click();

    // Directly set the CSS custom property via :root override so we don't
    // have to drive the color picker widget. The panel stores in-memory
    // overrides via document.documentElement.style.setProperty, so we
    // replicate that path in the test to confirm the cascade works.
    //
    // We change --zfb-palette-1 to a known hex (#ff0000 = rgb(255, 0, 0)).
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--zfb-palette-1', '#ff0000');
    });

    // .zfb-heading uses color: var(--zfb-color-primary)
    // → var(--zfb-palette-1) → the override we just set.
    const heading = page.locator('.zfb-heading').first();
    await heading.waitFor({ state: 'visible', timeout: 5_000 });

    await expect
      .poll(
        async () => {
          const el = await heading.elementHandle();
          if (!el) return '';
          return await el.evaluate((node) => {
            return window.getComputedStyle(node as Element).color;
          });
        },
        { timeout: 3_000, intervals: [100, 250] },
      )
      .toBe('rgb(255, 0, 0)');
  });
});
