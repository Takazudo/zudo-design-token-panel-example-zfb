/**
 * Shared panel-storage helpers for the e2e specs.
 *
 * The panel namespaces every persisted entry under `storagePrefix`
 * (`config/panel-config.ts`). Beyond `:visible` that covers the `-state-*`
 * override records and, since zdtp 0.4.15, the UI preference keys — dock mode,
 * position, size, density, specimen, spawn ordinal. Enumerating by prefix is
 * therefore the only sweep that stays correct as the package adds keys; a
 * hard-coded key list silently stops clearing whatever ships next.
 */

import type { Page } from '@playwright/test';

/** Must match `panelConfig.storagePrefix` in `config/panel-config.ts`. */
export const STORAGE_PREFIX = 'zfb-example-tokens';

/** The one key the specs write themselves to force the panel open. */
export const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

/** Open the panel on the next load by seeding the visible flag. */
export async function setPanelVisibleFlag(page: Page): Promise<void> {
  await page.evaluate((key) => {
    localStorage.setItem(key, '1');
  }, STORAGE_KEY_VISIBLE);
}

/**
 * Remove every localStorage and sessionStorage entry the panel owns, so
 * overrides and UI preferences cannot leak from one test into the next.
 */
export async function clearPanelStorage(page: Page): Promise<void> {
  await page.evaluate((prefix) => {
    for (const store of [window.localStorage, window.sessionStorage]) {
      // Collect first, then remove. Removing during the index walk shifts the
      // remaining keys down by one and skips every other match.
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null && key.startsWith(prefix)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    }
  }, STORAGE_PREFIX);
}
