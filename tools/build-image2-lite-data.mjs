import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), "public", "data");
const sourcePath = path.join(dataDir, "image2-case-library.json");
const indexPath = path.join(dataDir, "image2-case-library.index.json");
const indexJsPath = path.join(dataDir, "image2-case-library.index.js");
const detailsDir = path.join(dataDir, "image2-cases");
const caseImageDir = path.join(process.cwd(), "public", "image2", "cases");

const detailFields = new Set([
  "prompt",
  "sourceUrl",
  "githubUrl",
  "sourceNote",
  "riskNote",
  "publishAngle",
  "promptStructure",
  "reuseProfile",
  "replicationGuide"
]);
const unavailableImagePaths = new Set([
  "images/ad-creative_case179/output.jpg",
  "images/ad-creative_case180/output.jpg",
  "images/ad-creative_case181/output.jpg",
  "images/ad-creative_case182/output.jpg",
  "images/comparison_case86/output.jpg",
  "images/comparison_case87/output.jpg",
  "images/comparison_case88/output.jpg",
  "images/portrait_case176/output.jpg",
  "images/portrait_case177/output.jpg",
  "images/portrait_case178/output.jpg",
  "images/portrait_case179/output.jpg",
  "images/portrait_case180/output.jpg",
  "images/portrait_case181/output.jpg",
  "images/portrait_case182/output.jpg",
  "images/portrait_case183/output.jpg",
  "images/portrait_case184/output.jpg",
  "images/poster_case270/output.jpg",
  "images/poster_case271/output.jpg",
  "images/poster_case272/output.jpg",
  "images/poster_case273/output.jpg",
  "images/poster_case274/output.jpg",
  "images/poster_case275/output.jpg",
  "images/poster_case276/output.jpg",
  "images/poster_case277/output.jpg",
  "images/poster_case278/output.jpg",
  "images/poster_case279/output.jpg",
  "images/poster_case280/output.jpg",
  "images/poster_case281/output.jpg",
  "images/poster_case282/output.jpg",
  "images/poster_case283/output.jpg",
  "images/poster_case284/output.jpg",
  "images/ui_case148/output.jpg",
  "images/ui_case149/output.jpg",
  "images/ui_case150/output.jpg",
  "images/ui_case151/output.jpg",
  "images/ui_case152/output.jpg",
  "images/ui_case153/output.jpg",
  "images/ui_case154/output.jpg",
  "images/ui_case155/output.jpg",
  "images/ui_case156/output.jpg",
  "images/ui_case157/output.jpg"
]);
const evolinkRawPrefix = "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));
const detailKey = (item) =>
  `${item.sourceId ?? "canghe"}-${item.caseCode ?? item.sourceCaseId ?? item.id}`
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-");

const readCachedImages = async () => {
  try {
    const files = await readdir(caseImageDir);
    return new Map(files.map((file) => [path.parse(file).name, `/image2/cases/${file}`]));
  } catch {
    return new Map();
  }
};

const proxyImageUrl = (value) => {
  if (!value || typeof value !== "string") return value;
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return value;
    return `/api/image2/proxy?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return value;
  }
};

const payload = await readJson(sourcePath);
const sourceCases = Array.isArray(payload.cases) ? payload.cases : [];
const hasUnavailableImage = (item) => {
  if (typeof item.imageUrl !== "string" || !item.imageUrl.startsWith(evolinkRawPrefix)) return false;
  return unavailableImagePaths.has(decodeURIComponent(item.imageUrl.slice(evolinkRawPrefix.length)));
};
const cases = sourceCases.filter((item) => !hasUnavailableImage(item));
const cachedImages = await readCachedImages();

const omitDetailFields = (item) => {
  const key = detailKey(item);
  const summary = Object.fromEntries(Object.entries(item).filter(([field]) => !detailFields.has(field)));
  const cachedImageUrl = cachedImages.get(key);

  return {
    ...summary,
    detailKey: key,
    imageUrl: cachedImageUrl ?? proxyImageUrl(summary.imageUrl)
  };
};

await mkdir(detailsDir, { recursive: true });

const countBy = (items, getKey) =>
  items.reduce((counts, item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());
const categoryCounts = countBy(cases, (item) => item.category);
const sourceCounts = countBy(cases, (item) => item.sourceId ?? "canghe");
const categories = (payload.categories ?? [])
  .map((item) => ({ ...item, count: categoryCounts.get(item.value) ?? 0 }))
  .filter((item) => item.count > 0);
const sources = (payload.sources ?? []).map((item) => ({ ...item, count: sourceCounts.get(item.id) ?? 0 }));

const indexPayload = {
  source: payload.source,
  sources,
  importedAt: payload.importedAt,
  licenseNote: payload.licenseNote,
  totalCases: cases.length,
  categories,
  styles: payload.styles,
  scenes: payload.scenes,
  sourceRadar: payload.sourceRadar,
  cases: cases.map(omitDetailFields)
};

await writeFile(indexPath, `${JSON.stringify(indexPayload)}\n`, "utf8");
await writeFile(indexJsPath, `${JSON.stringify(indexPayload)}\n`, "utf8");

await Promise.all(
  cases.flatMap((item) => {
    const detailPayload = {
        id: item.id,
        detailKey: detailKey(item),
        prompt: item.prompt,
        sourceUrl: item.sourceUrl,
        githubUrl: item.githubUrl,
        sourceLabel: item.sourceLabel,
        sourceNote: item.sourceNote,
        riskNote: item.riskNote,
        publishAngle: item.publishAngle,
        promptStructure: item.promptStructure,
        reuseProfile: item.reuseProfile,
        replicationGuide: item.replicationGuide
      };
    const body = `${JSON.stringify(detailPayload)}\n`;
    return [
      writeFile(path.join(detailsDir, `${detailKey(item)}.json`), body, "utf8"),
      writeFile(path.join(detailsDir, `${detailKey(item)}.js`), body, "utf8")
    ];
  })
);

const sizeOf = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
const fullSize = sizeOf(payload);
const indexSize = sizeOf(indexPayload);

console.log(
  JSON.stringify(
    {
      cases: cases.length,
      fullBytes: fullSize,
      indexBytes: indexSize,
      savedBytes: fullSize - indexSize,
      savedPercent: Math.round((1 - indexSize / fullSize) * 1000) / 10,
      detailDir: detailsDir
    },
    null,
    2
  )
);
