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
  await expect(login).toBeEnabled();
  await login.click();
  await expect(page.getByRole("dialog", { name: "账号登录" })).toBeVisible();
  const password = page.getByLabel("密码", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "显示密码" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Turn strong images into prompts you can reuse." })).toBeVisible();
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
