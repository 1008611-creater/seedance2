import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataPath = path.join(process.cwd(), "public", "data", "image2-case-library.json");
const outputDir = path.join(process.cwd(), "public", "image2", "cases");
const limitArg = Number.parseInt(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "", 10);
const limit = Number.isFinite(limitArg) ? limitArg : 80;

const detailKey = (item) =>
  `${item.sourceId ?? "canghe"}-${item.caseCode ?? item.sourceCaseId ?? item.id}`
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-");

const extensionFrom = (url, contentType) => {
  const pathname = new URL(url).pathname.toLowerCase();
  const ext = path.extname(pathname).replace(".", "");
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  return "jpg";
};

const payload = JSON.parse(await readFile(dataPath, "utf8"));
const cases = Array.isArray(payload.cases) ? payload.cases : [];
const selected = [...cases]
  .filter((item) => {
    if (!item.imageUrl) return false;
    try {
      const url = new URL(item.imageUrl);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  })
  .sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0) || (b.id ?? 0) - (a.id ?? 0))
  .slice(0, limit);

await mkdir(outputDir, { recursive: true });

let cached = 0;
let failed = 0;
const failures = [];

for (const item of selected) {
  const key = detailKey(item);

  try {
    const response = await fetch(item.imageUrl, {
      headers: {
        "User-Agent": "image2-case-library-cache/1.0"
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "";
    const ext = extensionFrom(item.imageUrl, contentType);
    const filePath = path.join(outputDir, `${key}.${ext}`);
    const body = Buffer.from(await response.arrayBuffer());

    await writeFile(filePath, body);
    cached += 1;
  } catch (error) {
    failed += 1;
    failures.push({
      id: item.id,
      key,
      url: item.imageUrl,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

console.log(
  JSON.stringify(
    {
      requested: selected.length,
      cached,
      failed,
      outputDir,
      failures: failures.slice(0, 10)
    },
    null,
    2
  )
);
