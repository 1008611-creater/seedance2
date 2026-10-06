import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type ReplicationGuide = {
  workflow?: string;
  bestFor?: string;
  requiredInputs?: string[];
  editableVariables?: string[];
  keepFixed?: string[];
  verification?: string[];
  failureWatchouts?: string[];
};

type Image2ContentCase = {
  detailKey?: string;
  imageUrl?: string;
  imageStatus?: string;
  prompt?: string;
  promptKind?: string;
  replicationGuide?: ReplicationGuide;
  sourceId?: string;
  sourceStatus?: string;
  title?: string;
  valueTier?: string;
  editorialProfile?: {
    score?: number;
    tier?: string;
    strengths?: string[];
    cautions?: string[];
  };
  promptFamily?: {
    id?: string;
    size?: number;
    primary?: boolean;
    variantIndex?: number;
  };
};

const dataPath = path.join(process.cwd(), "public", "data", "image2-case-library.json");
const caseLibrarySourcePath = path.join(process.cwd(), "components", "image2-case-library.tsx");
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3012";

test("every published case has an actionable replication guide", async () => {
  const payload = JSON.parse(await readFile(dataPath, "utf8")) as { cases?: Image2ContentCase[] };
  const cases = payload.cases ?? [];
  expect(cases.length).toBeGreaterThan(1000);

  const incomplete = cases.filter((item) => {
    const guide = item.replicationGuide;
    return (
      !item.title?.trim() ||
      !item.prompt?.trim() ||
      (item.imageStatus !== "text-only" && !item.imageUrl?.trim()) ||
      !guide?.workflow ||
      !guide.bestFor?.trim() ||
      (guide.requiredInputs?.length ?? 0) < 2 ||
      (guide.editableVariables?.length ?? 0) < 3 ||
      (guide.keepFixed?.length ?? 0) < 2 ||
      (guide.verification?.length ?? 0) < 3 ||
      (guide.failureWatchouts?.length ?? 0) < 2
    );
  });

  expect(incomplete, `Incomplete content cases: ${incomplete.slice(0, 10).map((item) => item.detailKey ?? item.title).join(", ")}`).toEqual([]);
});

test("replication guides cover both text generation and reference editing workflows", async () => {
  const payload = JSON.parse(await readFile(dataPath, "utf8")) as { cases?: Image2ContentCase[] };
  const cases = payload.cases ?? [];
  const workflowCounts = cases.reduce<Record<string, number>>((counts, item) => {
    const workflow = item.replicationGuide?.workflow ?? "missing";
    counts[workflow] = (counts[workflow] ?? 0) + 1;
    return counts;
  }, {});

  expect(workflowCounts["文本生成"]).toBeGreaterThan(500);
  expect(workflowCounts["参考图编辑"]).toBeGreaterThan(30);
});

test("editorial scoring keeps featured cases selective and explains every score", async () => {
  const payload = JSON.parse(await readFile(dataPath, "utf8")) as { cases?: Image2ContentCase[] };
  const cases = payload.cases ?? [];
  const tierCounts = cases.reduce<Record<string, number>>((counts, item) => {
    const tier = item.valueTier ?? "missing";
    counts[tier] = (counts[tier] ?? 0) + 1;
    return counts;
  }, {});

  expect(tierCounts["精选"]).toBeGreaterThan(40);
  expect(tierCounts["精选"]).toBeLessThan(200);
  expect(tierCounts["高价值"]).toBeGreaterThan(400);
  expect(tierCounts["可参考"]).toBeGreaterThan(400);
  expect(
    cases.every(
      (item) =>
        Number.isFinite(item.editorialProfile?.score) &&
        item.editorialProfile?.tier === item.valueTier &&
        (item.editorialProfile?.strengths?.length ?? 0) + (item.editorialProfile?.cautions?.length ?? 0) > 0
    )
  ).toBe(true);
});

test("language headers are not mislabeled as JSON and IP cautions require a real risk term", async () => {
  const payload = JSON.parse(await readFile(dataPath, "utf8")) as { cases?: Image2ContentCase[] };
  const cases = payload.cases ?? [];
  const mislabeledLanguageHeaders = cases.filter(
    (item) => /^\s*\[(?:中文|英文|Chinese|English)\]/i.test(item.prompt ?? "") && item.promptKind === "JSON/结构化"
  );
  const falseIpWarnings = cases.filter((item) => {
    if (!item.editorialProfile?.cautions?.includes("含品牌或 IP 元素")) return false;
    return !/(?:\b(?:brand|logo|marvel|nike|youtube|meta|spider|ip)\b|品牌|商标)/i.test(item.prompt ?? "");
  });

  expect(mislabeledLanguageHeaders).toEqual([]);
  expect(falseIpWarnings).toEqual([]);
});

test("exact prompt duplicates are grouped into auditable variant families", async () => {
  const payload = JSON.parse(await readFile(dataPath, "utf8")) as { cases?: Image2ContentCase[] };
  const cases = payload.cases ?? [];
  const familyCases = cases.filter((item) => item.promptFamily);
  const familyIds = new Set(familyCases.map((item) => item.promptFamily?.id));
  const extraVariants = familyCases.filter((item) => item.promptFamily?.primary === false);

  expect(familyIds.size).toBeGreaterThanOrEqual(20);
  expect(extraVariants.length).toBeGreaterThanOrEqual(30);
  for (const familyId of familyIds) {
    const members = familyCases.filter((item) => item.promptFamily?.id === familyId);
    expect(members.filter((item) => item.promptFamily?.primary).length).toBe(1);
    expect(members.every((item) => item.promptFamily?.size === members.length)).toBe(true);
  }
});

test("retired sources are clearly marked and do not expose dead repository links", async () => {
  const payload = JSON.parse(await readFile(dataPath, "utf8")) as { cases?: Array<Image2ContentCase & { githubUrl?: string; reuseProfile?: { sourceConfidence?: string } }> };
  const archived = (payload.cases ?? []).filter((item) => item.sourceStatus === "archived");

  expect(archived.length).toBeGreaterThan(500);
  expect(archived.every((item) => !item.githubUrl)).toBe(true);
  expect(archived.every((item) => item.reuseProfile?.sourceConfidence === "存量归档")).toBe(true);
});

test("case detail renders the replication playbook and archived-source boundary", async ({ page }) => {
  await page.goto(`${baseUrl}/image2-cases?content-check=replication-guide-v1`);
  const detail = page.locator(".case-detail");
  await expect(detail.getByRole("region", { name: "案例复刻指南" })).toBeVisible({ timeout: 15_000 });
  await expect(detail).toContainText("适合做什么");
  await expect(detail).toContainText("准备输入");
  await expect(detail).toContainText("优先替换");
  await expect(detail).toContainText("必须保持");
  await expect(detail).toContainText("出图验收");
  await expect(detail).toContainText("常见失败点");
  await expect(detail.getByRole("region", { name: "案例编辑评分" })).toBeVisible();

  const variantToggle = page.getByRole("button", { name: /显示 \d+ 个同提示词变体/ });
  await expect(variantToggle).toBeVisible();
  await expect(variantToggle).toHaveAttribute("aria-pressed", "false");
  await variantToggle.click();
  const hideVariants = page.getByRole("button", { name: "隐藏重复变体" });
  await expect(hideVariants).toHaveAttribute("aria-pressed", "true");
  await hideVariants.click();

  const cards = page.locator(".case-card-shell");
  await expect(cards).toHaveCount(48);
  await page.getByRole("button", { name: "加载更多案例" }).click();
  await expect(cards).toHaveCount(96);

  await page.getByLabel("搜索案例").fill("E295-361");
  await expect(cards).toHaveCount(1);
  const archivedCaseButton = page.locator(".case-card");
  await expect(archivedCaseButton).toHaveCount(1);
  await archivedCaseButton.click();
  await expect(detail.getByRole("region", { name: "案例复用标注" })).toContainText("存量归档");
  await expect(detail.getByRole("link", { name: "GitHub 记录" })).toHaveCount(0);
});

test("mobile case detail keeps editorial content readable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/image2-cases?content-check=editorial-mobile-v1`);
  const cards = page.locator(".case-card");
  await expect(cards).toHaveCount(48, { timeout: 15_000 });
  await cards.first().click();

  const mobileDetail = page.locator(".case-mobile-detail-panel");
  await expect(mobileDetail).toBeVisible();
  await expect(mobileDetail.getByRole("region", { name: "案例编辑评分" })).toBeVisible();
  await expect(mobileDetail.getByRole("region", { name: "案例复刻指南" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("case-library cache version is advanced with the editorial-curation dataset", async () => {
  const source = await readFile(caseLibrarySourcePath, "utf8");
  expect(source).toContain('const image2DataVersion = "20261005-multisource-v2"');
});
