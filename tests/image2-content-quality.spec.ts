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
  prompt?: string;
  replicationGuide?: ReplicationGuide;
  sourceId?: string;
  sourceStatus?: string;
  title?: string;
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
      !item.imageUrl?.trim() ||
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

test("case-library cache version is advanced with the replication-guide dataset", async () => {
  const source = await readFile(caseLibrarySourcePath, "utf8");
  expect(source).toContain('const image2DataVersion = "20260715-replication-guide-v1"');
});
