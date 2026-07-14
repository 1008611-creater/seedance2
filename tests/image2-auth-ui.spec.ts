import { expect, test } from '@playwright/test';

const accountSessionStorageKey = 'image2-account-session:v1';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3012';

test('image2 account panel can request a password recovery email', async ({ page }) => {
  let recoverUrl = '';

  await page.route('**/auth/v1/recover**', async (route) => {
    recoverUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}'
    });
  });

  await page.goto(`${baseUrl}/image2-cases`);
  await page.evaluate((key) => window.localStorage.removeItem(key), accountSessionStorageKey);
  await page.reload();
  await expect(page.getByRole('heading', { name: /从爆款图到可复刻提示词/ })).toBeVisible();

  const authLauncher = page.getByRole('button', { name: /登录 \/ 注册|账号中心/ });
  if (!(await authLauncher.isVisible())) {
    test.skip(true, 'Supabase auth is not configured in this environment.');
  }

  await authLauncher.click();
  await expect(page.locator('.case-auth-modal-panel')).toBeVisible();

  const passwordInput = page.getByLabel('账号密码');
  await expect(passwordInput).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: '显示密码' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'text');

  await page.getByRole('button', { name: '忘记密码' }).click();
  await expect(page.getByRole('button', { name: '发送找回验证码' })).toBeVisible();
  await page.getByLabel('账号邮箱').fill(`reset-${Date.now()}@example.com`);
  await page.getByRole('button', { name: '发送找回验证码' }).click();

  await expect(page.locator('.case-auth-modal-panel')).toContainText('验证码已发送');
  expect(recoverUrl).toContain('/auth/v1/recover');
  expect(decodeURIComponent(recoverUrl)).toContain('/auth/callback?mode=recovery');
});

test('auth callback handles missing and recovery tokens', async ({ page }) => {
  await page.goto(`${baseUrl}/auth/callback?mode=recovery`);
  if (await page.getByText('还没有配置 Supabase').isVisible().catch(() => false)) {
    test.skip(true, 'Supabase auth is not configured in this environment.');
  }
  await expect(page.getByText('邮箱链接缺少登录令牌')).toBeVisible();

  let updatedPassword = '';
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { password?: string };
      updatedPassword = body.password ?? '';
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'auth-ui-user', email: 'auth-ui@example.com' })
    });
  });

  await page.goto(
    `${baseUrl}/auth/callback?mode=recovery&case=token#access_token=fake-token&refresh_token=fake-refresh&expires_in=3600&type=recovery`
  );
  const newPassword = page.getByLabel('新密码', { exact: true });
  const confirmPassword = page.getByLabel('确认新密码');
  await expect(newPassword).toBeVisible();

  await newPassword.fill('123');
  await confirmPassword.fill('123');
  await page.getByRole('button', { name: '更新密码' }).click();
  await expect(page.getByText('新密码至少需要 6 位')).toBeVisible();

  await newPassword.fill('abcdef');
  await confirmPassword.fill('abcdeg');
  await page.getByRole('button', { name: '更新密码' }).click();
  await expect(page.getByText('两次输入的新密码不一致')).toBeVisible();

  await newPassword.fill('abcdef');
  await confirmPassword.fill('abcdef');
  await page.getByRole('button', { name: '更新密码' }).click();
  await expect(page.getByText('密码已更新')).toBeVisible();
  expect(updatedPassword).toBe('abcdef');

  const session = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), accountSessionStorageKey);
  expect(session.user.id).toBe('auth-ui-user');
});

test('image2 account panel can display and redeem balance codes', async ({ page }) => {
  let redeemPayload: { code?: string } = {};

  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'membership-user', email: 'member@example.com' })
    });
  });

  await page.route('**/api/image2/balance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        storageMode: 'supabase-postgres',
        wallet: { balance: 0, lifetimeCredited: 0, lifetimeSpent: 0, updatedAt: new Date().toISOString() },
        recentTransactions: [],
        user: { id: 'membership-user', email: 'member@example.com' }
      })
    });
  });

  await page.route('**/api/image2/redeem', async (route) => {
    redeemPayload = route.request().postDataJSON() as { code?: string };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        redemption: { ok: true, plan: 'image2_credits_10', credits: 10 },
        wallet: {
          storageMode: 'supabase-postgres',
          wallet: { balance: 10, lifetimeCredited: 10, lifetimeSpent: 0, updatedAt: new Date().toISOString() },
          recentTransactions: [],
          user: { id: 'membership-user', email: 'member@example.com' }
        }
      })
    });
  });

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        accessToken: 'membership-token',
        refreshToken: 'membership-refresh',
        user: { id: 'membership-user', email: 'member@example.com' }
      })
    );
  }, accountSessionStorageKey);

  await page.goto(`${baseUrl}/image2-cases`);
  await expect(page.getByRole('heading', { name: /从爆款图到可复刻提示词/ })).toBeVisible();
  await expect(page.locator('.case-membership-panel')).toContainText('图片余额');
  await expect(page.locator('.case-membership-panel')).toContainText('当前余额为 0');

  await page.getByLabel('Image2 卡密').fill('TEST-10-CREDITS');
  await page.locator('.case-membership-form').getByRole('button', { name: '兑换' }).click();

  expect(redeemPayload.code).toBe('TEST-10-CREDITS');
  await expect(page.locator('.case-membership-panel')).toContainText('兑换成功');
  await expect(page.locator('.case-membership-panel')).toContainText('10 张');
});

test('image2 balance APIs require login', async ({ page }) => {
  const balance = await page.request.get(`${baseUrl}/api/image2/balance`);
  expect(balance.status()).toBe(401);

  const redeem = await page.request.post(`${baseUrl}/api/image2/redeem`, {
    data: { code: 'TEST-10-CREDITS' }
  });
  expect(redeem.status()).toBe(401);
  expect((await redeem.json()).error).toContain('兑换卡密');
});

test('admin login reuses a previously saved account session', async ({ page }) => {
  let exchangePayload: Record<string, unknown> = {};

  await page.route('**/api/admin/session/exchange', async (route) => {
    exchangePayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ admin: true, identity: { id: 'owner-id' } })
    });
  });
  await page.route(new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/admin/image2-cases$`), async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Admin test destination</h1>' });
  });
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        accessToken: 'stored-account-access',
        expiresAt: Date.now() + 30 * 60 * 1000,
        refreshToken: 'stored-account-refresh',
        user: { id: 'owner-id', email: 'owner@example.com' }
      })
    );
  }, accountSessionStorageKey);

  await page.goto(`${baseUrl}/login?intent=admin&returnTo=/admin/image2-cases`);
  await expect(page.getByRole('heading', { name: 'Admin test destination' })).toBeVisible();
  expect(exchangePayload).toMatchObject({
    accessToken: 'stored-account-access',
    refreshToken: 'stored-account-refresh'
  });
});
