import { test, expect } from '@playwright/test';
import { appendCsvRow } from '../helpers/local-automation';

test('template: same tab multi url', async ({ page }) => {
  await page.goto('https://example.com/');
  await expect(page).toHaveURL(/example\.com/);
  const firstTitle = await page.title();

  await page.goto('https://example.org/');
  await expect(page).toHaveURL(/example\.org/);
  const secondTitle = await page.title();

  await appendCsvRow('output/multi-url/same-tab.csv', [new Date().toISOString(), firstTitle, secondTitle], {
    header: ['savedAt', 'firstTitle', 'secondTitle'],
  });
});
