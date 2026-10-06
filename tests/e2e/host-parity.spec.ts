import { test, expect } from '@playwright/test';

test('cold panel button loads one widget and preserves the static easing demo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).zfb?.toggleDesignPanel === 'function');
  await page.locator('#zfb-panel-open').click();
  await expect(page.locator('.tokenpanel-shell')).toBeVisible();
  await expect(page.locator('.tokenpanel-shell')).toHaveCount(1);
  await page.locator('.tokenpanel-close-btn').first().click();
  await page.locator('.zfb-easing-card').click();
  await expect(page.locator('.zfb-easing-card')).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/components/forms/');
  await page.goBack();
  await page.waitForFunction(() => typeof (window as any).zfb?.toggleDesignPanel === 'function');
  await page.locator('#zfb-panel-open').click();
  await expect(page.locator('.tokenpanel-shell')).toBeVisible();
  await expect(page.locator('.tokenpanel-shell')).toHaveCount(1);
});

test('modal releases inert state and preserves baseline focus through repeated closes', async ({ page }) => {
  await page.goto('/components/widgets/');
  const trigger = page.getByRole('button', { name: 'Open Modal', exact: true });
  const dialog = page.locator('dialog');
  for (const close of ['escape', 'button', 'cancel']) {
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(page.locator('main')).toHaveJSProperty('inert', true);
    if (close === 'escape') await page.keyboard.press('Escape');
    else if (close === 'button') await page.getByRole('button', { name: 'Close modal' }).click();
    else await dialog.dispatchEvent('cancel');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('main')).toHaveJSProperty('inert', false);
    // The v2 demo closes while main is inert and leaves focus on body.
    await expect(page.locator('body')).toBeFocused();
  }
});

test('tabs synchronize keyboard focus, selection, panels and indicator', async ({ page }) => {
  await page.goto('/components/widgets/');
  const tabs = page.locator('.zfb-tabs [role=tab]');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(0).focus();
  for (const [key, index] of [['ArrowRight', 1], ['End', 2], ['Home', 0], ['ArrowLeft', 2]] as const) {
    await page.keyboard.press(key);
    await expect(tabs.nth(index)).toBeFocused();
    await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(index)).toHaveAttribute('tabindex', '0');
    const panelId = await tabs.nth(index).getAttribute('aria-controls');
    await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
    await expect(page.locator('.zfb-tabs [role=tabpanel]:visible')).toHaveCount(1);
    await expect(page.locator('.zfb-tabs__indicator')).toHaveAttribute('style', new RegExp(`translateX\\(${index * 100}%\\)`));
  }
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('native form controls retain the initial range value and editable state', async ({ page }) => {
  await page.goto('/components/forms/');
  const range = page.locator('input[type=range]');
  await expect(range).toHaveValue('60');
  const text = page.locator('input[type=text]').first();
  await text.fill('Parity check');
  await expect(text).toHaveValue('Parity check');
  const checkbox = page.locator('input[type=checkbox]').first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});

test('closed panel restores a saved override without reopening', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).zfb?.toggleDesignPanel === 'function');
  await page.locator('#zfb-panel-open').click();
  await page.getByRole('tab', { name: /size/i }).click();
  const input = page.getByLabel('--zfb-radius value').first();
  await input.fill('1.25');
  await input.press('Tab');
  const radius = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--zfb-radius').trim());
  await expect.poll(radius).toBe('1.25rem');
  await page.locator('.tokenpanel-close-btn').first().click();
  await page.reload();
  await expect.poll(radius).toBe('1.25rem');
  await expect(page.locator('.tokenpanel-shell')).not.toBeVisible();
});
