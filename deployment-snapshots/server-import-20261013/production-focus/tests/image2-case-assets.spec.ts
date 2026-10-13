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

  await expect(page.getByRole('heading', { name: /从爆款图到可复刻提示词/ })).toBeVisible({ timeout: 15_000 });
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

  await page.getByRole('button', { name: '保存命名版本' }).click();
  await expect(page.locator('.case-recent-list')).toContainText('保存变体');

  await page.reload();
  await expect(page.locator('.case-gallery-head h2')).toContainText(collectionName);
  await expect(page.getByLabel('案例备注')).toHaveValue(note);

  const apiResponse = await page.request.get(`${baseUrl}/api/image2/assets`);
  const apiStatus = apiResponse.status();
  if (apiStatus === 200) {
    // Local JSON store mode has no cloud credentials, so anonymous reads resolve to an empty local snapshot.
    const payload = (await apiResponse.json()) as { storageMode?: string };
    expect(payload.storageMode).toBe('local-json-store');
  } else if (apiStatus === 503) {
    // Production runtime without IMAGE2_ASSET_SYNC_BACKEND=supabase: the route refuses to serve the
    // file-backed store instead of exposing a shared snapshot, so 503 is the documented state.
    const payload = (await apiResponse.json()) as { error?: string };
    expect(payload.error ?? '').toContain('未配置');
  } else {
    // Supabase asset backend: anonymous reads must be rejected instead of leaking another user's snapshot.
    expect(apiStatus).toBe(401);
  }

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

test('rewrite preserves full original constraints, restores variants and hands off reference requirements', async ({ page, context }) => {
  test.setTimeout(60000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/image2/proxy?**', route => route.abort());
  await page.goto(`${baseUrl}/image2-cases?case=youmind-102-da467cab`);
  const editor = page.getByLabel('完整提示词自由编辑');
  await expect(editor).toHaveValue(/exactly 2 visible nail areas/, { timeout: 15000 });
  const original = await editor.inputValue();
  await page.getByRole('button', { name: '复制完整稿', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(original.trim());
  await page.getByLabel('nail design变量', { exact: true }).fill('plain natural manicure');
  const expected = original.replace(/\{argument name="nail design" default="[^"]*"\}/, 'plain natural manicure');
  await page.getByText(/完整执行稿 ·/).click();
  await expect(page.getByRole('region', { name: '保真提示词编辑器' }).locator('pre').first()).toHaveText(expected);
  await page.getByRole('button', { name: '保存命名版本', exact: true }).click();
  const second = expected + '\nKeep product geometry unchanged.';
  await editor.fill(second);
  await page.getByRole('button', { name: '保存命名版本', exact: true }).click();
  await page.reload();
  await expect(editor).toHaveValue(second);
  await page.getByRole('tab', { name: /命名版本/ }).click();
  await expect(page.getByRole('button', { name: '恢复版本', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '恢复版本', exact: true }).nth(1).click();
  // Restore both the editable template and its variable values; execution stays fully substituted.
  await expect(editor).toHaveValue(original);
  await expect(page.getByLabel('nail design变量', { exact: true })).toHaveValue('plain natural manicure');
  await page.getByText(/完整执行稿 ·/).click();
  await expect(page.getByRole('region', { name: '保真提示词编辑器' }).locator('pre').first()).toHaveText(expected);
  await page.getByRole('button', { name: '复制完整稿', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(expected.trim());
  await page.getByRole('button', { name: '带入工作台 →', exact: true }).click();
  await expect(page).toHaveURL(/\/workbench\?from=case/);
  await expect(page.getByLabel('案例完整提示词')).toHaveValue(expected, { timeout: 20000 });
  await expect(page.getByRole('region', { name: '从案例带入的提示词' })).toContainText('上游缺少输入图');
  // Handoff activates the complete case prompt immediately.
  await expect(page.getByRole('button', { name: '恢复穿搭模板', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const returned = expected + '\nPreserve this complete plan on return.';
  await page.getByLabel('案例完整提示词').fill(returned);
  await page.getByLabel('工作台方案备注').fill('Return note');
  await page.getByRole('link', { name: '返回案例', exact: true }).click();
  await expect(editor).toHaveValue(returned);
  await expect(page.getByLabel('提示词工作台备注')).toHaveValue('Return note');
  await page.reload();
  await expect(editor).toHaveValue(returned);
});

test('account switch isolates local drafts and notes and restores the prior account', async ({ page }) => {
  await page.route('**/api/image2/proxy?**', route => route.abort());
  await page.route('**/api/image2/assets', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试不访问云端' }) }));
  await page.goto(`${baseUrl}/image2-cases`);
  await expect(page.getByLabel('完整提示词自由编辑')).toHaveValue(/./, { timeout: 15000 });
  const switchAccount = async (id: string | null) => {
    await page.evaluate(({ key, id }) => {
      const session = id ? { accessToken: 'mock-' + id, user: { id } } : null;
      if (session) localStorage.setItem(key, JSON.stringify(session)); else localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: session ? JSON.stringify(session) : null }));
    }, { key: accountSessionStorageKey, id });
  };
  await switchAccount('test-A');
  await page.getByLabel('案例备注').fill('A private note');
  await page.getByRole('button', { name: '保存备注', exact: true }).click();
  await page.getByLabel('完整提示词自由编辑').fill('A private variant');
  await page.getByRole('button', { name: '保存命名版本', exact: true }).click();
  await switchAccount('test-B');
  await expect(page.getByLabel('案例备注')).toHaveValue('');
  await expect(page.getByLabel('完整提示词自由编辑')).not.toHaveValue('A private variant');
  await page.getByLabel('案例备注').fill('B private note');
  await page.getByRole('button', { name: '保存备注', exact: true }).click();
  await switchAccount('test-A');
  await expect(page.getByLabel('案例备注')).toHaveValue('A private note');
  await expect(page.getByLabel('完整提示词自由编辑')).toHaveValue('A private variant');
  await switchAccount(null);
  await expect(page.getByLabel('案例备注')).toHaveValue('');
  expect(await page.evaluate(({ key }) => {
    const a=localStorage.getItem(key + ':account:test-A'); const b=localStorage.getItem(key + ':account:test-B');
    return Boolean(a?.includes('A private note') && !a.includes('B private note') && b?.includes('B private note') && !b.includes('A private note'));
  }, { key: assetStorageKey })).toBe(true);
});
