import { expect, test } from "@playwright/test";

const baseUrl = process.env.IMAGE2_ADMIN_CANDIDATE_URL ?? "http://127.0.0.1:3118";
const candidatePath = "/admin/image2-cases/candidate";

test("Image2 local admin candidate reads the catalog without live admin calls", async ({ page }) => {
  const protectedRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(admin|image2\/(entitlements|redeem|balance|quota|proxy))/.test(request.url())) {
      protectedRequests.push(request.url());
    }
  });

  await page.goto(`${baseUrl}${candidatePath}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "总览" })).toBeVisible();

  await page.getByRole("button", { name: /案例 \/ 提示词/ }).click();
  const search = page.getByLabel("搜索案例、提示词、来源或标签");
  await expect(search).toBeVisible();
  await search.fill("wafer");
  await expect(page.getByText("Chocolate wafer product render (JSON-style)")).toBeVisible();

  await page.locator("button").filter({ hasText: "Chocolate wafer product render" }).first().click();
  await expect(page.getByRole("complementary", { name: "案例检查器" })).toBeVisible();
  await page.getByRole("button", { name: "创建本地审查任务" }).click();
  await expect(page.locator('[role="status"]')).toContainText("没有写入案例库或 Supabase");

  await page.getByRole("button", { name: "关闭案例检查器" }).click();
  await page.getByRole("button", { name: /用户与会员/ }).click();
  await expect(page.getByText("用户与会员数据尚未安全接通")).toBeVisible();
  await expect(page.getByText("不请求 Supabase，不展示用户或卡密数据")).toBeVisible();
  expect(protectedRequests).toEqual([]);
});

test("Image2 admin candidate leaves the existing operations hub unchanged", async ({ page }) => {
  await page.goto(`${baseUrl}/admin/image2-cases`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Image2 案例库运营入口" })).toBeVisible();
});
