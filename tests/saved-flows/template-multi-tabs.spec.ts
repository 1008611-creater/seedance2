import { test, expect } from '@playwright/test';
import { appendCsvRow } from '../helpers/local-automation';

test('template: multiple tabs', async ({ page }) => {
  const pageA = page;
  await pageA.goto('https://example.com/');
  await expect(pageA).toHaveURL(/example\.com/);

  const pageB = await page.context().newPage();
  await pageB.goto('https://example.org/');
  await expect(pageB).toHaveURL(/example\.org/);

  const valueFromA = await pageA.title();

  await pageB.bringToFront();
  const valueFromB = await pageB.title();

  await appendCsvRow('output/multi-url/multi-tabs.csv', [new Date().toISOString(), valueFromA, valueFromB], {
    header: ['savedAt', 'valueFromA', 'valueFromB'],
  });
});
