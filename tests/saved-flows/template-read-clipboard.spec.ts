import { test, expect } from '@playwright/test';
import { appendCsvRow, readClipboardText } from '../helpers/local-automation';

test('template: read clipboard to csv', async ({ page }) => {
  await page.goto('https://example.com/');
  await expect(page).toHaveURL(/example\.com/);

  const clipboardText = await readClipboardText();
  await appendCsvRow('output/clipboard/clipboard-captures.csv', [new Date().toISOString(), page.url(), clipboardText], {
    header: ['savedAt', 'url', 'clipboardText'],
  });
});
