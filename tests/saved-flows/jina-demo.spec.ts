import { test, expect } from '@playwright/test';
import { appendCsvRow } from '../helpers/local-automation';

test('test', async ({ page }) => {
  await page.goto('https://jina.ai/');
  await page.getByRole('button', { name: /拒绝|拒否|Reject|Deny|Decline/i }).click({ timeout: 3000 }).catch(() => {});

  const apiKeyInput = page.getByRole('textbox', { name: /API\s*(Key|キー|密钥|密鑰)/i }).first();
  await expect(apiKeyInput).toBeVisible({ timeout: 15000 });
  await expect(apiKeyInput).toHaveValue(/^jina_/, { timeout: 15000 });

  const apiKeyControl = apiKeyInput.locator('xpath=ancestor::div[contains(@class,"q-field__control")]');
  const copyButton = apiKeyControl.locator('button').first();
  await expect(copyButton).toBeVisible({ timeout: 15000 });
  await copyButton.click();

  const apiKey = await apiKeyInput.inputValue();
  await appendCsvRow('output/keys/jina-api-keys.csv', [new Date().toISOString(), process.env.BITBROWSER_PROFILE || '', page.url(), apiKey], {
    header: ['savedAt', 'bitbrowserProfile', 'url', 'apiKey'],
    dedupeValue: apiKey,
  });
});
