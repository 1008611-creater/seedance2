import { expect, test, type Page } from "@playwright/test";

const baseUrl = (process.env.IMAGE2_COMMERCIAL_BASE_URL ?? "http://127.0.0.1:3123").replace(/\/+$/, "");

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(3);
}

test("commercial home keeps the curated case data and primary conversion path aligned", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "把好图拆成能复用的提示词。" })).toBeVisible();
  await expect(page.getByRole("link", { name: "查找案例" })).toHaveAttribute("href", "/image2-cases");

  const hero = page.getByLabel("精选案例预览");
  await expect(hero.locator("a")).toHaveCount(4);
  const heroHrefs = await hero.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(heroHrefs).toEqual([
    "/image2-cases?case=30001",
    "/image2-cases?case=20292",
    "/image2-cases?case=20305",
    "/image2-cases?case=20039"
  ]);

  const heroImages = hero.locator("img");
  await expect(heroImages).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect
      .poll(() => heroImages.nth(index).evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  await expectNoOverflow(page);
});

test("commercial home supports account and bilingual interactions", async ({ page }) => {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

  const login = page.getByRole("button", { name: "登录同步资产" });
  // 登录能力是否配置由环境决定，不能由按钮自身的 disabled 状态决定：那样按钮在已配置 Supabase 的环境里
  // 回归成 disabled 时，else 分支的 toBeDisabled() 依然成立，测试会静默放行。
  // 判据取同源资产接口：生产模式下未配置 Supabase 资产后端固定返回 503；已配置 Supabase 资产后端时匿名请求固定返回 401。
  const assetsProbe = await page.request.get(`${baseUrl}/api/image2/assets`);
  const assetsStatus = assetsProbe.status();
  if (assetsStatus === 401) {
    // 生产部署模板 deploy/image2/production.env.example 把 Supabase 账号凭据与 IMAGE2_ASSET_SYNC_BACKEND=supabase
    // 绑定在一起，401 说明这套凭据已配置，登录入口必须可用，按钮必须 enabled。
    await expect(login).toBeEnabled();
    // 弹窗按钮同样要等 hydration；先确认弹窗未开再点击，避免重试时点到被遮罩挡住的按钮。
    const dialog = page.getByRole("dialog", { name: "账号登录" });
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        await login.click({ timeout: 3000 });
      }
      await expect(dialog).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20000 });
    const password = page.getByLabel("密码", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "显示密码" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "关闭" }).click();
  } else {
    // 200（本地 JSON store）或 503（生产模式未配置 Supabase 资产后端）都说明本次运行没有 Supabase 账号后端，
    // 客户端没有可用登录入口，按钮必须保持 disabled；其他状态说明判据本身失效，直接失败而不是猜分支。
    expect([200, 503], `unexpected /api/image2/assets status ${assetsStatus}`).toContain(assetsStatus);
    await expect(login).toBeDisabled();
  }

  // 语言切换按钮在 hydration 之前点击会被丢弃，高并发下偶发失败；用 toPass 重试整段交互。
  await expect(async () => {
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Turn strong images into prompts you can reuse." })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
});

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 700 }
]) {
  test(`commercial home is stable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "把好图拆成能复用的提示词。" })).toBeVisible();
    await expectNoOverflow(page);
  });
}

test("commercial home exposes the final content immediately for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const heading = page.getByRole("heading", { name: "把好图拆成能复用的提示词。" });
  await expect(heading).toBeVisible();
  const animationName = await heading.evaluate((element) => getComputedStyle(element.parentElement!).animationName);
  expect(animationName).toBe("none");
});
