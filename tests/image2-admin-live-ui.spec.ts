import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.IMAGE2_ADMIN_UI_BASE_URL || "http://127.0.0.1:3124";

const overviewFixture = {
  generatedAt: "2026-07-15T00:00:00.000Z",
  storageMode: "supabase-postgres",
  users: {
    admins: 1,
    message: "读取 public.profiles，只返回运营必要字段。",
    recent: [
      { createdAt: "2026-07-01T00:00:00Z", displayName: "Owner", email: "owner@example.com", id: "11111111-1111-4111-8111-111111111111", role: "admin", updatedAt: "2026-07-01T00:00:00Z" },
      { createdAt: "2026-07-02T00:00:00Z", displayName: "Creator", email: "creator@example.com", id: "22222222-2222-4222-8222-222222222222", role: "user", updatedAt: "2026-07-02T00:00:00Z" }
    ],
    status: "ready",
    total: 8
  },
  memberships: { active: 2, byPlan: [{ count: 2, plan: "creator" }], expired: 1, message: "读取 entitlements 状态和方案，不返回用户凭据。", status: "ready", total: 3 },
  licenses: { active: 4, disabled: 1, expired: 1, message: "仅聚合卡密状态，不读取或返回卡密哈希。", status: "ready", total: 8, used: 2 },
  redemptions: { failed: 2, message: "仅聚合兑换结果，不返回请求哈希、IP 哈希或用户代理。", status: "ready", succeeded: 2, total: 4 }
};

async function mockAdminApis(page: Page) {
  await page.route("**/api/admin/session", (route) => route.fulfill({ json: { authenticated: true, identity: { email: "owner@example.com", id: "owner-id", method: "supabase-role" } } }));
  await page.route("**/api/admin/image2/overview", (route) => route.fulfill({ json: overviewFixture }));
  await page.route("**/api/admin/image2-cases/changes?**", (route) => route.fulfill({ json: { changes: [], storageMode: "supabase-postgres" } }));
}

test("live admin console supports desktop and mobile operating paths", async ({ page }) => {
  await mockAdminApis(page);
  await page.goto(`${baseUrl}/admin/image2-cases`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "总览", exact: true })).toBeVisible();
  await expect(page.getByText("真实数据已读取", { exact: true })).toBeVisible();
  await expect(page.getByText("1,193", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /案例 \/ 提示词/ }).click();
  await expect(page.getByRole("heading", { name: "案例 / 提示词", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "搜索案例、提示词、来源或标签" }).fill("VR 头显");
  await expect(page.getByText("VR Headset Exploded View Poster", { exact: true })).toBeVisible();
  await page.screenshot({ fullPage: true, path: "output/admin-ops-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /用户与会员/ }).click();
  await expect(page.getByRole("heading", { name: "真实账号列表", exact: true })).toBeVisible();
  await expect(page.getByText("管理员", { exact: true })).toBeVisible();
  await page.screenshot({ fullPage: true, path: "output/admin-ops-mobile.png" });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
