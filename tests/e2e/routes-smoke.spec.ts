/**
 * Every prerendered route loads, hydrates the panel island, and opens the
 * panel with zero console errors, page errors or failed requests (enforced by
 * the `diagnostics` fixture in ./support).
 */

import { ROUTES, closeViaHeader, expectRoute, expectSinglePanelInstance, openViaHeader, test } from './support';

for (const { label, path } of ROUTES) {
  test(`${label} (${path}) renders and opens the panel without errors`, async ({ page }) => {
    await page.goto(path);
    await expectRoute(page, label);
    await openViaHeader(page);
    await expectSinglePanelInstance(page, 1);
    await closeViaHeader(page);
  });
}
