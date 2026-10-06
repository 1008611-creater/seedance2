import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyEditorialSpecificity,
  attachPromptFamilies,
  categoryZh,
  normalizeCasePromptMetadata,
  promptKind,
  promptPreview,
  sceneLabelsFor,
  scoreCase,
  stripEmoji,
  tagLabelsFor,
  valueTier,
  withEditorialFields,
  withReuseFields,
  wuyoscarCategoryMap
} from "./lib/image2-case-enrichment.mjs";

const projectRoot = process.cwd();
const dataDir = path.join(projectRoot, "public", "data");
const canghePath = path.join(dataDir, "image2-canghe-cases.json");
const outputPath = path.join(dataDir, "image2-case-library.json");
const manualCasesPath = path.join(dataDir, "image2-manual-cases.json");
const offlineMode = process.argv.includes("--offline");

const wuyoscarRepo = "https://github.com/wuyoscar/gpt_image_2_skill";
const wuyoscarRaw = "https://raw.githubusercontent.com/wuyoscar/gpt_image_2_skill/main";
const wuyoscarReferences = `${wuyoscarRaw}/skills/gpt-image/references`;
const evolinkRepo = "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts";
const evolinkRaw = "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main";
const evolinkCases = `${evolinkRaw}/cases`;
const morphicUrl = "https://morphic.com/resources/how-to/chatgpt-images-2.0-prompts";
const picsartUrl = "https://picsart.com/blog/gpt-image-2-prompts/";
const fotorUrl = "https://www.fotor.com/blog/gpt-image-2-prompts/";
const mindstudioUrl = "https://www.mindstudio.ai/blog/gpt-image-2-use-cases";
const image2studioSite = "https://image2studio.com";
const image2studioUseCaseUrl = `${image2studioSite}/en/prompts/use-case/app-ui-mockup`;
const youmindRepo = "https://github.com/YouMind-OpenLab/awesome-gpt-image-2";
const youmindGallery = "https://youmind.com/gpt-image-2-prompts";

const sourceRadar = [
  {
    id: "evolink",
    label: "EvoLinkAI Awesome GPT Image 2",
    url: "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts",
    status: "存量归档",
    note: "上游仓库已下线；保留最后一次成功导入的案例、原作者链接和图片记录，不再把失效 GitHub 页作为可点击来源。"
  },
  {
    id: "morphic",
    label: "Morphic GPT Image 2 Prompt Guide",
    url: morphicUrl,
    status: "已接入",
    note: "40 条图文 prompt 案例；手工层已精选 4 条海报/信息图/空间/商品样例，后续可继续补抓直链图片。"
  },
  {
    id: "picsart",
    label: "Picsart GPT Image 2 Prompt Ideas",
    url: picsartUrl,
    status: "已接入",
    note: "图文案例密度高，适合补充产品、人物、编辑和生活化场景模板。"
  },
  {
    id: "fotor",
    label: "Fotor GPT Image 2 Prompt Ideas",
    url: fotorUrl,
    status: "已接入",
    note: "24 个高价值图文案例，覆盖商品、信息图、UI、角色和展示类模板。"
  },
  {
    id: "mindstudio",
    label: "MindStudio GPT Image 2 Use Cases",
    url: mindstudioUrl,
    status: "洞察源",
    note: "更偏能力边界和商业应用梳理，适合补充分类说明，不优先搬图。"
  },
  {
    id: "image2studio-app-ui",
    label: "Image2Studio App UI Mockup",
    url: image2studioUseCaseUrl,
    status: "已接入",
    note: "从 App UI Mockup 用例页抓取带 CreativeWork 结构化数据的图片、提示词和来源页，先作为可复用提示词模板样本入库。"
  },
  {
    id: "youmind",
    label: "YouMind OpenLab Awesome GPT Image 2",
    url: youmindGallery,
    status: "已接入",
    note: "README 可见前 120 条高质量图文案例，站内说明完整图库超过 6552 条，适合持续抽样补充高价值模板。"
  }
];

const evolinkCaseFiles = [
  { file: "ecommerce.md", sourceCategory: "E-commerce Cases", category: "Products & E-commerce" },
  { file: "ad-creative.md", sourceCategory: "Ad Creative Cases", category: "Products & E-commerce" },
  { file: "portrait.md", sourceCategory: "Portrait & Photography Cases", category: "Photography & Realism" },
  { file: "poster.md", sourceCategory: "Poster & Illustration Cases", category: "Posters & Typography" },
  { file: "character.md", sourceCategory: "Character Design Cases", category: "Characters & People" },
  { file: "ui.md", sourceCategory: "UI & Social Media Mockup Cases", category: "UI & Interfaces" },
  { file: "comparison.md", sourceCategory: "Comparison & Community Examples", category: "Other Use Cases" }
];

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "seedance2-image2-case-importer"
        }
      });
      if (!response.ok) {
        throw new Error(`Fetch failed ${response.status}: ${url}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 650));
    }
  }
  throw lastError;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseIndex(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/\|\s*(.+?)\s*\|\s*\[`([^`]+)`\]\((gallery-[^)]+\.md)\)\s*\|\s*([^|]+)\s*\|\s*(\d+)\s*\|/);
      if (!match) return null;
      return {
        sourceCategory: stripEmoji(match[1]),
        file: match[3],
        range: match[4].trim(),
        count: Number(match[5])
      };
    })
    .filter(Boolean);
}

function imageUrlFromPath(imagePath) {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  return `${wuyoscarRaw}/${imagePath.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "")}`;
}

function parseMetadata(block) {
  const metadata = block.match(/^- Metadata:\s*(.+)$/m)?.[1] || "";
  const parts = metadata.split("·").map((part) => part.trim());
  const sourceCategory = parts[0] || "Other";
  const ticks = [...metadata.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  const author = metadata.match(/Author:\s*([^·\n]+)/)?.[1]?.trim() || (metadata.includes("Curated") ? "Curated" : "Unknown");
  const sourceLink = metadata.match(/Source:\s*\[([^\]]+)\]\(([^)]+)\)/);
  const cites = metadata.match(/\*\*Cites:\*\*\s*([^·\n]+)/);
  return {
    sourceCategory,
    aspect: ticks[0] || "",
    resolution: ticks[1] || "",
    author,
    sourceLabel: sourceLink?.[1] || (cites?.[1] ? `Cites: ${cites[1].trim()}` : author),
    sourceUrl: sourceLink?.[2] || ""
  };
}

function parseGalleryFile(markdown, fileInfo) {
  const matches = [...markdown.matchAll(/^###\s+No\.\s+(\d+)\s+·\s+(.+)$/gm)];
  return matches
    .map((match, index) => {
      const start = match.index || 0;
      const end = matches[index + 1]?.index || markdown.length;
      const block = markdown.slice(start, end);
      const sourceNo = Number(match[1]);
      const title = match[2].replace(/\s*🆕\s*$/, "").trim();
      const directImage = block.match(/^- Image:\s*`([^`]+)`/m)?.[1];
      const allImagePaths = [...block.matchAll(/`(docs\/[^`]+\.(?:png|jpg|jpeg|webp))`/gi)].map((item) => item[1]);
      const imagePath = directImage || allImagePaths.at(-1) || "";
      const imageAlt = block.match(new RegExp(`<img[^>]+src="[^"]*${imagePath.split("/").at(-1)?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || ""}"[^>]+alt="([^"]+)"`, "i"))?.[1] || title;
      const metadata = parseMetadata(block);
      const prompt = block.match(/```(?:\w+)?\r?\n([\s\S]*?)```/)?.[1]?.trim() || "";
      if (!imagePath || !prompt) return null;

      const category = wuyoscarCategoryMap[metadata.sourceCategory] || wuyoscarCategoryMap[fileInfo.sourceCategory] || "Other Use Cases";
      const tagData = tagLabelsFor({ category, sourceCategory: metadata.sourceCategory, title, prompt });
      const sceneData = sceneLabelsFor({
        sourceCategory: metadata.sourceCategory,
        aspect: metadata.aspect,
        resolution: metadata.resolution,
        author: metadata.author
      });
      const featured = /Curated|OpenAI|poster|product|infographic|research|ui|brand|typography|packshot|mockup/i.test(
        `${metadata.author} ${metadata.sourceCategory} ${title}`
      );
      const score = scoreCase({ title, prompt, category, sourceCategory: metadata.sourceCategory, featured });

      return {
        id: 10000 + sourceNo,
        caseCode: `W${sourceNo}`,
        sourceCaseId: String(sourceNo),
        sourceId: "wuyoscar",
        sourceName: "gpt_image_2_skill",
        title,
        category,
        categoryLabel: categoryZh[category] || category,
        sourceCategory: metadata.sourceCategory,
        styles: tagData.styles,
        styleLabels: tagData.styleLabels,
        scenes: sceneData.scenes,
        sceneLabels: sceneData.sceneLabels,
        imageUrl: imageUrlFromPath(imagePath),
        imageAlt,
        prompt,
        promptPreview: promptPreview(prompt),
        promptKind: promptKind(prompt),
        sourceLabel: metadata.sourceLabel,
        sourceUrl: metadata.sourceUrl,
        githubUrl: `${wuyoscarRepo}/blob/main/skills/gpt-image/references/${fileInfo.file}#no-${sourceNo}`,
        featured,
        valueScore: score,
        valueTier: valueTier(score, featured),
        author: metadata.author,
        aspect: metadata.aspect,
        resolution: metadata.resolution,
        sourceNote: `${fileInfo.sourceCategory} · ${fileInfo.range}`
      };
    })
    .filter(Boolean);
}

async function importWuyoscar() {
  const index = await fetchText(`${wuyoscarReferences}/gallery.md`);
  const files = parseIndex(index);
  const imported = [];

  for (const fileInfo of files) {
    const markdown = await fetchText(`${wuyoscarReferences}/${fileInfo.file}`);
    imported.push(...parseGalleryFile(markdown, fileInfo));
  }

  return imported.sort((a, b) => a.id - b.id);
}

function cleanMarkdownInline(value = "") {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferEvolinkCategory(fileInfo, title, prompt) {
  const text = `${fileInfo.sourceCategory} ${title} ${prompt.slice(0, 600)}`.toLowerCase();
  if (/ui|ux|app|dashboard|interface|mockup|social media/.test(text)) return "UI & Interfaces";
  if (/product|e-commerce|ecommerce|skincare|bottle|packaging|ad creative|campaign|commercial|shop|watch|food/.test(text)) {
    return "Products & E-commerce";
  }
  if (/poster|typography|travel|album cover|cover|infographic storyboard|storyboard grid/.test(text)) return "Posters & Typography";
  if (/portrait|photography|photo|camera|fashion|editorial/.test(text)) return "Photography & Realism";
  if (/character|mascot|expression|turnaround/.test(text)) return "Characters & People";
  if (/diagram|infographic|chart|field guide|workflow|comparison/.test(text)) return "Charts & Infographics";
  return fileInfo.category;
}

function inferImage2StudioCategory(title, prompt, keywords = "") {
  const text = `${title} ${keywords} ${prompt.slice(0, 900)}`.toLowerCase();
  if (/ui|ux|app|dashboard|interface|browser|homepage|hud|menu|screen|mockup/.test(text)) return "UI & Interfaces";
  if (/product|packaging|skincare|food|bottle|commercial|advertis|ecommerce|shop/.test(text)) return "Products & E-commerce";
  if (/infographic|diagram|chart|timeline|educational|map|workflow/.test(text)) return "Charts & Infographics";
  if (/poster|typography|brochure|cover|social ad|billboard|editorial/.test(text)) return "Posters & Typography";
  if (/portrait|photo|photorealistic|camera|editorial fashion/.test(text)) return "Photography & Realism";
  if (/character|mascot|anime|comic|person|avatar/.test(text)) return "Characters & People";
  return "Other Use Cases";
}

function parseStructuredData(html) {
  return [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function parseImage2StudioLinks(html) {
  const links = [...html.matchAll(/href="((?:https:\/\/image2studio\.com)?\/en\/prompts\/[^"]+)"/gi)]
    .map((match) => new URL(match[1], image2studioSite).toString())
    .filter((url) => !url.includes("/use-case/") && !url.includes("/category/"));
  return [...new Set(links)];
}

function image2StudioImageUrl(creativeWork) {
  if (typeof creativeWork.image === "string") return creativeWork.image;
  return creativeWork.image?.contentUrl || creativeWork.image?.url || "";
}

async function importImage2Studio() {
  const useCaseHtml = await fetchText(image2studioUseCaseUrl);
  const promptLinks = parseImage2StudioLinks(useCaseHtml);
  const imported = [];

  for (const promptUrl of promptLinks) {
    const promptHtml = await fetchText(promptUrl);
    const creativeWork = parseStructuredData(promptHtml).find((item) => item?.["@type"] === "CreativeWork");
    const prompt = typeof creativeWork?.text === "string" ? creativeWork.text.trim() : "";
    const imageUrl = creativeWork ? image2StudioImageUrl(creativeWork) : "";
    const title = typeof creativeWork?.name === "string" ? creativeWork.name.trim() : "";
    const sourceUrl = typeof creativeWork?.url === "string" ? creativeWork.url : promptUrl;
    if (!title || !prompt || !imageUrl || !sourceUrl) continue;

    const ordinal = imported.length + 1;
    const category = inferImage2StudioCategory(title, prompt, String(creativeWork.keywords || ""));
    const sourceCategory = "Image2Studio App UI Mockup";
    const tagData = tagLabelsFor({ category, sourceCategory, title, prompt });
    const sceneData = sceneLabelsFor({
      sourceCategory,
      aspect: "",
      resolution: "",
      author: "Image2Studio"
    });
    const featured = /ui|mockup|dashboard|poster|infographic|browser|app|product/i.test(`${title} ${prompt.slice(0, 280)}`);
    const score = scoreCase({ title, prompt, category, sourceCategory, featured });

    imported.push({
      id: 34000 + ordinal,
      caseCode: `S${ordinal}`,
      sourceCaseId: new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1) || String(ordinal),
      sourceId: "image2studio",
      sourceName: "Image2Studio Prompt Library",
      title,
      category,
      categoryLabel: categoryZh[category] || category,
      sourceCategory,
      styles: tagData.styles,
      styleLabels: tagData.styleLabels,
      scenes: sceneData.scenes,
      sceneLabels: sceneData.sceneLabels,
      imageUrl,
      imageAlt: creativeWork.image?.name || title,
      prompt,
      promptPreview: promptPreview(prompt),
      promptKind: promptKind(prompt),
      sourceLabel: "Image2Studio prompt page",
      sourceUrl,
      githubUrl: "",
      featured,
      valueScore: score,
      valueTier: valueTier(score, featured),
      author: "Image2Studio",
      aspect: "",
      resolution: "",
      sourceNote: creativeWork.datePublished ? `Image2Studio prompt · Published ${creativeWork.datePublished}` : "Image2Studio prompt page",
      riskNote: "提示词模板可能含平台名、品牌名或角色变量；复用时先替换为自有主体和投放约束。",
      publishAngle: "适合从变量模板切入，快速改写成新的 UI、广告或信息图提示词。"
    });
  }

  return imported;
}

function parseEvolinkFile(markdown, fileInfo, globalStartIndex) {
  const matches = [...markdown.matchAll(/^###\s+Case\s+(\d+):\s+\[([^\]]+)\]\(([^)]+)\)\s*(?:\(by\s+(.+?)\))?\s*$/gm)];
  return matches
    .map((match, index) => {
      const start = match.index || 0;
      const end = matches[index + 1]?.index || markdown.length;
      const block = markdown.slice(start, end);
      const sourceCaseId = match[1];
      const title = match[2].replace(/\s+/g, " ").trim();
      const sourceUrl = match[3].trim();
      const author = cleanMarkdownInline(match[4] || "Unknown");
      const imageUrl = block.match(/https:\/\/raw\.githubusercontent\.com\/EvoLinkAI\/awesome-gpt-image-2-API-and-Prompts\/main\/images\/[^)"'>\s]+/i)?.[0] || "";
      const imageAlt =
        block.match(/<img[^>]+alt="([^"]+)"/i)?.[1] ||
        block.match(/!\[([^\]]+)\]\(https:\/\/raw\.githubusercontent\.com\/EvoLinkAI\/awesome-gpt-image-2-API-and-Prompts\/main\/images\//i)?.[1] ||
        title;
      const prompt = block.match(/\*\*Prompt:\*\*[\s\S]*?```(?:\w+)?\r?\n([\s\S]*?)```/)?.[1]?.trim() || "";
      if (!imageUrl || !prompt) return null;

      const category = inferEvolinkCategory(fileInfo, title, prompt);
      const tagData = tagLabelsFor({ category, sourceCategory: fileInfo.sourceCategory, title, prompt });
      const sceneData = sceneLabelsFor({
        sourceCategory: fileInfo.sourceCategory,
        aspect: "",
        resolution: "",
        author
      });
      const featured = /poster|product|ad|ui|storyboard|portrait|commercial|campaign|typography|infographic/i.test(
        `${fileInfo.sourceCategory} ${title}`
      );
      const score = scoreCase({ title, prompt, category, sourceCategory: fileInfo.sourceCategory, featured });
      const ordinal = globalStartIndex + index + 1;

      return {
        id: 20000 + ordinal,
        caseCode: `E${sourceCaseId}-${ordinal}`,
        sourceCaseId,
        sourceId: "evolink",
        sourceName: "EvoLinkAI Awesome",
        title,
        category,
        categoryLabel: categoryZh[category] || category,
        sourceCategory: fileInfo.sourceCategory,
        styles: tagData.styles,
        styleLabels: tagData.styleLabels,
        scenes: sceneData.scenes,
        sceneLabels: sceneData.sceneLabels,
        imageUrl,
        imageAlt,
        prompt,
        promptPreview: promptPreview(prompt),
        promptKind: promptKind(prompt),
        sourceLabel: author === "Unknown" ? "Original case source" : author,
        sourceUrl,
        githubUrl: `${evolinkRepo}/blob/main/cases/${fileInfo.file}#case-${sourceCaseId}`,
        featured,
        valueScore: score,
        valueTier: valueTier(score, featured),
        author,
        aspect: "",
        resolution: "",
        sourceNote: fileInfo.sourceCategory
      };
    })
    .filter(Boolean);
}

async function importEvolink() {
  const imported = [];
  for (const fileInfo of evolinkCaseFiles) {
    const markdown = await fetchText(`${evolinkCases}/${fileInfo.file}`);
    imported.push(...parseEvolinkFile(markdown, fileInfo, imported.length));
  }
  const seen = new Set();
  return imported.filter((item) => {
    const key = `${item.imageUrl}|${item.prompt.slice(0, 160)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackCasesFromExisting(existingPayload, sourceId) {
  return (existingPayload?.cases || []).filter((item) => item.sourceId === sourceId);
}

function requireExistingSource(existingPayload, sourceId) {
  const cases = fallbackCasesFromExisting(existingPayload, sourceId);
  if (!cases.length) throw new Error(`Offline import requires existing ${sourceId} cases.`);
  return cases;
}

async function importWithFallback({ sourceId, importFn, existingPayload }) {
  try {
    return await importFn();
  } catch (error) {
    const fallbackCases = fallbackCasesFromExisting(existingPayload, sourceId);
    if (fallbackCases.length > 0) {
      console.warn(
        `[image2] fallback to existing ${sourceId} cases after import failure: ${error instanceof Error ? error.message : String(error)}`
      );
      return fallbackCases;
    }
    throw error;
  }
}

function buildManualSourceEntries(manualPayload) {
  const manualCases = manualPayload?.cases || [];
  const sourceCounts = new Map();
  for (const item of manualCases) {
    sourceCounts.set(item.sourceId, (sourceCounts.get(item.sourceId) || 0) + 1);
  }
  return (manualPayload?.sources || []).map((source) => ({
    ...source,
    count: sourceCounts.get(source.id) || source.count || 0
  }));
}

function adaptCangheCase(item) {
  return {
    ...item,
    id: item.id,
    caseCode: `C${item.id}`,
    sourceCaseId: String(item.id),
    sourceId: "canghe",
    sourceName: "Canghe / awesome-gpt-image-2",
    sourceCategory: item.category,
    sourceNote: "gpt-image2.canghe.ai 镜像案例"
  };
}

function buildCategoryCounts(cases) {
  const counts = new Map();
  for (const item of cases) {
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: categoryZh[value] || value,
      count
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

const existingPayload = await readJsonIfExists(outputPath);
const manualPayload = await readJsonIfExists(manualCasesPath);
const canghePayload = JSON.parse(await readFile(canghePath, "utf-8"));
const cangheCases = canghePayload.cases.map(adaptCangheCase);
const wuyoscarCases = offlineMode
  ? requireExistingSource(existingPayload, "wuyoscar")
  : await importWithFallback({
      sourceId: "wuyoscar",
      importFn: importWuyoscar,
      existingPayload
    });
const existingEvolinkCases = (existingPayload?.cases || []).filter((item) => item.sourceId === "evolink");
const evolinkCasesImported = existingEvolinkCases.length
  ? existingEvolinkCases.map((item) => ({
      ...item,
      sourceName: "EvoLinkAI Awesome（存量归档）",
      sourceStatus: "archived",
      githubUrl: "",
      sourceNote: "EvoLinkAI 最后一次成功导入的存量案例；上游仓库已下线，原作者链接仍保留时优先回到原作者页面核查。"
    }))
  : await importEvolink();
const image2studioCases = offlineMode
  ? requireExistingSource(existingPayload, "image2studio")
  : await importWithFallback({
      sourceId: "image2studio",
      importFn: importImage2Studio,
      existingPayload
    });
const manualCases = (manualPayload?.cases || []).map((item) => ({
  ...item,
  promptPreview: item.promptPreview || promptPreview(item.prompt || ""),
  promptKind: item.promptKind || promptKind(item.prompt || ""),
  sourceName: item.sourceName || item.sourceId,
  featured: Boolean(item.featured),
  valueTier: item.valueTier || valueTier(item.valueScore || 70, item.featured)
}));
const cases = attachPromptFamilies(
  applyEditorialSpecificity(
    [...cangheCases, ...wuyoscarCases, ...evolinkCasesImported, ...image2studioCases, ...manualCases]
      .map(normalizeCasePromptMetadata)
      .map(withReuseFields)
      .map(withEditorialFields)
  )
)
  .sort((a, b) => b.valueScore - a.valueScore || a.id - b.id);
const manualSources = buildManualSourceEntries(manualPayload);

const sources = [
  {
    id: "canghe",
    label: "Canghe / awesome-gpt-image-2",
    site: "https://gpt-image2.canghe.ai",
    repository: "https://github.com/freestylefly/awesome-gpt-image-2",
    count: cangheCases.length,
    licenseNote:
      "上游项目为 MIT，但 README 说明第三方内容不保证可商用；这里仅做学习索引，商业使用前需确认原作者授权。"
  },
  {
    id: "wuyoscar",
    label: "gpt_image_2_skill Gallery Atlas",
    site: wuyoscarRepo,
    repository: wuyoscarRepo,
    count: wuyoscarCases.length,
    licenseNote:
      "结构化技能图库，保留 Author/Source/Cites 字段；引用、改写或商用时请回到原仓库和原作者来源核查授权。"
  },
  {
    id: "evolink",
    label: "EvoLinkAI Awesome GPT Image 2（存量归档）",
    site: "https://evolink.ai/gpt-image-2-prompts",
    repository: evolinkRepo,
    count: evolinkCasesImported.length,
    licenseNote:
      "上游仓库已下线，本库仅保留最后一次成功导入的存量记录；优先使用仍可访问的原作者链接，商用前必须重新核查授权。"
  },
  {
    id: "image2studio",
    label: "Image2Studio Prompt Library",
    site: image2studioUseCaseUrl,
    repository: image2studioUseCaseUrl,
    count: image2studioCases.length,
    licenseNote:
      "站点提供可编辑 prompt 模板与示例图；这里保留 prompt 页链接用于学习和改写，发布或商用前仍需回到原页核查授权边界。"
  },
  ...manualSources
];

const payload = {
  source: canghePayload.source,
  sources,
  importedAt: new Date().toISOString(),
  licenseNote: "多来源学习参考库：只用于分类、拆解、复刻练习；保留来源链接，不把第三方图片和提示词包装成自有素材。",
  totalCases: cases.length,
  categories: buildCategoryCounts(cases),
  styles: canghePayload.styles || [],
  scenes: canghePayload.scenes || [],
  sourceRadar: [...sourceRadar, ...(manualPayload?.sourceRadar || [])].filter(
    (item, index, list) => index === list.findIndex((candidate) => candidate.id === item.id)
  ),
  cases
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

console.log(
  JSON.stringify(
    {
      outputPath,
      totalCases: cases.length,
      sources: sources.map((source) => ({ id: source.id, count: source.count })),
      categories: payload.categories.length,
      radar: sourceRadar.length
    },
    null,
    2
  )
);
