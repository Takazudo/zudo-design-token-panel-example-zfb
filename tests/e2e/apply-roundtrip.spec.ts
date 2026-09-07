/**
 * Apply-pipeline round-trip spec for the zfb example.
 *
 * What this actually drives: the spec POSTs directly to the `zdtp-server`
 * sidecar's HTTP API and asserts that `styles/global.css` on disk was
 * rewritten. It does NOT drive the panel's Apply button. It cannot: the panel's
 * `/api/dev/apply` endpoint is registered by the `dev-apply-proxy` plugin's
 * devMiddleware hook, which only exists under `zfb dev`, and this harness runs
 * against `zfb preview` (see playwright.config.ts). The sidecar is the write
 * path the panel delegates to in either case, so testing it directly covers the
 * file-rewrite contract; only the click that triggers it is out of reach.
 *
 * A second, browser-side section then confirms the panel bootstraps and exposes
 * the target token's control in preview mode.
 *
 * Prerequisites
 * -------------
 *  - The preview server and the sidecar, both started by
 *    `playwright.config.ts`'s webServer (`node scripts/launch.mjs
 *    test-servers`). `beforeAll` fails fast with an explicit message if the
 *    sidecar is not reachable — for instance when `BASE_URL` was passed and the
 *    caller owns the server lifecycle but started only the site.
 *  - Ports and the sidecar's allowed CORS origins both come from
 *    `scripts/ports.mjs`, so the `Origin` header this spec sends is by
 *    construction one of the origins the sidecar was started with.
 *
 * Tokens CSS path: styles/global.css (the single file the bin sidecar
 * rewrites; see scaffold.routing.json prefix `zfb` → `styles/global.css`).
 * Storage prefix: zfb-example-tokens (see `panel-storage.ts`)
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BROWSER_ORIGIN, ZDTP_PORT } from '../../scripts/ports.mjs';
import { clearPanelStorage, setPanelVisibleFlag } from './panel-storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// styles/global.css is the source-of-truth for `--zfb-*` token declarations.
// scaffold.routing.json maps prefix `zfb` → `styles/global.css`.
const TOKENS_PATH = resolve(__dirname, '..', '..', 'styles', 'global.css');
const APPLY_URL = `http://127.0.0.1:${ZDTP_PORT}/apply`;
// reason: the sidecar compares this verbatim against its --allow-origin list,
// which scripts/ports.mjs derives from the same BROWSER_ORIGIN.
const ORIGIN = BROWSER_ORIGIN;
// Kept comfortably under Playwright's 30 s local hook timeout so a slow sidecar
// start surfaces as the named error below, never as a bare hook timeout.
const SIDECAR_READY_TIMEOUT_MS = 15_000;

async function readTokenValue(cssVar: string): Promise<string> {
  const css = await readFile(TOKENS_PATH, 'utf-8');
  // reason: escaping `-` in the regex allows matching literal hyphens in CSS var names
  const escaped = cssVar.replace(/-/g, '\\-');
  const re = new RegExp(`${escaped}:\\s*([^;]+);`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`Could not find ${cssVar} in ${TOKENS_PATH}`);
  }
  return m[1].trim();
}

async function postApply(cssVar: string, value: string): Promise<void> {
  const response = await fetch(APPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body: JSON.stringify({ tokens: { [cssVar]: value } }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`POST /apply failed (${response.status}): ${text}`);
  }
}

test.describe('zfb example — apply pipeline round-trip', () => {
  // Use --zfb-radius as the target: it has a single declaration, a clean
  // numeric rem value, and is visually obvious (corners on every card/button).
  const TARGET_VAR = '--zfb-radius';
  const TEST_VALUE = '1.25rem';
  let originalValue = '';

  test.beforeAll(async () => {
    // Fail fast and by name rather than surfacing a bare ECONNREFUSED from the
    // first apply POST: without the sidecar this spec is not "failing", it is
    // un-runnable, and the caller needs to be told which process is missing.
    //
    // Poll rather than probe once: Playwright's webServer waits only on
    // PREVIEW_PORT, and `launch.mjs test-servers` brings the sidecar up in
    // parallel with the preview server. A single-shot probe fires the moment
    // the preview port accepts a connection and would report a still-booting
    // sidecar as a missing one.
    const deadline = Date.now() + SIDECAR_READY_TIMEOUT_MS;
    let reachable = false;
    for (;;) {
      reachable = await fetch(APPLY_URL, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      })
        .then(() => true)
        .catch(() => false);
      if (reachable || Date.now() >= deadline) break;
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!reachable) {
      throw new Error(
        `zdtp-server sidecar is not reachable at ${APPLY_URL}. ` +
          'Playwright starts it via `node scripts/launch.mjs test-servers`; ' +
          'when BASE_URL is set the caller owns that lifecycle and must run ' +
          '`pnpm run _dev:tokens-bin` (matching ZDTP_PORT) alongside the site.',
      );
    }

    originalValue = await readTokenValue(TARGET_VAR);
    if (originalValue === TEST_VALUE) {
      throw new Error(
        `Test value ${TEST_VALUE} matches original — pick a different test value.`,
      );
    }
  });

  test.afterAll(async () => {
    // Restore the original token value via the bin so the working tree lands in
    // a known-good state regardless of how the test exited — and ASSERT it. A
    // swallowed restore failure leaves the repo dirty with a token the next run
    // will silently measure against, so a broken restore has to fail the run.
    if (!originalValue) return;
    await postApply(TARGET_VAR, originalValue);
    expect(await readTokenValue(TARGET_VAR)).toBe(originalValue);
  });

  test('apply pipeline rewrites the on-disk token value and restores idempotently', async ({ page }) => {
    // ── A: direct bin sidecar roundtrip ──────────────────────────────────────
    //
    // Step 1: POST the test value to the bin sidecar.
    await postApply(TARGET_VAR, TEST_VALUE);

    // Step 2: poll the file on disk for the rewritten value.
    await expect
      .poll(
        async () => {
          try {
            return await readTokenValue(TARGET_VAR);
          } catch {
            return '';
          }
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe(TEST_VALUE);

    // Step 3: restore the original value and verify idempotent re-run.
    await postApply(TARGET_VAR, originalValue);
    await expect
      .poll(
        async () => {
          try {
            return await readTokenValue(TARGET_VAR);
          } catch {
            return '';
          }
        },
        { timeout: 5_000, intervals: [100, 250, 500] },
      )
      .toBe(originalValue);

    // ── B: in-memory override visible in the panel (preview-mode path) ───────
    //
    // The preview server serves the built dist, so live in-memory overrides
    // via :root CSS custom properties still work (the panel module is a client-
    // side Preact island). We open the panel and verify the Size tab is present,
    // confirming the panel bootstrapped correctly.
    //
    // This does NOT re-test file-system writes — that is A above. It confirms
    // the panel UI is reachable in preview mode.

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await setPanelVisibleFlag(page);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Panel shell must appear (island hydrated correctly in preview mode).
    await page.locator('.tokenpanel-shell').waitFor({ state: 'visible', timeout: 10_000 });

    // Size tab must be reachable.
    const sizeTab = page.getByRole('tab', { name: /size/i });
    await sizeTab.waitFor({ state: 'visible', timeout: 5_000 });
    await sizeTab.click();

    // The --zfb-radius slider input must be present in the Size tab.
    const radiusInput = page.getByLabel('--zfb-radius value').first();
    await expect(radiusInput).toBeVisible({ timeout: 5_000 });

    // Sweep every panel-owned key so a later spec starts from a clean panel.
    await clearPanelStorage(page);
  });
});
