/**
 * Playwright config for the zfb example's e2e specs.
 *
 * webServer builds, then serves the built output with `zfb preview`, and
 * starts the `zdtp-server` sidecar alongside it — the apply-roundtrip spec
 * POSTs to that sidecar, so without it a bare `pnpm test:e2e` could never pass.
 * Both come up through `scripts/launch.mjs`, which is also what `pnpm dev` and
 * `pnpm preview` use, so the ports and the sidecar's allowed CORS origins are
 * resolved exactly once (`scripts/ports.mjs`) and cannot drift from this config.
 *
 * Why preview rather than `zfb dev`: historically `zfb dev` did not inject the
 * `<script type="module" src="/assets/islands.js">` tag, so the Preact island
 * holding PanelMount never hydrated and `window.zfb` stayed undefined
 * (Takazudo/zudo-front-builder#377, closed by-design). That is fixed as of zfb
 * 2.15.1 — the tag is injected and the asset serves — but the fix was confirmed
 * at the HTTP level only, not by a full browser hydration run, so the harness
 * stays on the build+preview path it is known-good on. Moving to `zfb dev`
 * would additionally make the `/api/dev/apply` devMiddleware reachable and
 * allow a UI-driven Apply spec; that rewrite is deliberately out of scope here.
 *
 * `reuseExistingServer: false` even locally: preview serves a *built* `dist/`,
 * so reusing a server someone left running would silently test a stale build.
 * Failing on EADDRINUSE is the louder, more honest outcome. To test against a
 * server you are already running, pass `BASE_URL` — that hands the whole server
 * lifecycle back to the caller. See README.md.
 */

import { defineConfig, devices } from '@playwright/test';
// The three ports resolve in exactly one place so package.json's launcher,
// plugins/dev-apply-proxy.mjs, the specs and this config cannot disagree.
import { PREVIEW_PORT, BROWSER_ORIGIN } from './scripts/ports.mjs';

const hasExternalBaseUrl = Boolean(process.env.BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  maxFailures: 0,
  timeout: process.env.CI ? 60 * 1000 : 30 * 1000,
  use: {
    baseURL: BROWSER_ORIGIN,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer:
    process.env.CI || hasExternalBaseUrl
      ? undefined
      : {
          // Build first so the islands script tag is injected, then serve the
          // built output and the apply sidecar together.
          command: 'pnpm run build && node scripts/launch.mjs test-servers',
          port: PREVIEW_PORT,
          reuseExistingServer: false,
          // Build can take ~30–60 s in CI.
          timeout: 180_000,
        },
});
