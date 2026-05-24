import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://tempmail.lol/zh/');
  await page.getByText('复制').click();
  await page.goto('https://tempmail.lol/zh/');
});