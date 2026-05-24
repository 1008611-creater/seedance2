import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceCasesPath = path.join(projectRoot, "output", "canghe-cases.json");
const sourceStylePath = path.join(projectRoot, "output", "canghe-style-library.json");
const outputPath = path.join(projectRoot, "public", "data", "image2-canghe-cases.json");
const siteBase = "https://gpt-image2.canghe.ai";
const repoBase = "https://github.com/freestylefly/awesome-gpt-image-2";

const categoryZh = {
  "UI & Interfaces": "UI 与界面",
  "Charts & Infographics": "图表与信息图",
  "Posters & Typography": "海报与排版",
  "Products & E-commerce": "商品与电商",
  "Brand & Logos": "品牌与 Logo",
  "Architecture & Spaces": "建筑与空间",
  "Photography & Realism": "摄影与写实",
  "Illustration & Art": "插画与艺术",
  "Characters & People": "人物与角色",
  "Scenes & Storytelling": "场景与叙事",
  "History & Classical Themes": "国风与历史",
  "Documents & Publishing": "文档与出版",
  "Other Use Cases": "其他实验"
};

const categoryWeights = {
  "UI & Interfaces": 16,
  "Charts & Infographics": 20,
  "Posters & Typography": 18,
  "Products & E-commerce": 22,
  "Brand & Logos": 19,
  "Architecture & Spaces": 14,
  "Photography & Realism": 17,
  "Illustration & Art": 14,
  "Characters & People": 16,
  "Scenes & Storytelling": 14,
  "History & Classical Themes": 13,
  "Documents & Publishing": 16,
  "Other Use Cases": 10
};

const valuableStyleWeights = {
  UI: 8,
  Poster: 7,
  Infographic: 9,
  Product: 10,
  Brand: 8,
  Realistic: 6,
  "3D": 5,
  Character: 5,
  Illustration: 4
};

function absoluteUrl(value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${siteBase}${value.startsWith("/") ? value : `/${value}`}`;
}

function reusableValue(caseItem) {
  const prompt = caseItem.prompt || "";
  const title = caseItem.title || "";
  const keywordBoost = /信息图|系统|合集|报告|品牌|产品|海报|界面|图标|长卷|地图|模板|详情|拆解|直播|摄影|卡片|包装|App/i.test(
    `${title} ${prompt.slice(0, 500)}`
  )
    ? 10
    : 0;
  const promptBoost = prompt.length > 800 ? 12 : prompt.length > 420 ? 9 : prompt.length > 180 ? 5 : 1;
  const styleBoost = (caseItem.styles || []).reduce((sum, style) => sum + (valuableStyleWeights[style] || 0), 0);
  const sourceBoost = caseItem.sourceUrl ? 4 : 0;
  const featuredBoost = caseItem.featured ? 24 : 0;
  const categoryBoost = categoryWeights[caseItem.category] || 8;
  const rawScore = featuredBoost + categoryBoost + promptBoost + styleBoost + sourceBoost + keywordBoost;
  return Math.max(35, Math.min(100, rawScore));
}

function valueTier(score, featured) {
  if (featured || score >= 82) return "精选";
  if (score >= 68) return "高价值";
  return "可参考";
}

function promptKind(prompt) {
  const trimmed = (prompt || "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "JSON/结构化";
  if (/英文版|English|Prompt:/i.test(trimmed)) return "中英混合";
  if (/^[\x00-\x7F\s.,:;'"!?()[\]{}<>/@#%&+-]+$/.test(trimmed.slice(0, 300))) return "英文";
  return "中文";
}

const sourceCases = JSON.parse(await readFile(sourceCasesPath, "utf-8"));
const sourceStyle = JSON.parse(await readFile(sourceStylePath, "utf-8"));
const tagLabels = sourceStyle.tagLabels || {};

const categories = (sourceCases.categories || []).map((category) => ({
  value: category,
  label: categoryZh[category] || category,
  count: sourceCases.cases.filter((item) => item.category === category).length
}));

const cases = sourceCases.cases.map((item) => {
  const score = reusableValue(item);
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    categoryLabel: categoryZh[item.category] || item.category,
    styles: item.styles || [],
    styleLabels: (item.styles || []).map((style) => tagLabels[style]?.zh || style),
    scenes: item.scenes || [],
    sceneLabels: (item.scenes || []).map((scene) => tagLabels[scene]?.zh || scene),
    imageUrl: absoluteUrl(item.image),
    imageAlt: item.imageAlt || item.title,
    prompt: item.prompt || "",
    promptPreview: item.promptPreview || (item.prompt || "").slice(0, 240),
    promptKind: promptKind(item.prompt),
    sourceLabel: item.sourceLabel || "unknown",
    sourceUrl: item.sourceUrl || "",
    githubUrl: item.githubUrl || `${repoBase}/blob/main/docs/gallery.md`,
    featured: Boolean(item.featured),
    valueScore: score,
    valueTier: valueTier(score, item.featured)
  };
});

const payload = {
  source: {
    site: siteBase,
    repository: sourceCases.repository || repoBase,
    importedAt: new Date().toISOString(),
    licenseNote:
      "学习参考库：保留原始来源链接。上游项目为 MIT，但其 README 说明第三方内容不保证可商用，商业使用前需确认原作者授权。"
  },
  totalCases: cases.length,
  categories,
  styles: sourceCases.styles || [],
  scenes: sourceCases.scenes || [],
  cases
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

console.log(JSON.stringify({ outputPath, totalCases: cases.length, categories: categories.length }, null, 2));
