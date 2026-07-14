const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const image2Base = normalizeBase(args.get("image2-base") ?? "https://image2.lsb0713.online");
const sceneBase = normalizeBase(args.get("scene-base") ?? "https://scene.lsb0713.online");
const pictureBase = normalizeBase(args.get("picture-base") ?? "https://picture.lsb0713.online");
const pictureHost = args.get("picture-host") ?? "";
const timeoutMs = Number(args.get("timeout-ms") ?? 25000);
const image2Forbidden = ["场景引擎", "白底商品图", "场景配方库", "ScenePlus"];
const pictureForbidden = ["image2", "Image2", "ikun", "IKUN", "runninghub", "RunningHub", "场景引擎", "案例库"];
const pictureRequired = ["AI 制图台", "文生图", "图生图", "智能改图", "高速通道", "稳定通道", "1k", "2k", "4k", "上传", "下载", "放大"];
const pictureInit = pictureHost ? { headers: { "x-forwarded-host": pictureHost } } : {};

const checks = [];

function normalizeBase(value) {
  return String(value).replace(/\/+$/, "");
}

function urlFor(base, path) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFrom(html) {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
}

async function request(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect: "follow",
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "seedance2-image2-domain-smoke/1.0",
        ...(init.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function pass(label, detail) {
  checks.push({ label, ok: true, detail });
  console.log(`[ok] ${label}${detail ? ` - ${detail}` : ""}`);
}

function fail(label, detail) {
  checks.push({ label, ok: false, detail });
  console.error(`[fail] ${label}${detail ? ` - ${detail}` : ""}`);
}

function assertIncludesAny(label, text, values) {
  const matched = values.find((value) => text.includes(value));
  if (!matched) {
    throw new Error(`missing one of: ${values.join(" / ")}`);
  }
  pass(label, `matched "${matched}"`);
}

function assertIncludesAll(label, text, values) {
  const missing = values.filter((value) => !text.includes(value));
  if (missing.length) {
    throw new Error(`missing: ${missing.join(" / ")}`);
  }
  pass(label, `matched ${values.length} required markers`);
}

function assertExcludes(label, text, values) {
  const matched = values.filter((value) => text.includes(value));
  if (matched.length) {
    throw new Error(`unexpected markers: ${matched.join(" / ")}`);
  }
  pass(label, `excluded ${values.length} forbidden markers`);
}

function assertHeaderIncludes(label, response, headerName, expected) {
  const value = response.headers.get(headerName) ?? "";
  if (!value.includes(expected)) {
    throw new Error(`expected ${headerName} to include "${expected}", got "${value || "[missing]"}"`);
  }
  pass(label, `${headerName}: ${value}`);
}

async function smokePage({ label, url, requiredAny = [], requiredAll = [], forbidden = [], init }) {
  const response = await request(url, init);
  const html = await response.text();
  const title = titleFrom(html);
  const text = `${title} ${stripHtml(html)}`;
  const finalUrl = response.url;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  pass(`${label} status`, `${response.status} ${url}`);

  if (requiredAny.length) {
    assertIncludesAny(`${label} required marker`, text, requiredAny);
  }

  if (requiredAll.length) {
    assertIncludesAll(`${label} required markers`, text, requiredAll);
  }

  if (forbidden.length) {
    assertExcludes(`${label} forbidden markers`, text, forbidden);
  }

  return { finalUrl, title, text };
}

async function smokeStatus({ label, url, expectedStatus, init }) {
  const response = await request(url, init);
  const body = await response.text().catch(() => "");

  if (response.status !== expectedStatus) {
    throw new Error(`expected HTTP ${expectedStatus}, got ${response.status}; body: ${body.slice(0, 240)}`);
  }

  pass(label, `HTTP ${response.status}`);
}

async function smokePictureConfig({ label, url, init }) {
  const response = await request(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}; body: ${body.slice(0, 240)}`);
  }

  const config = JSON.parse(body);
  if (config.provider !== "picture") {
    throw new Error(`expected provider "picture", got ${JSON.stringify(config.provider)}`);
  }
  assertExcludes(`${label} forbidden markers`, body, pictureForbidden);
  assertIncludesAll(`${label} ratios`, JSON.stringify(config.ratios ?? []), ["1:1", "3:4", "9:16", "16:9"]);
  assertIncludesAll(`${label} resolutions`, JSON.stringify(config.resolutions ?? []), ["1k", "2k", "4k"]);
  assertIncludesAll(`${label} public channels`, JSON.stringify(Object.keys(config.channels ?? {})), ["auto", "fast", "stable"]);
}

async function smokeCachedStatus({ label, url, expectedStatus, init }) {
  const response = await request(url, { ...init, method: "HEAD" });

  if (response.status !== expectedStatus) {
    throw new Error(`expected HTTP ${expectedStatus}, got ${response.status}`);
  }

  pass(`${label} status`, `HTTP ${response.status}`);
  assertHeaderIncludes(`${label} cache`, response, "cache-control", "max-age=31536000");
}

async function runCheck(label, fn) {
  try {
    await fn();
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

await runCheck("image2 root is case library", async () => {
  await smokePage({
    label: "image2 root",
    url: urlFor(image2Base, "/"),
    requiredAny: ["Image2 案例库", "Image2 案例灵感库", "Prompt Atlas"],
    forbidden: image2Forbidden
  });
});

await runCheck("image2 cases are case library", async () => {
  await smokePage({
    label: "image2 cases",
    url: urlFor(image2Base, "/image2-cases"),
    requiredAny: ["Image2 案例灵感库", "Image2 案例库", "从爆款图到可复刻提示词"],
    forbidden: image2Forbidden
  });
});

await runCheck("image2 workbench is case-library workbench", async () => {
  await smokePage({
    label: "image2 workbench",
    url: urlFor(image2Base, "/workbench"),
    requiredAny: ["Image2 作图中控台", "动作迁移首帧生产线", "流程工作台"],
    forbidden: image2Forbidden
  });
});

await runCheck("image2 admin hub is case-library admin", async () => {
  await smokePage({
    label: "image2 admin",
    url: urlFor(image2Base, "/admin"),
    requiredAny: ["Image2 后台", "案例库运营入口"],
    forbidden: image2Forbidden
  });
});

await runCheck("image2 admin cases is case-library ops entry", async () => {
  await smokePage({
    label: "image2 admin cases",
    url: urlFor(image2Base, "/admin/image2-cases"),
    requiredAny: ["Image2 案例库运营入口", "案例库展示"],
    forbidden: image2Forbidden
  });
});

await runCheck("image2 auth callback keeps Image2 account brand", async () => {
  await smokePage({
    label: "image2 auth callback",
    url: urlFor(image2Base, "/auth/callback"),
    requiredAny: ["Image2 账号", "邮箱验证", "正在验证邮箱链接"],
    forbidden: image2Forbidden
  });
});

await runCheck("image2 gacha keeps case-library brand", async () => {
  await smokePage({
    label: "image2 gacha",
    url: urlFor(image2Base, "/image2-cases/gacha"),
    requiredAny: ["Image2 同款抽卡", "Image2 案例库同款抽卡", "从收藏图里抽出下一张高分图"],
    forbidden: image2Forbidden
  });
});

await runCheck("image2 social-commerce route is isolated", async () => {
  const { finalUrl } = await smokePage({
    label: "image2 social-commerce isolation",
    url: urlFor(image2Base, "/image2-social-commerce"),
    requiredAny: ["Image2 案例灵感库", "Image2 案例库", "从爆款图到可复刻提示词"],
    forbidden: image2Forbidden
  });

  if (!new URL(finalUrl).pathname.startsWith("/image2-cases")) {
    throw new Error(`expected redirect to /image2-cases, got ${finalUrl}`);
  }
  pass("image2 social-commerce final path", finalUrl);
});

await runCheck("scene root is commercial site", async () => {
  const { finalUrl } = await smokePage({
    label: "scene root",
    url: urlFor(sceneBase, "/"),
    requiredAll: ["场景引擎", "白底商品图"],
    forbidden: ["ScenePlus"]
  });

  if (new URL(finalUrl).hostname !== "scene.lsb0713.online") {
    throw new Error(`expected scene root to stay on scene host, got ${finalUrl}`);
  }
  pass("scene root final host", finalUrl);
});

await runCheck("scene workbench is commercial workbench", async () => {
  const { finalUrl } = await smokePage({
    label: "scene workbench",
    url: urlFor(sceneBase, "/workbench"),
    requiredAll: ["AI 创作工作台", "上传商品"],
    forbidden: ["ScenePlus"]
  });

  if (new URL(finalUrl).hostname !== "scene.lsb0713.online") {
    throw new Error(`expected scene workbench to stay on scene host, got ${finalUrl}`);
  }
  pass("scene workbench final host", finalUrl);
});

await runCheck("scene auth callback stays on scene domain", async () => {
  const { finalUrl } = await smokePage({
    label: "scene auth callback",
    url: urlFor(sceneBase, "/auth/callback"),
    requiredAny: ["场景引擎账号", "邮箱验证", "邮箱链接缺少登录令牌"],
    forbidden: ["ScenePlus"]
  });

  if (new URL(finalUrl).hostname !== "scene.lsb0713.online") {
    throw new Error(`expected scene auth callback to stay on scene host, got ${finalUrl}`);
  }
  pass("scene auth callback final host", finalUrl);
});

await runCheck("scene social-commerce route is commercial site", async () => {
  await smokePage({
    label: "scene social-commerce",
    url: urlFor(sceneBase, "/image2-social-commerce"),
    requiredAll: ["场景引擎", "白底商品图"],
    forbidden: ["ScenePlus"]
  });
});

await runCheck("scene case-library route returns to image2 domain", async () => {
  const response = await request(urlFor(sceneBase, "/image2-cases"));
  const finalUrl = response.url;
  const html = await response.text();
  const text = `${titleFrom(html)} ${stripHtml(html)}`;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const final = new URL(finalUrl);
  if (final.hostname !== "image2.lsb0713.online" || !final.pathname.startsWith("/image2-cases")) {
    throw new Error(`expected image2 case library redirect, got ${finalUrl}`);
  }

  assertIncludesAny("scene case-library final marker", text, ["Image2 案例灵感库", "Image2 案例库", "从爆款图到可复刻提示词"]);
  assertExcludes("scene case-library forbidden markers", text, image2Forbidden);
  pass("scene case-library final url", finalUrl);
});

await runCheck("picture root is public studio", async () => {
  await smokePage({
    label: "picture root",
    url: urlFor(pictureBase, "/"),
    requiredAll: pictureRequired,
    forbidden: pictureForbidden,
    init: pictureInit
  });
});

await runCheck("picture workbench is public studio", async () => {
  await smokePage({
    label: "picture workbench",
    url: urlFor(pictureBase, "/workbench"),
    requiredAll: ["AI 制图台", "生成通道", "画面比例", "分辨率", "随机种子", "开始生成"],
    forbidden: pictureForbidden,
    init: pictureInit
  });
});

await runCheck("picture API exposes public config only", async () => {
  await smokePictureConfig({
    label: "picture API",
    url: urlFor(pictureBase, "/api/picture"),
    init: pictureInit
  });
});

await runCheck("picture legacy config alias is public on picture host", async () => {
  await smokePictureConfig({
    label: "picture legacy config alias",
    url: urlFor(pictureBase, "/api/image2"),
    init: pictureInit
  });
});

await runCheck("picture output route is cached", async () => {
  await smokeCachedStatus({
    label: "picture output route",
    url: urlFor(pictureBase, "/api/image2/output/example/nonexistent.png"),
    expectedStatus: 404,
    init: pictureInit
  });
});

await runCheck("entitlements unauthenticated returns 401", async () => {
  await smokeStatus({
    label: "image2 entitlements unauthenticated",
    url: urlFor(image2Base, "/api/image2/entitlements"),
    expectedStatus: 401
  });
});

await runCheck("short prompt returns 400", async () => {
  await smokeStatus({
    label: "image2 short prompt",
    url: urlFor(image2Base, "/api/image2"),
    expectedStatus: 400,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "短" })
    }
  });
});

const failed = checks.filter((item) => !item.ok);

if (failed.length) {
  console.error(`Image2 domain smoke failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Image2 domain smoke passed: ${checks.length}/${checks.length} checks passed.`);
