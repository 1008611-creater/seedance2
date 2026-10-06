import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyEditorialSpecificity,
  attachPromptFamilies,
  categoryZh,
  normalizeCasePromptMetadata,
  normalizePromptFamily,
  sceneLabelsFor,
  stripEmoji,
  tagLabelsFor,
  withEditorialFields,
  withReuseFields
} from "./lib/image2-case-enrichment.mjs";

// 统一案例库同步器。
// 预演：node tools/sync-image2-source-adapters.mjs
// 写入：node tools/sync-image2-source-adapters.mjs --write
//
// 流程：解析快照 -> 统一分类/标签/复刻指南/编辑评分 -> 与既有案例库合并 -> 同提示词分组 -> 写回。
// 幂等：同一批快照重复执行不会新增条目（靠 detailKey / sourceId+sourceCaseId / 规范化提示词识别）；除 importedAt 外内容未变化时保留原 importedAt 并跳过写入。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "data", "image2-sources");
const dataPath = path.join(root, "public", "data", "image2-case-library.json");
const write = process.argv.includes("--write");

const defs = {
  zerolu: {
    id: "zerolu",
    label: "ZeroLu / awesome-gpt-image",
    repo: "https://github.com/ZeroLu/awesome-gpt-image",
    site: "https://github.com/ZeroLu/awesome-gpt-image",
    model: "GPT Image 2",
    license: "MIT 仓库；案例含第三方作者与外部图片，商业使用前逐条核查。",
    note: "固定快照 README 的公开案例，保留原始提示词与作者链接。"
  },
  youmind: {
    id: "youmind",
    label: "YouMind / awesome-gpt-image-2",
    repo: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
    site: "https://youmind.com/gpt-image-2-prompts",
    model: "GPT Image 2",
    license: "CC BY 4.0；社区内容可能有单独权利，商用前逐条核查。",
    note: "只覆盖 README 可见带编号案例（Featured Prompts 与 All Prompts 两段），不把站点宣称总量计入。"
  },
  "evolink-commerce-25": {
    id: "evolink-commerce-25",
    label: "EvoLink / gpt-image-2.5-for-e-commerce",
    repo: "https://github.com/EvoLinkAI/gpt-image-2.5-for-e-commerce",
    site: "https://evolink.ai/gpt-image-2-5-sunburst",
    model: "gpt-image-2.5",
    license: "CC BY 4.0；社区案例保留贡献者与原始链接。",
    note: "当前电商仓库 README 快照，保留输入产品图、操作目的与输出图的配对。"
  },
  "youart-25": {
    id: "youart-25",
    label: "YouArt / awesome-gpt-image-2-5-prompts",
    repo: "https://github.com/youart-open-source/awesome-gpt-image-2-5-prompts",
    site: "https://github.com/youart-open-source/awesome-gpt-image-2-5-prompts",
    model: "gpt-image-2.5",
    license: "按行保留 CC0、CC BY 4.0、Prompt Authors No Grant 与 YouArt Curation No Grant 条款。",
    note: "data/prompts.json 的纯文本提示词，仓库未附逐条效果图；本站按“仅提示词”展示，不补通用示例图。"
  }
};

// 上游分类 -> 本站 13 个规范分类。zerolu 用 README 二级标题（去 emoji 后匹配）。
const zeroluCategoryMap = {
  "Photography & Photorealism": "Photography & Realism",
  "Game & Entertainment": "Scenes & Storytelling",
  "UI/UX & Social Media": "UI & Interfaces",
  "Video, Animation & Collage": "Scenes & Storytelling",
  "Typography & Poster Design": "Posters & Typography",
  "Infographics, Education & Documents": "Charts & Infographics",
  "Character & Consistency": "Characters & People",
  "Image Editing & Style Transfer": "Illustration & Art"
};
// youmind 用标题前缀（README 的 “小节 - 标题” 结构）分类，个别条目按内容修正。
const youmindSectionMap = {
  "Profile / Avatar": "Photography & Realism",
  "Social Media Post": "Posters & Typography",
  "Infographic / Edu Visual": "Charts & Infographics",
  "YouTube Thumbnail": "Scenes & Storytelling",
  "Comic / Storyboard": "Scenes & Storytelling",
  "Product Marketing": "Products & E-commerce",
  "E-commerce Main Image": "Products & E-commerce",
  "Game Asset": "Scenes & Storytelling"
};
const youartCategoryMap = {
  poster: "Posters & Typography",
  "typography-text": "Posters & Typography",
  infographic: "Charts & Infographics",
  "ui-mockup": "UI & Interfaces",
  "ecommerce-product": "Products & E-commerce",
  "ad-creative": "Posters & Typography",
  "character-design": "Characters & People",
  portrait: "Photography & Realism",
  illustration: "Illustration & Art"
};

const youmindFeaturedMap = {
  "vr headset exploded view poster": "Charts & Infographics",
  "illustrated city food map": "Charts & Infographics",
  "momotaro explainer slide in hybrid style": "Charts & Infographics",
  "e-commerce live stream ui mockup": "UI & Interfaces",
  "anime martial arts battle illustration": "Illustration & Art",
  "3d stone staircase evolution infographic": "Charts & Infographics"
};

function categoryFor(sourceId, rawCategory, title, prompt) {
  const raw = clean(rawCategory);
  if (sourceId === "zerolu") return zeroluCategoryMap[stripEmoji(raw)] || "Other Use Cases";
  if (sourceId === "evolink-commerce-25") return "Products & E-commerce";
  if (sourceId === "youart-25") return youartCategoryMap[raw.toLowerCase()] || "Other Use Cases";
  if (sourceId === "youmind") {
    const featured = youmindFeaturedMap[String(title || "").toLowerCase().trim()];
    if (featured) return featured;
    const text = title + " " + prompt;
    if (/ukiyo-?e|浮世絵|浮世绘/i.test(text)) return "History & Classical Themes";
    if (/research paper|academic poster|scrapbook poster/i.test(title)) return "Posters & Typography";
    const section = String(title || "").split(" - ")[0].trim();
    return youmindSectionMap[section] || "Other Use Cases";
  }
  return "Other Use Cases";
}

const clean = (v) => String(v == null ? "" : v).replace(/\r/g, "").trim();
const cleanAuthor = (v) => clean(v).replace(/\*\*/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[\u200b\u200e\u200f]/g, "").replace(/^[\s*\-]+/, "").replace(/[\s*]+$/, "");
const hash = (v) => createHash("sha1").update(String(v), "utf8").digest("hex");
const slug = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "case-" + hash(v).slice(0, 10);
const mdUrl = (v) => { const m = String(v || "").match(/https?:\/\/[^\s)>]+/i); return m ? m[0].replace(/[.,;]+$/, "") : ""; };
const sourceUrl = (block) => mdUrl((block.split("\n").find((x) => /source\s*:/i.test(x))) || "");

function images(block, id) {
  const a = [];
  for (const m of block.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) a.push(m[1]);
  for (const m of block.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) a.push(m[1]);
  return [...new Set(a.filter((x) => x && !/badge|shields\.io|trendshift/i.test(x)).map((x) => /^https?:/i.test(x) ? x : id === "zerolu" ? "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/" + x.replace(/^\.?\//, "") : x))].slice(0, 16);
}

function blocks(text, pattern) {
  const hs = [...text.matchAll(/^###\s+(.+)$/gm)], out = [];
  for (let i = 0; i < hs.length; i++) {
    const heading = clean(hs[i][1]);
    if (!pattern.test(heading)) continue;
    const start = hs[i].index + hs[i][0].length, next = text.slice(start).search(/^###\s+/m);
    const body = text.slice(start, next < 0 ? text.length : start + next), prior = text.slice(0, hs[i].index);
    const cs = [...prior.matchAll(/^##\s+([^#].+)$/gm)];
    out.push({ heading, body, category: cs.length ? clean(cs[cs.length - 1][1]) : "未分类" });
  }
  return out;
}

// 只做“上游字段 -> 统一结构”的映射；分类、标签、复刻指南、评分由增强模块统一补齐。
function toCase(x) {
  const p = clean(x.prompt);
  if (!p) return null;
  const d = defs[x.sourceId];
  if (!d) return null;
  const rawCategory = clean(x.category) || "未分类";
  const category = categoryFor(x.sourceId, rawCategory, clean(x.title), p);
  const imgs = x.images || [];
  const sourceCaseId = String(x.sourceCaseId);
  return {
    stableKey: x.sourceId + ":" + sourceCaseId + ":" + hash(p).slice(0, 12),
    title: clean(x.title) || sourceCaseId,
    category,
    categoryLabel: categoryZh[category] || category,
    imageUrl: imgs[0] || "",
    imageAlt: clean(x.title),
    imageStatus: imgs.length ? "available" : "text-only",
    imageRoles: imgs.map((url, i) => ({ url, role: i ? "output" : "reference-or-output" })),
    extraImageUrls: imgs.slice(1),
    prompt: p,
    sourceLabel: x.author ? x.author + " · " + d.label : d.label,
    sourceUrl: clean(x.sourceUrl) || d.site,
    githubUrl: clean(x.githubUrl) || d.repo,
    featured: false,
    caseCode: x.sourceId.toUpperCase().slice(0, 5) + "-" + slug(sourceCaseId),
    sourceCaseId,
    sourceId: x.sourceId,
    sourceName: d.label,
    sourceCategory: rawCategory,
    sourceNote: x.sourceNote || d.note,
    sourceLicense: d.license,
    coverageNote: d.note,
    model: d.model,
    author: clean(x.author),
    detailKey: x.sourceId + "-" + slug(sourceCaseId),
    sourceRights: x.upstream ? { upstream: x.upstream, terms: "保留 provenance；逐条核查授权" } : undefined
  };
}

function parseZero(text) {
  return blocks(text, /./).map((x) => {
    const p = x.body.match(/\*\*Prompt:?\*\*\s*\x60{3}(?:\w+)?\s*([\s\S]*?)\x60{3}/i);
    if (!p) return null;
    const s = sourceUrl(x.body);
    return toCase({ sourceId: "zerolu", sourceCaseId: slug(x.heading) + "-" + hash(p[1]).slice(0, 8), title: x.heading, category: x.category, prompt: p[1], images: images(x.body, "zerolu"), sourceUrl: s || defs.zerolu.site, author: s ? s.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] : "", githubUrl: defs.zerolu.repo + "/blob/main/README.md" });
  }).filter(Boolean);
}

function parseYouMind(text) {
  return blocks(text, /^No\.\s*\d+/i).map((x) => {
    const h = x.heading.match(/^No\.\s*(\d+)\s*[:：]?\s*(.*)$/i);
    const p = x.body.match(/####[^\n]*Prompt[^\n]*[\s\S]*?\x60{3}(?:\w+)?\s*([\s\S]*?)\x60{3}/i);
    if (!h || !p) return null;
    const a = x.body.match(/Author\s*[:：]\s*([^\n|]+)/i);
    return toCase({ sourceId: "youmind", sourceCaseId: h[1] + "-" + hash(p[1]).slice(0, 8), title: h[2] || "YouMind #" + h[1], category: x.category, prompt: p[1], images: images(x.body, "youmind"), sourceUrl: sourceUrl(x.body) || "https://youmind.com/gpt-image-2-prompts?id=" + h[1], author: a ? cleanAuthor(a[1]) : "YouMind community", githubUrl: defs.youmind.repo + "/blob/main/README.md" });
  }).filter(Boolean);
}

function parseEvo(text) {
  return blocks(text, /^Case\s+\d+/i).map((x) => {
    const h = x.heading.match(/^Case\s+(\d+)\s*:\s*(.*)$/i);
    const p = x.body.match(/\*\*(?:Observed\s+)?Prompt:?\*\*\s*:?[\r\n]*\x60{3}(?:\w+)?\s*([\s\S]*?)\x60{3}/i);
    if (!h || !p) return null;
    return toCase({ sourceId: "evolink-commerce-25", sourceCaseId: h[1] + "-" + hash(h[2] + p[1]).slice(0, 8), title: h[2] || "EvoLink Case " + h[1], category: x.category, prompt: p[1], images: images(x.body, "evolink-commerce-25"), sourceUrl: sourceUrl(x.body) || defs["evolink-commerce-25"].repo, author: /community/i.test(x.body) ? "Community contribution" : "EvoLinkAI", githubUrl: defs["evolink-commerce-25"].repo + "/blob/main/README.md" });
  }).filter(Boolean);
}

function parseYouArt(data) {
  return (data.prompts || []).map((r) => toCase({
    sourceId: "youart-25",
    sourceCaseId: r.slug || r.promptSha256,
    title: r.title || r.slug,
    category: r.category,
    prompt: r.prompt,
    sourceUrl: r.sourceUrl || r.url || defs["youart-25"].site,
    author: r.author,
    githubUrl: defs["youart-25"].repo + "/blob/main/data/prompts.json",
    sourceNote: "YouArt corpus " + ((data._meta && data._meta.corpusDate) || "unknown") + "；上游 " + (r.upstream || "未声明") + "。仓库未附该条效果图，效果见原帖。",
    upstream: r.upstream || "YouArt curation"
  })).filter(Boolean);
}

const json = async (f) => JSON.parse((await readFile(f, "utf8")).replace(String.fromCharCode(0xFEFF), ""));
const allocate = (key, used) => {
  let n = (Number.parseInt(hash(key).slice(0, 8), 16) % 700000000) + 100000000;
  while (used.has(n)) n += 1;
  used.add(n);
  return n;
};
const incompleteCase = (item) => {
  const g = item.replicationGuide;
  if (!clean(item.title) || !clean(item.prompt)) return true;
  if (item.imageStatus !== "text-only" && !clean(item.imageUrl)) return true;
  if (!g || !clean(g.workflow) || !clean(g.bestFor)) return true;
  return (g.requiredInputs || []).length < 2 || (g.editableVariables || []).length < 3 || (g.keepFixed || []).length < 2 || (g.verification || []).length < 3 || (g.failureWatchouts || []).length < 2;
};

const current = await json(dataPath);
const manifest = await json(path.join(sourceRoot, "manifest.json"));
const parsed = {
  zerolu: parseZero(await readFile(path.join(sourceRoot, "zerolu", "README.md"), "utf8")),
  youmind: parseYouMind(await readFile(path.join(sourceRoot, "youmind", "README.md"), "utf8")),
  "evolink-commerce-25": parseEvo(await readFile(path.join(sourceRoot, "evolink-commerce-25", "README.md"), "utf8")),
  "youart-25": parseYouArt(await json(path.join(sourceRoot, "youart-25", "prompts.json")))
};

const enriched = applyEditorialSpecificity(
  Object.values(parsed)
    .flat()
    .map(normalizeCasePromptMetadata)
    .map(withReuseFields)
    .map(withEditorialFields)
);

// 合并阶段会 Object.assign 原地改写命中的条目对象；这里必须与磁盘快照隔离，
// 否则末尾的 stripImportedAt(payload) === stripImportedAt(current) 会把已改写的
// current 当成「新数据」，使上游内容变更被误判为无变化而跳过写入。
const existingCases = Array.isArray(current.cases) ? structuredClone(current.cases) : [];
const used = new Set();
const idOwner = new Map();
for (const item of existingCases) {
  const id = Number(item.id);
  if (Number.isFinite(id) && !used.has(id)) {
    used.add(id);
    idOwner.set(id, item);
  }
}
const reassignedIds = [];
for (const item of existingCases) {
  const id = Number(item.id);
  if (Number.isFinite(id) && idOwner.get(id) !== item) {
    const next = allocate(String(item.detailKey || item.caseCode || id), used);
    reassignedIds.push({ from: id, to: next, caseCode: item.caseCode || item.sourceCaseId });
    item.id = next;
    idOwner.set(next, item);
  }
}

const titleKey = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");
const byDetailKey = new Map();
const bySourceEntry = new Map();
const bySourceTitle = new Map();
const byPrompt = new Map();
for (const item of existingCases) {
  if (item.detailKey) byDetailKey.set(item.detailKey, item);
  if (item.sourceId) bySourceEntry.set(item.sourceId + "\u0000" + item.sourceCaseId, item);
  if (item.sourceId && clean(item.title)) {
    const key = item.sourceId + "\u0000" + titleKey(item.title);
    if (!bySourceTitle.has(key)) bySourceTitle.set(key, item);
  }
  const key = normalizePromptFamily(item.prompt);
  if (key && !byPrompt.has(key)) byPrompt.set(key, item);
}

const all = [...existingCases];
const perSource = {};
for (const id of Object.keys(defs)) perSource[id] = { parsed: parsed[id].length, added: 0, updated: 0, mergedManual: 0, samePromptAsOtherSource: 0, textOnly: 0, missingImage: 0, missingSourceUrl: 0, published: 0 };

for (const item of enriched) {
  const stats = perSource[item.sourceId];
  if (!clean(item.sourceUrl)) stats.missingSourceUrl += 1;
  const entryKey = item.sourceId + "\u0000" + item.sourceCaseId;
  const sameTitleKey = item.sourceId + "\u0000" + titleKey(item.title);
  const entryHit = byDetailKey.get(item.detailKey) || bySourceEntry.get(entryKey);
  const hit = entryHit || bySourceTitle.get(sameTitleKey);
  if (hit) {
    const id = Number(hit.id);
    if (entryHit) {
      Object.assign(hit, item, { id });
    } else {
      // 上游列表改版后编号会变：同源同题的早期手工条目按内容合并，保留原 id、编号与主图，用解析版补全提示词与字段。
      const primaryImage = clean(hit.imageUrl) || clean(item.imageUrl);
      const extras = [...new Set([...(hit.extraImageUrls || []), ...(item.extraImageUrls || []), clean(item.imageUrl)])].filter((url) => url && url !== primaryImage);
      Object.assign(hit, item, {
        id,
        caseCode: hit.caseCode || item.caseCode,
        sourceCaseId: hit.sourceCaseId || item.sourceCaseId,
        detailKey: hit.detailKey || item.detailKey,
        title: hit.title || item.title,
        imageUrl: primaryImage,
        imageStatus: primaryImage ? "available" : item.imageStatus,
        imageAlt: hit.imageAlt || item.imageAlt,
        extraImageUrls: extras,
        imageRoles: primaryImage ? [{ url: primaryImage, role: "reference-or-output" }, ...extras.map((url) => ({ url, role: "output" }))] : item.imageRoles
      });
      bySourceTitle.set(sameTitleKey, hit);
      bySourceEntry.set(entryKey, hit);
      stats.mergedManual += 1;
    }
    stats.updated += 1;
    continue;
  }
  const promptKey = normalizePromptFamily(item.prompt);
  const twin = promptKey ? byPrompt.get(promptKey) : undefined;
  if (twin && twin.sourceId !== item.sourceId) stats.samePromptAsOtherSource += 1;
  const next = { ...item, id: allocate(item.stableKey, used) };
  all.push(next);
  byDetailKey.set(next.detailKey, next);
  bySourceEntry.set(entryKey, next);
  if (!bySourceTitle.has(sameTitleKey)) bySourceTitle.set(sameTitleKey, next);
  if (promptKey && !byPrompt.has(promptKey)) byPrompt.set(promptKey, next);
  stats.added += 1;
}

// 上游新源没有 styles/scenes 字段，按旧导入器同一套规则补齐；已有字段的存量条目不覆盖。
let tagFilled = 0;
let sceneFilled = 0;
for (const item of all) {
  if (!Array.isArray(item.styles) || !Array.isArray(item.styleLabels)) {
    const tagData = tagLabelsFor({ category: item.category, sourceCategory: item.sourceCategory, title: item.title, prompt: item.prompt || "" });
    item.styles = tagData.styles;
    item.styleLabels = tagData.styleLabels;
    tagFilled += 1;
  }
  if (!Array.isArray(item.scenes) || !Array.isArray(item.sceneLabels)) {
    const sceneData = sceneLabelsFor({ sourceCategory: item.sourceCategory || item.categoryLabel || "未分类", aspect: item.aspect, resolution: item.resolution, author: item.author });
    item.scenes = sceneData.scenes;
    item.sceneLabels = sceneData.sceneLabels;
    sceneFilled += 1;
  }
}
const missingTagFields = all.filter((item) => !Array.isArray(item.styles) || !Array.isArray(item.styleLabels) || !Array.isArray(item.scenes) || !Array.isArray(item.sceneLabels)).length;

for (const item of all) delete item.promptFamily;
attachPromptFamilies(all);
all.sort((a, b) => (Number(b.valueScore) || 0) - (Number(a.valueScore) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));

const duplicateIds = all.length - new Set(all.map((item) => Number(item.id))).size;
const counts = {};
for (const id of Object.keys(defs)) {
  const rows = all.filter((item) => item.sourceId === id);
  counts[id] = rows.length;
  perSource[id].published = rows.length;
  perSource[id].textOnly = rows.filter((item) => item.imageStatus === "text-only").length;
  perSource[id].missingImage = rows.filter((item) => !clean(item.imageUrl)).length;
}

const categories = (() => {
  const map = new Map();
  for (const item of all) map.set(item.category, (map.get(item.category) || 0) + 1);
  return [...map.entries()].map(([value, count]) => ({ value, label: categoryZh[value] || value, count })).sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
})();

const sources = [
  ...(current.sources || []).filter((item) => !defs[item.id]),
  ...Object.values(defs).map((d) => ({ id: d.id, label: d.label, site: d.site, repository: d.repo, count: counts[d.id], licenseNote: d.license, coverageNote: d.note, model: d.model, lastSync: manifest.capturedAt || "2026-10-05" }))
];
const radar = [
  ...(current.sourceRadar || []).filter((item) => !defs[item.id]),
  ...Object.values(defs).map((d) => ({ id: d.id, label: d.label, repository: d.repo, site: d.site, status: counts[d.id] ? "已接入" : "同步失败", coverage: counts[d.id], coverageNote: d.note, licenseNote: d.license }))
];

const payload = {
  ...current,
  source: current.source || "image2-unified-case-library",
  importedAt: new Date().toISOString(),
  totalCases: all.length,
  categories,
  sources,
  sourceRadar: radar,
  sync: {
    mode: "snapshot",
    capturedAt: manifest.capturedAt || "2026-10-05",
    sourceRoot: "data/image2-sources",
    counts,
    idempotency: "sourceId + sourceCaseId/detailKey + 规范化提示词",
    totalCases: all.length
  },
  cases: all
};

// 幂等判定：除 importedAt 外与现有数据文件一致时，保留原时间戳并跳过写入。
const stripImportedAt = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "importedAt")));
const previousImportedAt = typeof current.importedAt === "string" ? current.importedAt : "";
const payloadUnchanged = Boolean(previousImportedAt) && stripImportedAt(payload) === stripImportedAt(current);
if (payloadUnchanged) {
  payload.importedAt = previousImportedAt;
}

const familyCases = all.filter((item) => item.promptFamily);
const familyIds = new Set(familyCases.map((item) => item.promptFamily.id));
const tierCounts = {};
for (const item of all) tierCounts[item.valueTier] = (tierCounts[item.valueTier] || 0) + 1;
const workflowCounts = {};
for (const item of all) { const w = item.replicationGuide?.workflow || "missing"; workflowCounts[w] = (workflowCounts[w] || 0) + 1; }
const incomplete = all.filter(incompleteCase);

const report = {
  mode: write ? "write" : "dry-run",
  totalCases: all.length,
  uniqueIds: new Set(all.map((item) => Number(item.id))).size,
  duplicateIds,
  reassignedIds,
  perSource,
  counts,
  categories: categories.length,
  tierCounts,
  workflowCounts,
  promptFamilies: { groups: familyIds.size, members: familyCases.length, extraVariants: familyCases.filter((item) => item.promptFamily.primary === false).length },
  textOnly: all.filter((item) => item.imageStatus === "text-only").length,
  tagFields: { filledStyles: tagFilled, filledScenes: sceneFilled, missing: missingTagFields },
  incomplete: incomplete.length,
  incompleteSamples: incomplete.slice(0, 5).map((item) => item.detailKey || item.caseCode || item.id),
  importedAtPreserved: payloadUnchanged
};
console.log(JSON.stringify(report, null, 2));

const failed = duplicateIds > 0 || incomplete.length > 0 || missingTagFields > 0 || Object.values(perSource).some((item) => item.missingSourceUrl > 0);
if (failed) {
  process.exitCode = 1;
  console.error("同步自检未通过：请先处理重复 id、缺来源、缺复刻指南或缺标签字段的条目。");
} else if (write) {
  if (payloadUnchanged) {
    console.log(`数据文件内容未变化（保留 importedAt=${payload.importedAt}），跳过写入。`);
  } else {
    await writeFile(dataPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }
}