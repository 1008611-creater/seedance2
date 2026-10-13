import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as proxyImage } from "../app/api/image2/proxy/route";
import { resolveImage2SiteUrl } from "../lib/image2-site-target";

test.setTimeout(90000);

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3013";
const caseKey = "youmind-YOUMI-1-0a8d3b89";

test("ANS catalog validates queries, paginates and supports ETag revalidation", async ({ request }) => {
  const response = await request.get(`${base}/api/integrations/ans/catalog?limit=2`);
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.schemaVersion).toBe("ans.image2-catalog.v1");
  expect(result.items).toHaveLength(2);
  expect(result.total).toBeGreaterThan(500);
  expect(result.nextOffset).toBe(2);
  expect(result.items[0].packUrl).toContain("/api/integrations/ans/cases/");
  const second = await request.get(`${base}/api/integrations/ans/catalog?limit=2&offset=2`);
  expect((await second.json()).items[0].key).not.toBe(result.items[0].key);
  const etag = response.headers().etag;
  const cached = await request.get(`${base}/api/integrations/ans/catalog?limit=2`, { headers: { "If-None-Match": `W/${etag}` } });
  expect(cached.status()).toBe(304);
  expect((await cached.body()).byteLength).toBe(0);
  for (const query of ["limit=0", "limit=51", "offset=-1", "offset=1.5", `q=${"x".repeat(161)}`]) {
    const invalid = await request.get(`${base}/api/integrations/ans/catalog?${query}`);
    expect(invalid.status(), query).toBe(400);
    expect(invalid.headers()["cache-control"]).toBe("no-store");
  }
});

test("ANS search includes Chinese translations and source/category filters", async ({ request }) => {
  const response = await request.get(`${base}/api/integrations/ans/catalog?q=${encodeURIComponent("VR 头显")}&source=youmind&category=${encodeURIComponent("Charts & Infographics")}&includeVariants=1`);
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.items.some((item: { key: string }) => item.key === caseKey)).toBe(true);
  expect(result.items.every((item: { sourceId: string; category: string }) => item.sourceId === "youmind" && item.category === "Charts & Infographics")).toBe(true);
});

test("ANS pack keeps provenance, per-case license and candidate status without executing generation", async ({ request }) => {
  const response = await request.get(`${base}/api/integrations/ans/cases/${caseKey}?download=1`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain(`image2-${caseKey}.ans.json`);
  const pack = await response.json();
  expect(pack.schemaVersion).toBe("ans.image2-case.v1");
  expect(pack.case.key).toBe(caseKey);
  expect(pack.prompt.original).toContain("VR headset");
  expect(pack.provenance.sourceUrl).toMatch(/^https:\/\//);
  expect(pack.review).toEqual({ status: "candidate", inspectedOriginal: false });
  expect(pack.importBehavior).toEqual({ visibility: "private", executeGeneration: false });
  expect(pack.generationPreference).toEqual({ provider: "McGrox", model: "gpt-image-2.5-sunburst", verified: false });
  const index = JSON.parse(await readFile(path.join(process.cwd(), "public/data/image2-case-library.index.json"), "utf8"));
  const restricted = index.cases.find((item: { sourceLicense?: string }) => item.sourceLicense?.includes("No Grant"));
  expect(restricted).toBeTruthy();
  const restrictedPack = await request.get(`${base}/api/integrations/ans/cases/${restricted.detailKey}`);
  expect((await restrictedPack.json()).provenance.licenseNote).toBe(restricted.sourceLicense);
  for (const key of ["unknown-case", "..%5C..%5Cpackage", "invalid%20key"]) {
    const invalid = await request.get(`${base}/api/integrations/ans/cases/${key}`);
    expect(invalid.status()).toBe(404);
    expect(invalid.headers()["cache-control"]).toBe("no-store");
  }
});

test("a stalled proxy body never returns a partial successful image", async () => {
  const realFetch = globalThis.fetch;
  const realTimeout = globalThis.setTimeout;
  let cancelled = false;
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([137, 80, 78, 71])); },
    cancel() { cancelled = true; }
  }), { headers: { "Content-Type": "image/png" } })) as typeof fetch;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => realTimeout(callback, delay === 15000 ? 20 : delay, ...args)) as typeof setTimeout;
  try {
    const response = await proxyImage(new NextRequest("http://localhost/api/image2/proxy?url=https%3A%2F%2Fgpt-image2.canghe.ai%2Fexample.png"));
    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cancelled).toBe(true);
  } finally { globalThis.fetch = realFetch; globalThis.setTimeout = realTimeout; }
});

test("invalid site configuration falls back safely", () => {
  const original = process.env.NEXT_PUBLIC_IMAGE2_SITE_URL;
  try {
    for (const url of ["not-a-url", "javascript:alert(1)", "https://user:password@example.com"]) {
      process.env.NEXT_PUBLIC_IMAGE2_SITE_URL = url;
      expect(resolveImage2SiteUrl()).toBe("https://image2.cauai.fun");
    }
    process.env.NEXT_PUBLIC_IMAGE2_SITE_URL = "https://image2.cauai.fun/path?secret=1";
    expect(resolveImage2SiteUrl()).toBe("https://image2.cauai.fun");
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_IMAGE2_SITE_URL;
    else process.env.NEXT_PUBLIC_IMAGE2_SITE_URL = original;
  }
});

test("case loading failure offers a working retry", async ({ page }) => {
  await page.route("**/data/image2-case-library*", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(`${base}/image2-cases`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main [role=alert]")).toContainText("案例库暂时加载失败");
  await page.unroute("**/data/image2-case-library*");
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(page.locator(".case-card").first()).toBeVisible({ timeout: 30000 });
});

test("mobile deep link selects its case and browser back/forward controls the detail layer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/image2/proxy?**", (route) => route.abort());
  await page.goto(`${base}/image2-cases?case=30001`, { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: "VR 头显爆炸结构海报", exact: true });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(dialog.getByRole("link", { name: "导出 ANS 案例包" })).toHaveAttribute("href", `/api/integrations/ans/cases/${caseKey}?download=1`);
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await page.goForward();
  await expect(dialog).toBeVisible();
});

test("standalone case page has responsive styles, structured guide lists and reusable links", async ({ page }) => {
  await page.route("**/api/image2/proxy?**", (route) => route.abort());
  await page.goto(`${base}/image2-cases/${caseKey}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "VR 头显爆炸结构海报", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "改写提示词与复用", exact: true })).toHaveAttribute("href", `/image2-cases?case=${caseKey}`);
  await expect(page.getByText("准备素材", { exact: true })).toBeVisible();
  await expect(page.getByText("商品名称、外形和核心卖点", { exact: true })).toBeVisible();
  expect(await page.locator("h1").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(25);
  await page.screenshot({ path: "output/optimization-detail-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "output/optimization-detail-mobile.png", fullPage: true });
  const data = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(data!).name).toBe("VR 头显爆炸结构海报");
});