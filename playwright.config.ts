/**
 * Playwright config for the zfb example's e2e specs.
 *
 * webServer MUST use `zfb preview`, NOT `zfb dev`.
 *
 * Reason: `zfb dev` does NOT inject the `<script type="module"
 * src="/assets/islands-*.js">` tag, so the Preact island containing
 * PanelMount never hydrates and `window.zfb` stays undefined indefinitely.
 * Confirmed by Wave 2 manual probe; tracked upstream as
 * Takazudo/zudo-front-builder#377 (CLOSED — by-design).
 *
 * Any Playwright spec that loads a `zfb dev` URL and waits for
 * `window.zfb` will hang and time out. We build first then preview.
 *
 * Local runs: webServer auto-starts build + preview.
 * CI / external BASE_URL: the caller manages the server lifecycle.
 */

import { defineConfig, devices } from '@playwright/test';

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
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
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
          // Build first so islands script tag is injected, then preview.
          // The bin sidecar for apply-roundtrip is started separately
          // (pnpm run _dev:tokens-bin) before running these specs.
          command: 'pnpm run build && pnpm exec zfb preview --port 4173',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
          // Build can take ~30–60 s in CI.
          timeout: 180_000,
        },
});
