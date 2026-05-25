import { expect, test } from '@playwright/test';

const assetStorageKey = 'image2-case-assets:v1';
const assetUserStorageKey = 'image2-asset-user-id:v1';
const favoriteStorageKey = 'image2-case-favorites:v1';
const promptWorkbenchStorageKey = 'image2-prompt-workbench:v1';
const reuseStorageKey = 'image2-prompt-reuse-history:v1';
const accountSessionStorageKey = 'image2-account-session:v1';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3012';

test('image2 cases can save and sync local asset snapshots', async ({ page }) => {
  const testUserId = `pw-image2-assets-${Date.now()}`;
  await page.goto(`${baseUrl}/image2-cases`);
  await page.evaluate(
    ([assetKey, assetUserKey, favoriteKey, promptKey, reuseKey, accountKey, userId]) => {
      window.localStorage.removeItem(assetKey);
      window.localStorage.removeItem(favoriteKey);
      window.localStorage.removeItem(promptKey);
      window.localStorage.removeItem(reuseKey);
      window.localStorage.removeItem(accountKey);
      window.localStorage.setItem(assetUserKey, userId);
    },
    [
      assetStorageKey,
      assetUserStorageKey,
      favoriteStorageKey,
      promptWorkbenchStorageKey,
      reuseStorageKey,
      accountSessionStorageKey,
      testUserId
    ]
  );
  await page.reload();

  await expect(page.getByRole('heading', { name: /从爆款图到可复刻提示词/ })).toBeVisible();
  await expect(page.locator('.case-card-shell').first()).toBeVisible();

  const collectionName = `测试收藏夹 ${Date.now()}`;
  await page.getByRole('button', { name: '管理收藏夹' }).click();
  await page.getByLabel('新建收藏夹名称').fill(collectionName);
  await page.getByTitle('新建收藏夹').click();
  await page.getByRole('button', { name: '关闭收藏夹选择器' }).last().click();

  await expect(page.locator('.case-gallery-head h2')).toContainText(collectionName);
  await expect(page.locator('.case-asset-collection-list button.active').filter({ hasText: collectionName })).toBeVisible();

  const note = `本地备注验证 ${Date.now()}`;
  await page.getByLabel('案例备注').fill(note);
  await page.getByRole('button', { name: '保存备注' }).click();
  await expect(page.locator('.case-asset-note-meta')).toContainText('已保存');

  await page.getByRole('button', { name: '保存变体' }).click();
  await expect(page.locator('.case-recent-list')).toContainText('保存变体');

  await page.reload();
  await expect(page.locator('.case-gallery-head h2')).toContainText(collectionName);
  await expect(page.getByLabel('案例备注')).toHaveValue(note);

  const apiResponse = await page.request.get(`${baseUrl}/api/image2/assets`);
  expect(apiResponse.status()).toBe(401);

  await page.evaluate(
    ([assetKey, favoriteKey, promptKey, reuseKey]) => {
      window.localStorage.removeItem(assetKey);
      window.localStorage.removeItem(favoriteKey);
      window.localStorage.removeItem(promptKey);
      window.localStorage.removeItem(reuseKey);
    },
    [assetStorageKey, favoriteStorageKey, promptWorkbenchStorageKey, reuseStorageKey]
  );
  await page.reload();
  await expect(page.locator('.case-gallery-head h2')).not.toContainText(collectionName);
});
