import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

const wuyoscarCategoryMap = {
  "Anime & Manga": "Illustration & Art",
  Gaming: "Scenes & Storytelling",
  "Retro & Cyberpunk": "Illustration & Art",
  "Cinematic & Animation": "Scenes & Storytelling",
  "Character Design": "Characters & People",
  "Typography & Posters": "Posters & Typography",
  Illustration: "Illustration & Art",
  Watercolor: "Illustration & Art",
  "Ink & Chinese": "History & Classical Themes",
  "Pixel Art": "Illustration & Art",
  Isometric: "Illustration & Art",
  "Product & Food": "Products & E-commerce",
  "Brand Systems & Identity": "Brand & Logos",
  Photography: "Photography & Realism",
  "Infographics & Field Guides": "Charts & Infographics",
  "Research Paper Figures": "Charts & Infographics",
  "Official OpenAI Cookbook Examples": "Other Use Cases",
  "Edit Endpoint Showcase": "Other Use Cases",
  "UI/UX Mockups": "UI & Interfaces",
  "Data Visualization": "Charts & Infographics",
  "Technical Illustration": "Charts & Infographics",
  "Architecture & Interior": "Architecture & Spaces",
  "Scientific & Educational": "Charts & Infographics",
  "Fashion Editorial": "Photography & Realism",
  "Fine Art Painting": "Illustration & Art",
  "More Illustration Styles": "Illustration & Art",
  "Cinematic Film References": "Photography & Realism",
  "Beauty & Lifestyle": "Photography & Realism",
  "Events & Experience": "Scenes & Storytelling",
  "Tattoo Design": "Illustration & Art",
  "Screen Photography": "Photography & Realism"
};

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

function promptKind(prompt) {
  const trimmed = (prompt || "").trim();
  if (trimmed.startsWith("{") || /^\[\s*(?:\{|\[|"|-?\d)/.test(trimmed)) return "JSON/结构化";
  if (/英文版|English|Prompt:/i.test(trimmed)) return "中英混合";
  if (/^[\x00-\x7F\s.,:;'"!?()[\]{}<>/@#%&+-]+$/.test(trimmed.slice(0, 300))) return "英文";
  return "中文";
}

function promptPreview(prompt) {
  return (prompt || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function valueTier(score, featured) {
  if (featured || score >= 84) return "精选";
  if (score >= 70) return "高价值";
  return "可参考";
}

function scoreCase({ title, prompt, category, sourceCategory, featured }) {
  const text = `${title} ${sourceCategory} ${prompt.slice(0, 800)}`;
  const keywordBoost =
    /poster|typography|product|packshot|brand|logo|infographic|diagram|figure|workflow|ui|mockup|system|template|commercial|research|chart|包装|海报|品牌|产品|信息图|界面/i.test(
      text
    )
      ? 12
      : 0;
  const categoryBoost =
    {
      "Products & E-commerce": 22,
      "Charts & Infographics": 21,
      "Posters & Typography": 20,
      "UI & Interfaces": 19,
      "Brand & Logos": 18,
      "Photography & Realism": 16,
      "Characters & People": 15,
      "Architecture & Spaces": 14,
      "Illustration & Art": 14,
      "Scenes & Storytelling": 13,
      "History & Classical Themes": 13,
      "Other Use Cases": 11
    }[category] || 10;
  const promptBoost = prompt.length > 1200 ? 16 : prompt.length > 700 ? 13 : prompt.length > 320 ? 9 : 5;
  const curatedBoost = featured ? 14 : 0;
  return Math.max(42, Math.min(100, categoryBoost + keywordBoost + promptBoost + curatedBoost + 34));
}

function stripEmoji(label) {
  return label.replace(/[^\p{L}\p{N}&/ +()-]/gu, "").replace(/\s+/g, " ").trim();
}

function tagLabelsFor({ category, sourceCategory, title, prompt }) {
  const text = `${category} ${sourceCategory} ${title} ${prompt.slice(0, 600)}`.toLowerCase();
  const styles = [];
  const labels = [];

  const add = (value, label) => {
    if (!styles.includes(value)) {
      styles.push(value);
      labels.push(label);
    }
  };

  if (/json|config|schema/.test(text)) add("Structured", "结构化提示词");
  if (/poster|typography|headline|font|type/.test(text)) add("Poster", "海报排版");
  if (/product|packshot|food|beverage|box|bottle|commercial/.test(text)) add("Product", "商品商业图");
  if (/ui|ux|interface|dashboard|mockup|app/.test(text)) add("UI", "UI/界面");
  if (/infographic|diagram|workflow|chart|figure|research|paper/.test(text)) add("Infographic", "图表/信息图");
  if (/photo|portrait|camera|lens|film|cinematic|screen photography/.test(text)) add("Realistic", "摄影写实");
  if (/character|anime|manga|persona/.test(text)) add("Character", "人物角色");
  if (/brand|logo|identity/.test(text)) add("Brand", "品牌系统");
  if (/architecture|interior|room|building/.test(text)) add("Architecture", "建筑空间");
  if (styles.length === 0) add("Reference", "参考范式");

  return { styles, styleLabels: labels };
}

function sceneLabelsFor({ sourceCategory, aspect, resolution, author }) {
  const scenes = [];
  const labels = [];
  const add = (value, label) => {
    if (!scenes.includes(value)) {
      scenes.push(value);
      labels.push(label);
    }
  };

  add(sourceCategory, sourceCategory);
  if (aspect) add(aspect, aspect === "portrait" ? "竖图" : aspect === "landscape" ? "横图" : aspect);
  if (resolution) add(resolution, resolution);
  if (author && author !== "Unknown") add(`author:${author}`, author);
  return { scenes, sceneLabels: labels };
}

function promptStructureFor(item) {
  const text = `${item.title} ${item.prompt || ""}`.toLowerCase();
  const aspectHint =
    item.aspect === "portrait"
      ? "竖向主视觉，主体层级清楚，保留上下安全区"
      : item.aspect === "landscape"
        ? "横向布局，前中后景分层明确"
        : `${item.categoryLabel || item.category || "案例"}构图，主体优先，留出改写空间`;
  const textHint = /text|title|headline|copy|logo|label|typography|font|字|标题|文案|排版/.test(text)
    ? "只保留必要文字，指定层级、位置和可读留白"
    : "不强行加字，需要投放时预留文字安全区";

  return {
    subject: item.title,
    style: (item.styleLabels || []).slice(0, 3).join("、") || item.categoryLabel || item.category || "清晰可复用风格",
    composition: aspectHint,
    lighting: /light|lighting|shadow|sun|glow|studio|光|阴影|日光/.test(text)
      ? "沿用原提示词的光线方向、反差和氛围"
      : "光线服务主体识别、材质层次和画面焦点",
    materials: /glass|metal|paper|stone|fabric|texture|wood|plastic|marble|材质|纹理|纸|金属|玻璃/.test(text)
      ? "保留关键材质、表面纹理与边缘细节"
      : "补足主体材质、背景表面和细节可信度",
    text: textHint
  };
}

function reuseProfileFor(item) {
  const text = `${item.title} ${item.prompt || ""} ${item.riskNote || ""}`.toLowerCase();
  const hasBrandRisk = /(?:\b(?:brand|logo|marvel|openai|youtube|meta|spider|ip)\b|品牌|商标|reference_)/.test(text);
  const hasStructuredPrompt = item.promptKind === "JSON/结构化" || /^\s*[\[{]/.test(item.prompt || "");
  const hasSource = Boolean(item.sourceUrl);
  const sourceConfidence = item.sourceStatus === "archived" ? "存量归档" : hasSource ? "来源可追溯" : "来源待核查";
  const directReuse = !hasBrandRisk && (hasStructuredPrompt || (item.prompt || "").length >= 260);

  if (directReuse) {
    return {
      verdict: "direct",
      label: "可直接改写",
      difficulty: hasStructuredPrompt ? "结构清楚" : "轻改可用",
      stability: hasStructuredPrompt ? "高" : "中",
      sourceConfidence,
      note: "主体和变量替换后即可进入生成验证。"
    };
  }

  if (hasBrandRisk || (item.riskNote || "").trim()) {
    return {
      verdict: "study",
      label: "适合拆解",
      difficulty: hasBrandRisk ? "先去品牌" : "需改边界",
      stability: hasStructuredPrompt ? "中高" : "中",
      sourceConfidence,
      note: "先吸收构图和提示词结构，再替换来源资产与敏感元素。"
    };
  }

  return {
    verdict: "inspiration",
    label: "灵感参考",
    difficulty: "需补变量",
    stability: "待验证",
    sourceConfidence,
    note: "更适合作为方向卡片，生成前先补主体和输出约束。"
  };
}

function replicationGuideFor(item) {
  const text = `${item.title || ""} ${item.prompt || ""} ${item.category || ""}`.toLowerCase();
  const isEdit = /reference image|uploaded image|input image|provided image|based on the (?:uploaded|provided)|keep the subject|replace the background only|参考图|上传图片|输入图片|保持人物|保留主体|只替换背景/.test(text);
  const hasText = /typography|headline|title|caption|label|logo|word|text|font|排版|标题|文案|文字|字体|标识/.test(text);
  const hasIdentity = /face|identity|facial|same person|recognizable|人物一致|身份一致|脸部|面部|五官/.test(text);
  const hasLayout = /ui|interface|dashboard|app|website|wireframe|mockup|layout|界面|仪表盘|网页|布局/.test(text);
  const hasProduct = item.category === "Products & E-commerce" || /product|packshot|packaging|bottle|box|商品|产品|包装/.test(text);

  const categoryGuides = {
    "UI & Interfaces": {
      bestFor: "产品概念稿、网页/App 界面方向探索和演示型高保真 Mockup",
      variables: ["产品类型与目标用户", "页面模块和信息层级", "品牌色与组件风格", "设备尺寸与展示场景"],
      fixed: ["先锁定页面层级，再改视觉风格", "同一组件保持间距、圆角和字体规则一致"],
      checks: ["导航、标题、主操作按钮层级清楚", "关键文字可读且没有乱码", "组件尺寸与对齐关系可信"],
      failures: ["一次要求过多页面导致布局互相污染", "只写“高级 UI”但没有模块和状态说明"]
    },
    "Charts & Infographics": {
      bestFor: "知识解释图、流程图、数据摘要、研究图示和信息密度较高的视觉内容",
      variables: ["主题与核心结论", "信息分组和阅读顺序", "图表/图标类型", "配色与版式比例"],
      fixed: ["先保证信息结构正确，再追求装饰风格", "每个区域只承担一个清晰的信息任务"],
      checks: ["阅读顺序从标题到结论自然", "数字、标签和图例互相对应", "缩小后仍能识别核心结论"],
      failures: ["信息量超过画面容量造成小字和乱码", "没有指定事实层级，模型自行编造数据"]
    },
    "Posters & Typography": {
      bestFor: "活动海报、社媒封面、城市/品牌主视觉和需要明确文字层级的单页设计",
      variables: ["主标题与副标题", "主体对象或地标", "主色与情绪", "版式比例和留白区域"],
      fixed: ["主标题位置、视觉焦点和阅读顺序不要同时改动", "文字区域与主体轮廓保持安全距离"],
      checks: ["主标题拼写准确且第一眼可读", "主体与文字没有争抢焦点", "边缘留白满足裁切和投放需要"],
      failures: ["同时要求太多文案导致错字", "风格词堆叠但缺少明确构图"]
    },
    "Products & E-commerce": {
      bestFor: "商品主图、详情页视觉、广告素材、包装展示和社媒种草配图",
      variables: ["商品品类与核心卖点", "背景场景与道具", "镜头角度和画幅", "品牌色与投放文案"],
      fixed: ["商品外形、标签位置和关键卖点必须保持", "光源方向与接触阴影需要一致"],
      checks: ["商品轮廓和包装结构没有变形", "材质、反光和接触阴影可信", "卖点在手机端仍能看清"],
      failures: ["参考图约束不足导致换包装或改 Logo", "道具过多抢走商品焦点"]
    },
    "Photography & Realism": {
      bestFor: "人物写真、生活方式摄影、商业摄影方向稿和写实场景氛围测试",
      variables: ["人物/主体特征", "地点和时间", "镜头焦段与机位", "光线、色调和情绪"],
      fixed: ["人物身份、身体结构和主光方向优先锁定", "真实摄影只保留一种主要镜头语言"],
      checks: ["脸、手、肢体和透视自然", "景深与焦点位置符合镜头描述", "皮肤、布料和环境材质不过度塑料化"],
      failures: ["人物描述互相冲突导致身份漂移", "同时使用多种镜头和光线造成画面失真"]
    },
    "Characters & People": {
      bestFor: "角色设定、人物转面、服装探索、IP 形象和表情/动作设计",
      variables: ["角色身份和年龄", "服装与道具", "表情、姿态和视角", "世界观与美术风格"],
      fixed: ["标志性五官、发型和服装识别点保持一致", "多视图时统一比例、材质和色板"],
      checks: ["不同视图仍是同一角色", "手部、服装结构和道具连接合理", "角色轮廓在缩略图中仍可辨认"],
      failures: ["角色特征太多且互相矛盾", "只强调风格，没有锁定身份锚点"]
    },
    "Architecture & Spaces": {
      bestFor: "室内外概念、空间改造、建筑氛围和材质/灯光方案探索",
      variables: ["空间类型与功能", "建筑/室内风格", "材质组合", "时间、天气和照明方案"],
      fixed: ["空间动线、门窗位置和主透视关系保持", "材质尺度与实际施工逻辑一致"],
      checks: ["透视、尺度和结构关系可信", "主材与辅材层次清楚", "照明能够解释空间功能"],
      failures: ["只堆材质名导致空间功能不清", "机位和空间尺寸没有约束造成畸变"]
    }
  };

  const fallback = {
    bestFor: "视觉方向探索、提示词结构学习和可控变量改写",
    variables: ["主体与动作", "风格和色板", "构图与画幅", "光线、材质和细节密度"],
    fixed: ["每轮只改变一到两个关键变量", "保留原案例最主要的视觉关系和输出约束"],
    checks: ["主体一眼可辨", "构图、风格和光线没有互相冲突", "输出满足实际使用尺寸"],
    failures: ["直接整段照搬导致主体或品牌不适用", "一次替换过多变量，无法判断失败原因"]
  };
  const guide = categoryGuides[item.category] || fallback;
  const namedVariables = [...String(item.prompt || "").matchAll(/(?:\{argument name=["']?([^"'}]+)|\[([A-Z][A-Z0-9_ ]{2,})\])/gi)]
    .map((match) => (match[1] || match[2] || "").trim())
    .filter(Boolean)
    .slice(0, 4);
  const variables = [...new Set([...namedVariables, ...guide.variables])].slice(0, 5);
  const requiredInputs = isEdit
    ? [hasIdentity ? "1 张清晰人物参考图，脸部无遮挡" : hasProduct ? "1 张主体完整、边缘清楚的商品参考图" : "1 张构图和主体清楚的参考图", "明确写出允许改变与必须保留的部分"]
    : hasProduct
      ? ["商品名称、外形和核心卖点", "目标渠道、画幅与文案安全区"]
      : ["主体、用途和目标画幅", "期望风格以及必须避免的元素"];
  const verification = [...guide.checks];
  if (hasText && !verification.some((item) => /文字|标题|拼写/.test(item))) verification.push("逐字检查标题、标签、数字和品牌拼写");
  if (hasIdentity && !verification.some((item) => /身份|同一|脸/.test(item))) verification.push("对照参考图检查人物身份和关键五官");
  if (hasLayout && !verification.some((item) => /组件|对齐|层级/.test(item))) verification.push("检查组件层级、对齐、间距和交互状态是否一致");

  return {
    workflow: isEdit ? "参考图编辑" : "文本生成",
    bestFor: guide.bestFor,
    requiredInputs,
    editableVariables: variables,
    keepFixed: guide.fixed,
    verification: verification.slice(0, 4),
    failureWatchouts: guide.failures
  };
}

function editorialProfileFor(item) {
  const prompt = String(item.prompt || "");
  const text = prompt.toLowerCase();
  const promptLength = prompt.length;
  const hasStructuredPrompt =
    item.promptKind === "JSON/结构化" || /^\s*\{/.test(prompt) || /^\s*\[\s*(?:\{|\[|"|-?\d)/.test(prompt);
  const hasLiveSource = Boolean(item.sourceUrl || item.githubUrl) && item.sourceStatus !== "archived";
  const hasVariables = [...prompt.matchAll(/(?:\{argument name=["']?([^"'}]+)|\[([A-Z][A-Z0-9_ ]{2,})\])/gi)].length >= 2;
  const hasControlLanguage = /avoid|do not|no text|keep|preserve|must|不要|避免|保留|必须/.test(text);
  const hasOutputConstraint = /\b(?:9:16|16:9|4:5|3:2|1:1|1024|1536|4k|8k|aspect ratio)\b/.test(text);
  const hasBrandRisk = /(?:\b(?:brand|logo|marvel|nike|youtube|meta|spider|ip)\b|品牌|商标)/.test(text);
  const strengths = [];
  const cautions = [];
  let score = 48;

  score += promptLength < 80 ? -20 : promptLength < 160 ? -10 : promptLength < 320 ? 0 : promptLength < 700 ? 7 : promptLength < 1400 ? 12 : 10;
  score += item.sourceUrl ? 8 : item.githubUrl ? 5 : -8;
  if (item.sourceStatus === "archived") score -= 10;
  if (hasStructuredPrompt) score += 10;
  else if (item.promptKind === "中英混合") score += 4;
  score += item.reuseProfile?.verdict === "direct" ? 8 : item.reuseProfile?.verdict === "study" ? 4 : 0;
  if (item.replicationGuide) score += 4;
  if (hasVariables) score += 5;
  if (hasControlLanguage) score += 4;
  if (hasOutputConstraint) score += 3;
  if (hasBrandRisk) score -= 3;
  if (item.sourceId === "wuyoscar") score += 3;
  if (item.sourceId === "image2studio") score += 2;

  if (promptLength >= 700) strengths.push("提示词完整");
  else if (promptLength >= 320) strengths.push("描述较完整");
  if (hasStructuredPrompt || hasVariables) strengths.push("变量结构清楚");
  if (hasLiveSource) strengths.push("来源可核查");
  if (item.reuseProfile?.verdict === "direct") strengths.push("可直接改写");
  if (hasControlLanguage || hasOutputConstraint) strengths.push("输出约束明确");

  if (promptLength < 160) cautions.push("提示词偏短");
  if (!item.sourceUrl && !item.githubUrl) cautions.push("来源待核查");
  if (item.sourceStatus === "archived") cautions.push("上游已归档");
  if (hasBrandRisk) cautions.push("含品牌或 IP 元素");
  if (!hasControlLanguage && !hasOutputConstraint) cautions.push("需补输出约束");

  score = Math.max(35, Math.min(98, score));
  if (item.sourceStatus === "archived") score = Math.min(79, score);
  const tier = score >= 88 ? "精选" : score >= 72 ? "高价值" : "可参考";

  return {
    score,
    tier,
    strengths: strengths.slice(0, 4),
    cautions: cautions.slice(0, 3),
    basis: "提示词完整度、变量结构、输出约束、来源状态与复用难度"
  };
}

function normalizePromptFamily(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function promptFamilyId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `PF-${(hash >>> 0).toString(36).toUpperCase()}`;
}

function attachPromptFamilies(items) {
  const groups = new Map();
  for (const item of items) {
    const key = normalizePromptFamily(item.prompt);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    if (!key || group.length < 2) continue;
    group.sort((left, right) => {
      const archiveDelta = Number(left.sourceStatus === "archived") - Number(right.sourceStatus === "archived");
      if (archiveDelta) return archiveDelta;
      const scoreDelta = (right.editorialProfile?.score || 0) - (left.editorialProfile?.score || 0);
      if (scoreDelta) return scoreDelta;
      const sourceDelta = Number(Boolean(right.sourceUrl || right.githubUrl)) - Number(Boolean(left.sourceUrl || left.githubUrl));
      if (sourceDelta) return sourceDelta;
      return left.id - right.id;
    });
    const familyId = promptFamilyId(key);
    group.forEach((item, index) => {
      item.promptFamily = {
        id: familyId,
        size: group.length,
        primary: index === 0,
        variantIndex: index + 1
      };
    });
  }

  return items;
}

function applyEditorialSpecificity(items) {
  const titleCounts = new Map();
  for (const item of items) {
    const title = String(item.title || "").trim();
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }
  const genericTitlePattern = /^(综合应用场景图|人物角色设定图|封面排版设计图|主题海报版式设计|电商商品展示设计|信息图可视化设计|绘画艺术风格图|建筑空间场景图|界面交互设计图|应用界面样机图|品牌徽标设计图|古风历史题材图|产品视觉展示图|摄影写实场景图|漫画分镜叙事设计)$/;

  return items.map((item) => {
    const title = String(item.title || "").trim();
    const genericPenalty = genericTitlePattern.test(title) ? 7 : 0;
    const repeatedPenalty = (titleCounts.get(title) || 0) > 2 ? 5 : 0;
    if (!genericPenalty && !repeatedPenalty) return item;

    const score = Math.max(35, item.editorialProfile.score - genericPenalty - repeatedPenalty);
    const tier = score >= 88 ? "精选" : score >= 72 ? "高价值" : "可参考";
    const cautions = [...new Set([...(item.editorialProfile.cautions || []), "标题区分度较低"])].slice(0, 3);
    return {
      ...item,
      editorialProfile: {
        ...item.editorialProfile,
        score,
        tier,
        cautions
      },
      featured: tier === "精选",
      valueScore: score,
      valueTier: tier
    };
  });
}

function withReuseFields(item) {
  return {
    ...item,
    promptStructure: item.promptStructure || promptStructureFor(item),
    reuseProfile: reuseProfileFor(item),
    replicationGuide: item.replicationGuide || replicationGuideFor(item)
  };
}

function normalizeCasePromptMetadata(item) {
  return {
    ...item,
    promptKind: promptKind(item.prompt || ""),
    promptPreview: promptPreview(item.prompt || "")
  };
}

function withEditorialFields(item) {
  const editorialProfile = editorialProfileFor(item);
  return {
    ...item,
    editorialProfile,
    featured: editorialProfile.tier === "精选",
    valueScore: editorialProfile.score,
    valueTier: editorialProfile.tier
  };
}

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
