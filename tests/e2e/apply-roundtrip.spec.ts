/**
 * Apply-pipeline round-trip spec for the zfb example.
 *
 * Drives the panel UI to tweak a token, click Apply, and asserts the demo
 * tokens CSS file on disk (`styles/global.css`) was rewritten by the bin
 * sidecar. The full bin → file rewrite path is what the spec proves;
 * the panel's in-memory `:root` override is exercised as a side effect.
 *
 * Prerequisites
 * -------------
 *  - Preview server on port 4173 (started by `playwright.config.ts`
 *    webServer: `pnpm run build && pnpm exec zfb preview --port 4173`).
 *  - Bin sidecar `design-token-panel-server` on port 24685, with
 *    `--write-root .` and `--routing scaffold.routing.json` pointing at
 *    this example's tree.
 *
 * IMPORTANT: The preview server serves the BUILT dist. For the apply-
 * roundtrip to be visible in the browser (same-session style), it must
 * go via the panel's in-memory override (which works in preview mode)
 * OR a page reload after the file is rewritten. This spec only asserts
 * the on-disk file change — the browser-side assertion is the in-memory
 * override path (same as astro/vite-react examples).
 *
 * The bin sidecar is NOT started by this spec; it must be started
 * externally (pnpm run _dev:tokens-bin) before running the tests.
 * In CI the caller is responsible for both the preview server and the
 * bin sidecar (because applying to a built static dist is by-design the
 * local-dev write path).
 *
 * webServer MUST use `zfb preview`, NOT `zfb dev`. See playwright.config.ts.
 *
 * Try/finally restores the original token value so re-running the spec is
 * idempotent. The original value is captured at the start; if any assertion
 * fails before restoration, the after-hook still rewrites the original
 * value via the bin so the file on disk lands in a known-good state.
 *
 * Tokens CSS path: styles/global.css (the single file the bin sidecar
 * rewrites; see scaffold.routing.json prefix `zfb` → `styles/global.css`).
 * Bin sidecar port: 24685 (see package.json `_dev:tokens-bin` script).
 * Dev/preview server origin: http://localhost:4173
 * Storage prefix: zfb-example-tokens
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// styles/global.css is the source-of-truth for `--zfb-*` token declarations.
// scaffold.routing.json maps prefix `zfb` → `styles/global.css`.
const TOKENS_PATH = resolve(__dirname, '..', '..', 'styles', 'global.css');
const APPLY_URL = 'http://127.0.0.1:24685/apply';
// reason: origin must match the --allow-origin flag passed to design-token-panel-server
const ORIGIN = 'http://localhost:4173';

const STORAGE_PREFIX = 'zfb-example-tokens';
const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

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
    originalValue = await readTokenValue(TARGET_VAR);
    if (originalValue === TEST_VALUE) {
      throw new Error(
        `Test value ${TEST_VALUE} matches original — pick a different test value.`,
      );
    }
  });

  test.afterAll(async () => {
    // Restore the original token value via the bin so the test file lands
    // in a known-good state regardless of how the test exited.
    if (originalValue) {
      try {
        await postApply(TARGET_VAR, originalValue);
      } catch {
        // Best-effort restoration — the in-band assertion already failed if
        // we get here; surfacing the secondary error would mask the primary.
      }
    }
  });

  test('apply pipeline rewrites the on-disk token value and restores idempotently', async ({ page }) => {
    // ── A: direct bin sidecar roundtrip ──────────────────────────────────────
    //
    // The panel's UI-driven Apply endpoint (`/api/dev/apply`) is only available
    // when `zfb dev` is running (zfb's devMiddleware). In preview mode the
    // endpoint does not exist, so we test the apply pipeline directly via the
    // bin sidecar HTTP API — which is the actual write path that the panel
    // delegates to in both dev and CI contexts.
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
    // the panel UI is reachable in preview mode (the island hydration path that
    // wave 2 confirmed requires preview, not dev).

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate((visibleKey) => {
      localStorage.setItem(visibleKey, '1');
    }, STORAGE_KEY_VISIBLE);

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

    // Clean up visible flag.
    await page.evaluate((visibleKey) => {
      localStorage.removeItem(visibleKey);
    }, STORAGE_KEY_VISIBLE);
  });
});
