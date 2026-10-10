/**
 * Navigation + panel ownership/lifecycle on the plain ZFB host.
 *
 * This host is a multi-page site BY DESIGN: the six routes are prerendered
 * HTML, the sidenav is plain `<a href>`, and the layout does not mount zfb's
 * opt-in `<ClientRouter />` — so every sidenav click and every back/forward is
 * a full document load (no client-side swap exists to prove). The specs show
 * that explicitly: a `window.__marker` set before navigating is gone after it.
 * What must survive is the panel's persisted state, so that is what is tested
 * across navigation, history traversal and reload.
 *
 * Lifecycle: the panel is opened/closed only through the host's topbar
 * trigger, and after every navigation and toggle the page holds exactly one
 * owned panel instance (one root, one set of document-level mounts, one
 * stylesheet).
 */

import type { Page } from '@playwright/test';
import {
  ROUTES,
  closeViaHeader,
  expect,
  expectRoute,
  expectSinglePanelInstance,
  navigateViaSidenav,
  openViaHeader,
  panelShell,
  setLengthToken,
  test,
  toggleViaHeader,
} from './support';

type MarkedWindow = Window & { __marker?: number };

async function setMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as MarkedWindow).__marker = 1;
  });
}

async function expectNewDocument(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as MarkedWindow).__marker)).toBeUndefined();
}

// Home first, then every other route and back to Home: the visit order the
// open/close test walks once per round (so it also ends each round on Home).
const HISTORY = [...ROUTES.map(({ label }) => label), 'Home'] as const;

const activeLink = (page: Page) => page.locator('.zfb-sidenav__link.is-active');

test('sidenav navigation and back/forward are full loads that restore one open panel', async ({
  page,
}) => {
  await page.goto('/');
  await openViaHeader(page);

  for (const { label } of ROUTES.slice(1)) {
    await setMarker(page);
    await navigateViaSidenav(page, label);
    await expectNewDocument(page);
    await expect(panelShell(page)).toBeVisible();
    await expectSinglePanelInstance(page, 1);
  }

  await setMarker(page);
  await page.goBack();
  await expectRoute(page, 'Widgets');
  await expectNewDocument(page);
  await expectSinglePanelInstance(page, 1);

  await page.goBack();
  await expectRoute(page, 'Status');
  await expectSinglePanelInstance(page, 1);

  await setMarker(page);
  await page.goForward();
  await expectRoute(page, 'Widgets');
  await expectNewDocument(page);
  await expectSinglePanelInstance(page, 1);
  await expect(panelShell(page)).toBeVisible();
});

test('repeated open/close across all six routes never duplicates the panel', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);

  for (let round = 0; round < 2; round += 1) {
    for (const label of HISTORY.slice(1)) {
      await navigateViaSidenav(page, label);
      await expectSinglePanelInstance(page, 1);
      await closeViaHeader(page);
      await expectSinglePanelInstance(page, 0);
      await openViaHeader(page);
      await expectSinglePanelInstance(page, 1);
    }
  }

  // History traversal over the same stack keeps the single owned instance.
  for (let step = 0; step < 3; step += 1) {
    await page.goBack();
    await expectRoute(page, HISTORY[HISTORY.length - 2 - step]);
    await expectSinglePanelInstance(page, 1);
  }
  for (let step = 0; step < 3; step += 1) {
    await page.goForward();
    await expectRoute(page, HISTORY[HISTORY.length - 3 + step]);
    await expectSinglePanelInstance(page, 1);
  }
});

test('panel visibility persists across navigation, history and reload', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);

  await page.reload();
  await expectRoute(page, 'Home');
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);

  await closeViaHeader(page);
  await navigateViaSidenav(page, 'Forms');
  await expect(panelShell(page)).toHaveCount(0);

  await page.reload();
  await expectRoute(page, 'Forms');
  await expect(panelShell(page)).toHaveCount(0);

  await page.goBack();
  await expectRoute(page, 'Home');
  await expect(panelShell(page)).toHaveCount(0);

  await toggleViaHeader(page);
  await expect(panelShell(page)).toBeVisible();
  await page.goForward();
  await expectRoute(page, 'Forms');
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);
});

test('a token edit persists across navigation, history and reload', async ({ page }) => {
  await page.goto('/');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '8px');
  await openViaHeader(page);

  await setLengthToken(page, /^size$/i, '--zfb-radius', '1.25');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');

  await navigateViaSidenav(page, 'Data');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');

  await closeViaHeader(page);
  await navigateViaSidenav(page, 'Prose');
  // Restored from storage with the panel closed.
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');
  await expect(panelShell(page)).toHaveCount(0);

  await page.goBack();
  await expectRoute(page, 'Data');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');

  await page.reload();
  await expectRoute(page, 'Data');
  await expect(activeLink(page)).toHaveCSS('border-top-left-radius', '20px');
  await expectSinglePanelInstance(page, 0);
});
