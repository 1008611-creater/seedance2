import { test, expect } from '@playwright/test';
import { appendCsvRow } from '../helpers/local-automation';

test('template: popup or new window', async ({ page }) => {
  await page.setContent(`
    <a href="https://example.org/" target="_blank">Open target page</a>
  `);

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open target page' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/example\.org/);

  await appendCsvRow('output/multi-url/popup-window.csv', [new Date().toISOString(), await popup.title()], {
    header: ['savedAt', 'popupTitle'],
  });
});
