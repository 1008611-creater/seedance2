// 支持 --key=value 与 --key value 两种写法；不带值的开关仍解析为 "true"。
const args = new Map();
const argv = process.argv.slice(2);

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (!arg.startsWith("--")) {
    continue;
  }

  const [key, ...rest] = arg.slice(2).split("=");
  if (rest.length) {
    args.set(key, rest.join("="));
    continue;
  }

  const next = argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    index += 1;
    continue;
  }

  args.set(key, "true");
}

const image2Base = normalizeBase(args.get("image2-base") ?? "https://image2.cauai.fun");
const sceneBase = normalizeBase(args.get("scene-base") ?? "https://scene.lsb0713.online");
const pictureBase = normalizeBase(args.get("picture-base") ?? "https://picture.lsb0713.online");
const pictureHost = args.get("picture-host") ?? "";
const timeoutMs = Number(args.get("timeout-ms") ?? 25000);
const image2Forbidden = ["场景引擎", "白底商品图", "场景配方库", "ScenePlus"];
const pictureForbidden = ["image2", "Image2", "ikun", "IKUN", "runninghub", "RunningHub", "场景引擎", "案例库"];
const pictureRequired = ["AI 制图台", "文生图", "图生图", "智能改图", "高速通道", "稳定通道", "1k", "2k", "4k", "上传", "下载", "放大"];
const pictureInit = pictureHost ? { headers: { "x-forwarded-host": pictureHost } } : {};

// 旧域名迁移 / SEO 分段：--only=legacy,seo 可只跑新增断言，默认跑全部。
// 旧域默认打线上域名；本地验收用 --legacy-host 覆盖 Host（走 x-forwarded-host）。
const legacyBase = normalizeBase(args.get("legacy-base") ?? "https://image2.lsb0713.online");
// 旧域 308 的目标站点：--image2-base 指向本地服务时，用它断言 Location 指向新域。
const image2PublicBase = normalizeBase(args.get("image2-public-base") ?? "https://image2.cauai.fun");
const legacyHost = args.get("legacy-host") ?? "";
const image2Host = args.get("image2-host") ?? "";
const sceneHost = args.get("scene-host") ?? "";
const onlySections = new Set(
  String(args.get("only") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const knownSections = new Set(["core", "legacy", "seo"]);
const legacyHostnames = new Set(["image2.lsb0713.online", "ai.lsb0713.online"]);
legacyHostnames.add(new URL(legacyBase).hostname);
if (legacyHost) {
  legacyHostnames.add(legacyHost.split(":")[0]);
}
const legacyInit = legacyHost ? { headers: { "x-forwarded-host": legacyHost } } : {};
const image2Init = image2Host ? { headers: { "x-forwarded-host": image2Host } } : {};
const sceneInit = sceneHost ? { headers: { "x-forwarded-host": sceneHost } } : {};
const skippedChecks = [];

for (const section of onlySections) {
  if (!knownSections.has(section)) {
    console.error(`[warn] unknown --only section "${section}" (known: ${[...knownSections].join(", ")})`);
  }
}

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

function sectionEnabled(section) {
  return !onlySections.size || onlySections.has(section);
}

function canonicalFrom(html) {
  return (
    html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1] ??
    html.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/i)?.[1] ??
    ""
  );
}

function ogUrlFrom(html) {
  return (
    html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]+)"/i)?.[1] ??
    html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:url"/i)?.[1] ??
    ""
  );
}

function assertSameUrl(label, actual, expected) {
  if (!actual) {
    throw new Error(`expected "${expected}", got "[missing]"`);
  }

  let parsedActual;
  try {
    parsedActual = new URL(actual);
  } catch {
    throw new Error(`expected "${expected}", got unparsable "${actual}"`);
  }

  const parsedExpected = new URL(expected);
  const same =
    parsedActual.origin === parsedExpected.origin &&
    parsedActual.pathname === parsedExpected.pathname &&
    parsedActual.search === parsedExpected.search;

  if (!same) {
    throw new Error(`expected "${expected}", got "${actual}"`);
  }

  pass(label, actual);
}

async function smokeRedirect({ label, url, expectedLocation, init }) {
  const response = await request(url, { ...(init ?? {}), redirect: "manual" });
  const location = response.headers.get("location") ?? "";

  if (response.status !== 308) {
    throw new Error(`expected HTTP 308, got ${response.status}; location: ${location || "[missing]"}`);
  }

  assertSameUrl(`${label} location`, location, expectedLocation);
  return { location };
}

async function smokeNoRedirect({ label, url, init, expectedStatus }) {
  const response = await request(url, { ...(init ?? {}), redirect: "manual" });
  const location = response.headers.get("location") ?? "";

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`expected no redirect, got HTTP ${response.status} -> ${location || "[missing location]"}`);
  }

  if (expectedStatus && response.status !== expectedStatus) {
    throw new Error(`expected HTTP ${expectedStatus}, got ${response.status}`);
  }

  pass(label, `HTTP ${response.status}${location ? ` -> ${location}` : " (no location)"}`);
  return response;
}

async function assertRedirectTargetStaysUp(label, location, expectedStatus = 200) {
  const target = new URL(location);

  if (legacyHostnames.has(target.hostname)) {
    throw new Error(`redirect target is still a legacy host (loop risk): ${location}`);
  }

  const base = new URL(image2Base);
  const init = base.host === target.host ? {} : { headers: { "x-forwarded-host": target.host } };
  const response = await request(`${image2Base}${target.pathname}${target.search}`, { ...init, redirect: "manual" });
  const nextLocation = response.headers.get("location") ?? "";

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`redirect target ${location} redirects again: HTTP ${response.status} -> ${nextLocation || "[missing location]"}`);
  }

  if (response.status !== expectedStatus) {
    throw new Error(`redirect target ${location} expected HTTP ${expectedStatus}, got ${response.status}`);
  }

  pass(`${label} target`, `HTTP ${response.status} ${location}`);
}

async function runCheck(label, fn, section = "core") {
  if (!sectionEnabled(section)) {
    skippedChecks.push(label);
    console.log(`[skip] ${label} (section: ${section})`);
    return;
  }

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
  if (final.hostname !== "image2.cauai.fun" || !final.pathname.startsWith("/image2-cases")) {
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

// ── 旧域 308 迁移（--only=legacy）──────────────────────────────────────────

const legacyRedirectCases = [
  { path: "/", expected: `${image2PublicBase}/` },
  { path: "/image2-cases?case=E295-361", expected: `${image2PublicBase}/image2-cases?case=E295-361` },
  { path: "/workbench", expected: `${image2PublicBase}/workbench` },
  { path: "/login", expected: `${image2PublicBase}/login` },
  { path: "/auth/callback", expected: `${image2PublicBase}/auth/callback` }
];

for (const item of legacyRedirectCases) {
  await runCheck(`legacy ${item.path} redirects to new domain`, async () => {
    const { location } = await smokeRedirect({
      label: `legacy ${item.path}`,
      url: urlFor(legacyBase, item.path),
      expectedLocation: item.expected,
      init: legacyInit
    });
    await assertRedirectTargetStaysUp(`legacy ${item.path}`, location);
  }, "legacy");
}

await runCheck("legacy /api/image2 is not redirected", async () => {
  const response = await smokeNoRedirect({
    label: "legacy /api/image2",
    url: urlFor(legacyBase, "/api/image2"),
    init: legacyInit,
    expectedStatus: 200
  });
  const body = await response.text();
  let config = null;
  try {
    config = JSON.parse(body);
  } catch {
    config = null;
  }
  if (!config || config.provider !== "image2") {
    throw new Error(`expected image2 config JSON with provider "image2", got: ${body.slice(0, 200)}`);
  }
  pass("legacy /api/image2 payload", `provider=${config.provider}`);
}, "legacy");

// 2026-10-06 决策：旧域整条迁移线作废，/migrate 页面已从仓库撤除，
// proxy 也不再为它保留 matcher 豁免（见 docs/image2-domain-migration.md 与 proxy.ts 注释）。
// 因此该路径与其他不存在的页面一致：旧域 308 送到新域，再由新域返回 404。
await runCheck("legacy /migrate redirects to the new domain", async () => {
  const { location } = await smokeRedirect({
    label: "legacy /migrate",
    url: urlFor(legacyBase, "/migrate"),
    expectedLocation: `${image2PublicBase}/migrate`,
    init: legacyInit
  });
  await assertRedirectTargetStaysUp("legacy /migrate", location, 404);
}, "legacy");

await runCheck("legacy /migrate/ normalizes on the legacy host first", async () => {
  const response = await request(urlFor(legacyBase, "/migrate/"), { ...legacyInit, redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  if (response.status !== 308) {
    throw new Error(`expected HTTP 308 for trailing slash normalization, got ${response.status}`);
  }
  const next = new URL(location || "/", urlFor(legacyBase, "/migrate/"));
  if (next.host !== new URL(legacyBase).host) {
    throw new Error(`trailing slash normalization should stay on the legacy host, got ${location}`);
  }
  pass("legacy /migrate/", `HTTP ${response.status} -> ${location} (${next.host})`);
}, "legacy");

await runCheck("legacy /migrate/extra still redirects to the new domain", async () => {
  await smokeRedirect({
    label: "legacy /migrate/extra",
    url: urlFor(legacyBase, "/migrate/extra"),
    expectedLocation: `${image2PublicBase}/migrate/extra`,
    init: legacyInit
  });
}, "legacy");

await runCheck("legacy static file path is not redirected", async () => {
  await smokeNoRedirect({
    label: "legacy /robots.txt",
    url: urlFor(legacyBase, "/robots.txt"),
    init: legacyInit,
    expectedStatus: 200
  });
}, "legacy");

// ── 新域 SEO：robots / sitemap / canonical（--only=seo）────────────────────

await runCheck("image2 robots.txt declares the new-domain sitemap", async () => {
  const response = await request(urlFor(image2Base, "/robots.txt"), { ...image2Init, redirect: "manual" });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}; body: ${body.slice(0, 200)}`);
  }

  assertIncludesAll("image2 robots sitemap", body, [`Sitemap: ${image2PublicBase}/sitemap.xml`]);
  assertExcludes("image2 robots legacy host", body, [...legacyHostnames]);
  pass("image2 robots status", `HTTP ${response.status}`);
}, "seo");

await runCheck("image2 sitemap.xml lists new-domain entry points", async () => {
  const response = await request(urlFor(image2Base, "/sitemap.xml"), { ...image2Init, redirect: "manual" });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}; body: ${body.slice(0, 200)}`);
  }

  assertIncludesAll("image2 sitemap entries", body, [
    `<loc>${image2PublicBase}/</loc>`,
    `<loc>${image2PublicBase}/image2-cases</loc>`
  ]);
  assertExcludes("image2 sitemap legacy host", body, [...legacyHostnames]);
  pass("image2 sitemap status", `HTTP ${response.status} (${response.headers.get("content-type") ?? "no content-type"})`);
}, "seo");

for (const item of [
  { path: "/", label: "image2 home" },
  { path: "/image2-cases", label: "image2 cases" }
]) {
  await runCheck(`${item.label} canonical points to new domain`, async () => {
    const response = await request(urlFor(image2Base, item.path), { ...image2Init, redirect: "manual" });
    const html = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const canonical = canonicalFrom(html);
    const ogUrl = ogUrlFrom(html);
    assertSameUrl(`${item.label} canonical`, canonical, `${image2PublicBase}${item.path}`);
    assertSameUrl(`${item.label} og:url`, ogUrl, `${image2PublicBase}${item.path}`);
    assertExcludes(`${item.label} metadata legacy host`, `${canonical} ${ogUrl}`, [...legacyHostnames]);
  }, "seo");
}

await runCheck("scene robots.txt does not declare the image2 sitemap", async () => {
  const response = await request(urlFor(sceneBase, "/robots.txt"), { ...sceneInit, redirect: "manual" });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}; body: ${body.slice(0, 200)}`);
  }

  const sitemapLines = body.match(/^Sitemap:.*$/gim) ?? [];
  const image2Lines = sitemapLines.filter((line) => /image2/i.test(line));
  if (image2Lines.length) {
    throw new Error(`scene robots declares image2 sitemap: ${image2Lines.join(" | ")}`);
  }

  assertExcludes("scene robots image2 markers", body, ["image2.cauai.fun", image2PublicBase]);
  pass("scene robots sitemap declarations", sitemapLines.length ? sitemapLines.join(" | ") : "(none)");
}, "seo");

const failed = checks.filter((item) => !item.ok);

if (failed.length) {
  console.error(`Image2 domain smoke failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Image2 domain smoke passed: ${checks.length}/${checks.length} checks passed.`);
if (skippedChecks.length) {
  console.log(`Image2 domain smoke skipped ${skippedChecks.length} checks (--only=${[...onlySections].join(",")}).`);
}
