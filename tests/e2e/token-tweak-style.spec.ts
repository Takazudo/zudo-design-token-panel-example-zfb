/**
 * "Change a token in the panel → a visible element's computed style updates."
 *
 * One representative consumer per token category, each edited through the
 * panel UI (no direct `:root` writes):
 *   - font scale  `--zfb-scale-base` → `body` font-size on /
 *                 (via `--zfb-text-base: var(--zfb-scale-base)`)
 *   - spacing     `--zfb-hsp-md`     → `.zfb-prose blockquote` padding-left on
 *                 /prose/ (`--zfb-spacing-*`, used by `.zfb-card`, is not
 *                 registered in config/default-manifest.ts, so the panel has
 *                 no control for it)
 *   - color       `--zfb-palette-1`  → `.zfb-heading` color on /
 *                 (via `--zfb-color-primary: var(--zfb-palette-1)`)
 *
 * Each test gets a fresh browser context, so no panel state leaks between
 * tests; nothing here touches the apply sidecar or the file on disk.
 */

import { expect, openViaHeader, panelShell, setLengthToken, test } from './support';

test('font scale: --zfb-scale-base resizes the body text', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const body = page.locator('body');
  await expect(body).toHaveCSS('font-size', '16px');

  await setLengthToken(page, /^font$/i, '--zfb-scale-base', '1.25');

  await expect(body).toHaveCSS('font-size', '20px');
});

test('spacing: --zfb-hsp-md changes the prose blockquote padding', async ({ page }) => {
  await page.goto('/prose/');
  await openViaHeader(page);
  const quote = page.locator('.zfb-prose blockquote').first();
  await expect(quote).toBeVisible();
  await expect(quote).toHaveCSS('padding-left', '16px');

  await setLengthToken(page, /^spacing$/i, '--zfb-hsp-md', '1.5');

  await expect(quote).toHaveCSS('padding-left', '24px');
});

test('color: --zfb-palette-1 repaints the headings', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const heading = page.locator('.zfb-heading').first();
  await expect(heading).toHaveCSS('color', 'rgb(45, 108, 223)');

  const shell = panelShell(page);
  await shell.getByRole('tab', { name: /^color$/i }).click();
  await shell.locator('[aria-label^="--zfb-palette-1:"]').click();
  const hexInput = page.locator('.tokenpanel-color-picker-hex-input');
  await hexInput.fill('#ff0000');
  await hexInput.press('Enter');

  await expect(heading).toHaveCSS('color', 'rgb(255, 0, 0)');
});
