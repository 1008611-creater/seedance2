import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const projectRoot = process.cwd();
const envFile = path.resolve(projectRoot, args.get("env-file") ?? ".env.local");
const dryRun = args.get("dry-run") === "true";
const includeSeed = args.get("include-seed") === "true";
const limit = Number(args.get("limit") ?? 0) || Infinity;
const workspaceId = args.get("workspace-id") ?? "image2-workbench-main";
const bucket = args.get("bucket") ?? "image2-workbench-media";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
        if (!match) return null;
        return [match[1].trim(), match[2].trim().replace(/^["']|["']$/g, "")];
      })
      .filter(Boolean)
  );
}

const fileEnv = parseEnvFile(envFile);
const getEnv = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();
const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(`Missing Supabase URL or service role key. Configure ${envFile} or process env.`);
}

const outputRoot = path.resolve(getEnv("DAIHUO_OUTPUT_ROOT") || "D:/codex-work/daihuo/output");
const workbenchLibraryRoot = path.join(outputRoot, "image2-workbench-library");
const workbenchLibraryManifestPath = path.join(workbenchLibraryRoot, "assets.json");
const workbenchFeedbackPath = path.join(workbenchLibraryRoot, "feedback.json");
const matrixManifestPath = path.join(
  outputRoot,
  "person-dress-product-photo-runs",
  "2026-05-22-R008-matrix-3x3x5",
  "matrix-assets.json"
);
const currentHeroPath = path.join(
  outputRoot,
  "person-dress-product-photo-runs",
  "2026-05-24-R018-static-matrix-v2",
  "person-scenes",
  "D01",
  "ab500156-eb3c-43f1-bfc8-a3189ab0ed85.png"
);
const currentMainAssetPath = path.join(
  outputRoot,
  "person-dress-product-photo-runs",
  "2026-05-24-R018-static-matrix-v2",
  "assets",
  "P01-person-source.png"
);
const reviewFramePaths = [
  path.join(
    outputRoot,
    "person-dress-product-photo-video-handoff",
    "2026-05-22-R006-floral-classroom-dance",
    "outputs",
    "R006-P03-firstframe.jpg"
  ),
  path.join(
    outputRoot,
    "person-dress-product-photo-video-handoff",
    "2026-05-22-R010-matrix-formal-consumer-9",
    "review",
    "R010-P01-D03-S01-A05-P03-v01-mid.jpg"
  ),
  path.join(
    outputRoot,
    "person-dress-product-photo-video-handoff",
    "2026-05-22-R009-matrix-scale-9",
    "review",
    "R009-P01-D03-S03-A05-P03-v01-start.jpg"
  )
];

const groupByKind = {
  person: "人物",
  clothing: "服装",
  scene: "场景",
  motion: "动作",
  result: "结果"
};

const seedAssets = [
  {
    id: "seed-person",
    kind: "person",
    group: "人物",
    title: "云端示例人物",
    subtitle: "部署种子",
    note: "云端演示用的人物参考，部署后可直接替换为团队自己的素材。",
    sourcePath: "/image2/hero/case-20125-portrait.jpg",
    previewPath: "/image2/hero/case-20125-portrait.jpg",
    tags: ["人物", "示例", "云端"],
    promptHint: "保留人物身份、脸型和发型，适合作为穿搭图主参考。"
  },
  {
    id: "seed-clothing",
    kind: "clothing",
    group: "服装",
    title: "云端示例服装",
    subtitle: "部署种子",
    note: "云端演示用的服装参考，适合展示穿搭图工作流。",
    sourcePath: "/image2/hero/case-20243-fashion.jpg",
    previewPath: "/image2/hero/case-20243-fashion.jpg",
    tags: ["服装", "示例", "云端"],
    promptHint: "重点保留版型、颜色和材质，适合做穿搭图服装锚点。"
  },
  {
    id: "seed-scene",
    kind: "scene",
    group: "场景",
    title: "云端示例场景",
    subtitle: "部署种子",
    note: "云端演示用的场景参考，适合首帧图和动作迁移背景。",
    sourcePath: "/image2/hero/case-20275-bangkok.jpg",
    previewPath: "/image2/hero/case-20275-bangkok.jpg",
    tags: ["场景", "示例", "云端"],
    promptHint: "用于控制空间氛围、构图和光线方向。"
  },
  {
    id: "seed-motion",
    kind: "motion",
    group: "动作",
    title: "云端示例动作",
    subtitle: "部署种子",
    note: "云端演示用的动作参考，展示动作迁移的起势和节奏。",
    sourcePath: "/image2/hero/case-20242-coffee.jpg",
    previewPath: "/image2/hero/case-20242-coffee.jpg",
    tags: ["动作", "示例", "云端"],
    promptHint: "用于观察动作节奏和身体方向。"
  },
  {
    id: "seed-result",
    kind: "result",
    group: "结果",
    title: "云端示例结果",
    subtitle: "部署种子",
    note: "云端演示用的结果样图，可作为首帧和复盘参考。",
    sourcePath: "/image2/hero/case-30001-vr.jpg",
    previewPath: "/image2/hero/case-30001-vr.jpg",
    tags: ["结果", "示例", "云端"],
    promptHint: "适合作为视频首帧和穿搭图的质量锚点。"
  }
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function localPathExists(filePath) {
  return Boolean(filePath && existsSync(filePath) && statSync(filePath).isFile());
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => localPathExists(candidate));
}

function makeTags(...parts) {
  return parts.filter((part) => typeof part === "string" && part.trim()).slice(0, 4);
}

function text(value, fallback = "", max = 4000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function stringList(value, maxItems = 12, itemMax = 80) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, "", itemMax)).filter(Boolean))].slice(0, maxItems);
}

function stageLabel(stage) {
  if (stage === "outfit") return "人物穿搭图";
  if (stage === "first-frame") return "视频首帧图";
  return undefined;
}

function cleanId(value) {
  return String(value || "")
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function toAbsoluteAssetPath(filePath) {
  if (!filePath || /^https?:\/\//i.test(filePath)) return "";
  if (filePath.startsWith("/")) {
    return path.join(projectRoot, "public", filePath.replace(/^\/+/, ""));
  }
  return path.resolve(filePath);
}

function mimeFor(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (buffer?.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer?.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "image/png";
}

function extensionForMimeType(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function buildAssetRecord(asset, id, createdAt, publicUrl, objectPath, mimeType) {
  const origin = asset.origin || "master";
  const label = stageLabel(asset.stage);
  return {
    id,
    workspace_id: workspaceId,
    kind: asset.kind,
    group_label: asset.group || groupByKind[asset.kind],
    title: text(asset.title, asset.originalName || label || "新增素材", 80),
    subtitle:
      asset.subtitle ||
      (origin === "generated" ? `生成沉淀 · ${label || "结果图"}` : origin === "master" ? `素材母版 · ${groupByKind[asset.kind]}` : `团队上传 · ${groupByKind[asset.kind]}`),
    note: text(
      asset.note,
      origin === "generated" ? "由作图工作台自动沉淀，可继续投入下一步流程。" : origin === "master" ? "从动作迁移素材母版迁入，可作为团队公共参考素材。" : "团队新增参考素材。",
      260
    ),
    source_path: publicUrl,
    preview_path: publicUrl,
    tags: [
      ...new Set([
        ...stringList(asset.tags, 8, 40),
        origin === "generated" ? "生成沉淀" : origin === "master" ? "素材母版" : "团队上传",
        label
      ].filter(Boolean))
    ].slice(0, 5),
    prompt_hint:
      asset.promptHint ||
      (origin === "generated" ? `可复用的${label || "结果图"}；选择后继续进入动作迁移首帧流程。` : origin === "master" ? "素材母版公共资产，适合团队批量选择和复盘。" : "团队上传素材，已可加入当前作图流程。"),
    ratio: asset.ratio || null,
    origin,
    stage: asset.stage || null,
    prompt: asset.prompt || null,
    storage_bucket: bucket,
    storage_object_path: objectPath,
    mime_type: mimeType,
    metadata: {
      migratedFrom: asset.sourcePath || asset.previewPath || "",
      migratedAt: new Date().toISOString()
    },
    created_at: createdAt,
    updated_at: new Date().toISOString()
  };
}

function buildAssets() {
  const matrix = readJson(matrixManifestPath, {});
  const assets = [];

  const characterPath = firstExistingPath([matrix.character?.path, currentMainAssetPath]);
  if (characterPath) {
    assets.push({
      id: cleanId(matrix.character?.id || "P01"),
      kind: "person",
      group: "人物",
      title: "P01 人物原图",
      subtitle: "角色定锚",
      note: matrix.character?.note || "主人物参考，保留脸型、发型和整体身份。",
      sourcePath: characterPath,
      previewPath: characterPath,
      tags: ["人物", "主角色", "身份稳定"],
      promptHint: "稳定人物身份和脸部结构，适合作为穿搭图的主参考。",
      origin: "master"
    });
  }

  const faceCropPath = path.join(outputRoot, "person-dress-product-photo-runs", "2026-05-24-R018-static-matrix-v2", "assets", "P01-identity-face-crop.jpg");
  if (localPathExists(faceCropPath)) {
    assets.push({
      id: "P01-face-crop",
      kind: "person",
      group: "人物",
      title: "P01 头像裁切",
      subtitle: "身份校准",
      note: "脸部稳定参考，适合检查人物识别和面部一致性。",
      sourcePath: faceCropPath,
      previewPath: faceCropPath,
      tags: ["人物", "脸部", "校准"],
      promptHint: "用于校准五官、发型和脸部细节。",
      origin: "master"
    });
  }

  for (const item of matrix.dresses ?? []) {
    const previewPath = firstExistingPath([item.white_clean_path, item.primary_path, item.refs?.[0]]);
    if (!previewPath) continue;
    assets.push({
      id: cleanId(item.id || previewPath),
      kind: "clothing",
      group: "服装",
      title: `${item.id || "D"} ${item.name || "服装参考"}`,
      subtitle: item.status || "服装矩阵",
      note: item.white_clean_source || "服装白底清图，适合穿搭图和首帧图复用。",
      sourcePath: item.primary_path || previewPath,
      previewPath,
      tags: makeTags("服装", item.id, item.status),
      promptHint: "重点保留服装版型、颜色和材质，适合做穿搭图主体。",
      origin: "master"
    });
  }

  for (const item of matrix.scenes ?? []) {
    const previewPath = firstExistingPath([item.path]);
    if (!previewPath) continue;
    assets.push({
      id: cleanId(item.id || previewPath),
      kind: "scene",
      group: "场景",
      title: `${item.id || "S"} ${item.name || "场景参考"}`,
      subtitle: item.mood || item.status || "场景矩阵",
      note: [item.creator, item.license, item.note].filter(Boolean).join(" · ") || "场景参考，适合首帧背景和光线延展。",
      sourcePath: previewPath,
      previewPath,
      tags: makeTags("场景", item.mood, item.status),
      promptHint: "用于控制空间氛围、构图和光线方向。",
      origin: "master"
    });
  }

  for (const item of matrix.dances ?? []) {
    const previewPath = firstExistingPath([item.preview_path]);
    if (!previewPath) continue;
    assets.push({
      id: cleanId(item.id || previewPath),
      kind: "motion",
      group: "动作",
      title: `${item.id || "A"} ${item.name || "动作参考"}`,
      subtitle: `${item.width || 0}x${item.height || 0} · ${item.duration_s ? `${item.duration_s.toFixed(2)}s` : "动作片段"}`,
      note: item.path || "动作参考视频的首帧预览。",
      sourcePath: previewPath,
      previewPath,
      tags: makeTags("动作", item.name, item.duration_s ? `${item.duration_s.toFixed(1)}s` : undefined),
      promptHint: "用于观察动作起势、身体方向和节奏结构。",
      origin: "master"
    });
  }

  for (const [index, previewPath] of reviewFramePaths.entries()) {
    if (!localPathExists(previewPath)) continue;
    assets.push({
      id: `result-${index + 1}`,
      kind: "result",
      group: "结果",
      title: index === 0 ? "P03 首帧沉淀" : `复盘样例 ${index + 1}`,
      subtitle: index === 0 ? "当前主图" : "首帧复盘",
      note: index === 0 ? "当前项目里最接近首帧交付的主图。" : "用于对照动作迁移复盘结果。",
      sourcePath: previewPath,
      previewPath,
      tags: ["结果", "复盘", "首帧"],
      promptHint: "可作为反推提示词和首帧质量检查样本。",
      origin: "master"
    });
  }

  if (localPathExists(currentHeroPath)) {
    assets.unshift({
      id: "current-hero",
      kind: "result",
      group: "结果",
      title: "当前主图",
      subtitle: "首帧候选",
      note: "动作迁移项目里当前可用的主图参考。",
      sourcePath: currentHeroPath,
      previewPath: currentHeroPath,
      tags: ["结果", "主图", "首帧"],
      promptHint: "适合作为视频首帧和穿搭图的质量锚点。",
      origin: "master"
    });
  }

  const sharedManifest = readJson(workbenchLibraryManifestPath, { assets: [] });
  for (const item of sharedManifest.assets ?? []) {
    const candidatePath = firstExistingPath([item.sourcePath, item.previewPath]);
    if (!candidatePath) continue;
    assets.push({
      ...item,
      id: cleanId(item.id),
      sourcePath: candidatePath,
      previewPath: candidatePath,
      origin: item.origin || "upload"
    });
  }

  if (includeSeed) assets.push(...seedAssets.map((item) => ({ ...item, origin: "master" })));

  const seen = new Set();
  return assets
    .filter((item) => item.id && item.kind && groupByKind[item.kind])
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}

function readFeedback() {
  const manifest = readJson(workbenchFeedbackPath, { feedback: [] });
  return (manifest.feedback ?? [])
    .filter((item) => item.id && item.assetId && item.createdAt)
    .slice(0, 500)
    .map((item) => ({
      id: text(item.id, "", 160),
      workspace_id: workspaceId,
      asset_id: text(item.assetId, "", 160),
      stage: ["outfit", "first-frame", "manual"].includes(item.stage) ? item.stage : "manual",
      rating: ["usable", "needs-fix", "reject"].includes(item.rating) ? item.rating : "needs-fix",
      reasons: stringList(item.reasons, 8, 40),
      note: item.note?.trim() ? text(item.note, "", 500) : null,
      prompt: item.prompt?.trim() ? text(item.prompt, "", 4000) : null,
      reference_ids: stringList(item.referenceIds, 10, 160),
      metadata: { migratedAt: new Date().toISOString() },
      created_at: item.createdAt
    }));
}

async function ensureBucket(client) {
  const existing = await client.storage.getBucket(bucket);
  if (!existing.error) return;

  const created = await client.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 12 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"]
  });
  if (created.error) throw new Error(`Could not create storage bucket: ${created.error.message}`);
}

async function uploadAsset(client, asset) {
  const localPath = toAbsoluteAssetPath(asset.sourcePath) || toAbsoluteAssetPath(asset.previewPath);
  if (!localPathExists(localPath)) {
    return { skipped: true, reason: "missing-file", id: asset.id };
  }

  const buffer = await readFile(localPath);
  const mimeType = mimeFor(localPath, buffer);
  const objectPath = `workbench/${asset.origin || "master"}/${asset.stage || "manual"}/${asset.id}.${extensionForMimeType(mimeType)}`;

  if (dryRun) {
    return { skipped: false, dryRun: true, id: asset.id, bytes: buffer.byteLength };
  }

  const upload = await client.storage.from(bucket).upload(objectPath, buffer, {
    cacheControl: "31536000",
    contentType: mimeType,
    upsert: true
  });
  if (upload.error) throw new Error(`Upload failed for ${asset.id}: ${upload.error.message}`);

  const publicUrl = client.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
  const row = buildAssetRecord(asset, asset.id, asset.createdAt || new Date().toISOString(), publicUrl, objectPath, mimeType);
  const upsert = await client.from("image2_workbench_assets").upsert(row, { onConflict: "id" });
  if (upsert.error) throw new Error(`Asset upsert failed for ${asset.id}: ${upsert.error.message}`);

  return { skipped: false, id: asset.id, bytes: buffer.byteLength };
}

async function upsertFeedback(client, feedback) {
  if (dryRun || feedback.length === 0) return;
  const response = await client.from("image2_workbench_feedback").upsert(feedback, { onConflict: "id" });
  if (response.error) throw new Error(`Feedback upsert failed: ${response.error.message}`);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

const assets = buildAssets();
const feedback = readFeedback();
const summary = {
  dryRun,
  outputRoot,
  assetsFound: assets.length,
  feedbackFound: feedback.length,
  uploaded: 0,
  skipped: 0,
  bytes: 0
};

if (!dryRun) await ensureBucket(client);

for (const asset of assets) {
  const result = await uploadAsset(client, asset);
  if (result.skipped) {
    summary.skipped += 1;
    continue;
  }
  summary.uploaded += 1;
  summary.bytes += result.bytes || 0;
  console.log(`[ok] ${dryRun ? "would upload" : "uploaded"} ${asset.id} ${asset.kind}`);
}

await upsertFeedback(client, feedback);

console.log(
  JSON.stringify(
    {
      ...summary,
      feedbackUpserted: dryRun ? 0 : feedback.length
    },
    null,
    2
  )
);
