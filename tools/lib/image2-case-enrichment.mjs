// Image2 案例库增强模块：分类中文名、标签、复刻指南、复用建议与编辑评分。
// 由 tools/import-image2-case-library.mjs 与 tools/sync-image2-source-adapters.mjs 共同导入；本文件是唯一实现。
// 修改评分或指南规则时只改这里，避免两份逻辑漂移。

export const categoryZh = {
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

export const wuyoscarCategoryMap = {
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

export function promptKind(prompt) {
  const trimmed = (prompt || "").trim();
  if (trimmed.startsWith("{") || /^\[\s*(?:\{|\[|"|-?\d)/.test(trimmed)) return "JSON/结构化";
  if (/英文版|English|Prompt:/i.test(trimmed)) return "中英混合";
  if (/^[\x00-\x7F\s.,:;'"!?()[\]{}<>/@#%&+-]+$/.test(trimmed.slice(0, 300))) return "英文";
  return "中文";
}

export function promptPreview(prompt) {
  return (prompt || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

export function valueTier(score, featured) {
  if (featured || score >= 84) return "精选";
  if (score >= 70) return "高价值";
  return "可参考";
}

export function scoreCase({ title, prompt, category, sourceCategory, featured }) {
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

export function stripEmoji(label) {
  return label.replace(/[^\p{L}\p{N}&/ +(),.-]/gu, "").replace(/\s+/g, " ").trim();
}

export function tagLabelsFor({ category, sourceCategory, title, prompt }) {
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

export function sceneLabelsFor({ sourceCategory, aspect, resolution, author }) {
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

export function promptStructureFor(item) {
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

export function reuseProfileFor(item) {
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

export function replicationGuideFor(item) {
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
  const namedVariables = [...String(item.prompt || "").matchAll(/(?:\{argument name=["']?([^"'}\\]+)|\[([A-Z][A-Z0-9_ ]{2,})\])/gi)]
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

export function editorialProfileFor(item) {
  const prompt = String(item.prompt || "");
  const text = prompt.toLowerCase();
  const promptLength = prompt.length;
  const hasStructuredPrompt =
    item.promptKind === "JSON/结构化" || /^\s*\{/.test(prompt) || /^\s*\[\s*(?:\{|\[|"|-?\d)/.test(prompt);
  const hasLiveSource = Boolean(item.sourceUrl || item.githubUrl) && item.sourceStatus !== "archived";
  const hasVariables = [...prompt.matchAll(/(?:\{argument name=["']?([^"'}\\]+)|\[([A-Z][A-Z0-9_ ]{2,})\])/gi)].length >= 2;
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

export function normalizePromptFamily(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function promptFamilyId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `PF-${(hash >>> 0).toString(36).toUpperCase()}`;
}

export function attachPromptFamilies(items) {
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

export function applyEditorialSpecificity(items) {
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

export function withReuseFields(item) {
  return {
    ...item,
    promptStructure: item.promptStructure || promptStructureFor(item),
    reuseProfile: reuseProfileFor(item),
    replicationGuide: item.replicationGuide || replicationGuideFor(item)
  };
}

export function normalizeCasePromptMetadata(item) {
  return {
    ...item,
    promptKind: promptKind(item.prompt || ""),
    promptPreview: promptPreview(item.prompt || "")
  };
}

export function withEditorialFields(item) {
  const editorialProfile = editorialProfileFor(item);
  return {
    ...item,
    editorialProfile,
    featured: editorialProfile.tier === "精选",
    valueScore: editorialProfile.score,
    valueTier: editorialProfile.tier
  };
}
