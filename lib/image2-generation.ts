import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const userHome = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
const authPath = path.join(userHome, ".codex", "auth.json");
const ikunConfigPath = path.join(userHome, ".codex", "skills", "ikun-image2", "config.env");
const localConfigPath = path.join(userHome, ".codex", "skills", "beecode-image2", "config.env");
const runningHubSkillEnvPath = path.join(userHome, ".codex", "skills", "runninghub-image2-text", ".env");
const outputRoot = process.env.DAIHUO_OUTPUT_ROOT
  ? path.join(process.env.DAIHUO_OUTPUT_ROOT, "image2-studio")
  : process.env.VERCEL
    ? path.join(os.tmpdir(), "image2-studio")
    : path.join(process.cwd(), "outputs", "image2-studio");
const runningHubTextEndpoint = "/openapi/v2/rhart-image-g-2/text-to-image";
const runningHubImageEndpoint = "/openapi/v2/rhart-image-g-2/image-to-image";
const runningHubQueryEndpoint = "/openapi/v2/query";

export const allowedImage2Sizes = new Set(["1024x1024", "1024x1536", "1536x1024"]);
export const allowedImage2Ratios = new Set(["1:1", "3:4", "9:16", "16:9"]);
export const allowedImage2Resolutions = new Set(["1k", "2k", "4k"]);
export const allowedImage2Channels = new Set(["auto", "ikun", "runninghub", "fast", "stable"]);
export const allowedImage2Modes = new Set(["text-to-image", "image-to-image", "smart-edit"]);

export type Image2Channel = "auto" | "ikun" | "runninghub" | "fast" | "stable";
export type Image2EffectiveChannel = "ikun" | "runninghub";
export type Image2Mode = "text-to-image" | "image-to-image" | "smart-edit";
export type Image2Ratio = "1:1" | "3:4" | "9:16" | "16:9";
export type Image2Resolution = "1k" | "2k" | "4k";

export type ReferenceImage = {
  name?: string;
  dataUrl?: string;
};

export type GeneratedImage = {
  name: string;
  path: string;
  dataUrl: string;
};

export type Image2GenerationResult = {
  provider: "image2";
  channel: Image2EffectiveChannel;
  mode: "text-to-image" | "image-to-image";
  ratio: Image2Ratio;
  resolution: Image2Resolution;
  seed?: number;
  size: string;
  outDir: string;
  elapsedSeconds: number;
  images: GeneratedImage[];
};

type ImageItem = {
  b64_json?: string;
  image_base64?: string;
  base64?: string;
  url?: string;
  image_url?: string | { url?: string };
};

type Image2Input = {
  channel: Image2Channel;
  count: number;
  mode: Image2Mode;
  prompt: string;
  ratio: Image2Ratio;
  references: ReferenceImage[];
  requestedChannel: Image2Channel;
  resolution: Image2Resolution;
  seed?: number;
  size: string;
};

type Image2ProviderName = Image2EffectiveChannel;

function normalizeBaseUrl(value?: string) {
  const baseUrl = (value || "https://beecode.cc").trim().replace(/\/+$/, "");
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("参考图格式无效。");
  }

  const mime = match[1];
  const extension =
    mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "";

  if (!extension) {
    throw new Error("只支持 PNG、JPG、WEBP 参考图。");
  }

  return {
    mime,
    extension,
    buffer: Buffer.from(match[2], "base64")
  };
}

function scrubResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubResponse);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (["b64_json", "image_base64", "base64"].includes(key) && typeof item === "string") {
        return [key, `[base64 omitted, ${item.length} chars]`];
      }
      return [key, scrubResponse(item)];
    })
  );
}

function imageItems(response: Record<string, unknown>) {
  const found: ImageItem[] = [];
  const stack: unknown[] = [response.data, response.output, response.content, response];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    const item = current as Record<string, unknown>;
    if (["b64_json", "image_base64", "base64", "url", "image_url"].some((key) => key in item)) {
      found.push(item as ImageItem);
    }
    stack.push(...Object.values(item));
  }
  return found;
}

function base64FromItem(item: ImageItem) {
  for (const key of ["b64_json", "image_base64", "base64"] as const) {
    const value = item[key];
    if (!value) continue;
    return value.startsWith("data:") ? value.split(",", 2)[1] : value;
  }
  return null;
}

function urlFromItem(item: ImageItem) {
  if (typeof item.url === "string" && /^https?:\/\//.test(item.url)) return item.url;
  if (typeof item.image_url === "string" && /^https?:\/\//.test(item.image_url)) return item.image_url;
  if (item.image_url && typeof item.image_url === "object" && typeof item.image_url.url === "string") {
    return /^https?:\/\//.test(item.image_url.url) ? item.image_url.url : null;
  }
  return null;
}

function sourceKeyFromItem(item: ImageItem) {
  return base64FromItem(item) || urlFromItem(item) || JSON.stringify(item);
}

function sniffExtension(buffer: Buffer, preferred = "png") {
  if (preferred === "jpeg") return "jpg";
  if (["png", "jpg", "webp"].includes(preferred)) return preferred;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "webp";
  return "png";
}

function mimeForExtension(extension: string) {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "image/png";
}

function imageGenerationMockEnabled() {
  if (process.env.NODE_ENV === "production" && !/^(1|true|yes|on)$/i.test(process.env.IMAGE2_GENERATION_ALLOW_MOCKS ?? "")) {
    return false;
  }
  return /^(1|true|yes|on|pass|auto)$/i.test(process.env.IMAGE2_GENERATION_MOCK ?? "");
}

function parseEnvFile(text: string) {
  const values = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...parts] = line.split("=");
    values.set(key.trim(), parts.join("=").trim().replace(/^["']|["']$/g, ""));
  }
  return values;
}

async function readLocalConfig() {
  try {
    return parseEnvFile(await readFile(localConfigPath, "utf-8"));
  } catch {
    return new Map<string, string>();
  }
}

async function readIkunConfig() {
  try {
    return parseEnvFile(await readFile(ikunConfigPath, "utf-8"));
  } catch {
    return new Map<string, string>();
  }
}

async function readRunningHubSkillConfig() {
  try {
    return parseEnvFile(await readFile(runningHubSkillEnvPath, "utf-8"));
  } catch {
    return new Map<string, string>();
  }
}

async function readAuthJsonKey() {
  try {
    const auth = JSON.parse(await readFile(authPath, "utf-8"));
    return typeof auth.OPENAI_API_KEY === "string" ? auth.OPENAI_API_KEY : "";
  } catch {
    return "";
  }
}

async function getImageConfig() {
  const ikunConfig = await readIkunConfig();
  const localConfig = await readLocalConfig();
  const apiKey =
    process.env.IKUN_IMAGE2_API_KEY ||
    process.env.MONKEY_TOOLS_API_KEY ||
    process.env.NEWAPI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.BEECODE_OPENAI_API_KEY ||
    ikunConfig.get("IKUN_IMAGE2_API_KEY") ||
    ikunConfig.get("MONKEY_TOOLS_API_KEY") ||
    ikunConfig.get("NEWAPI_API_KEY") ||
    ikunConfig.get("OPENAI_API_KEY") ||
    localConfig.get("OPENAI_API_KEY") ||
    localConfig.get("BEECODE_OPENAI_API_KEY") ||
    (await readAuthJsonKey());

  const baseUrl =
    process.env.IKUN_IMAGE2_BASE_URL ||
    process.env.MONKEY_TOOLS_BASE_URL ||
    process.env.NEWAPI_BASE_URL ||
    ikunConfig.get("IKUN_IMAGE2_BASE_URL") ||
    ikunConfig.get("MONKEY_TOOLS_BASE_URL") ||
    ikunConfig.get("NEWAPI_BASE_URL") ||
    ikunConfig.get("OPENAI_BASE_URL") ||
    process.env.OPENAI_BASE_URL ||
    process.env.BEECODE_BASE_URL ||
    localConfig.get("OPENAI_BASE_URL") ||
    localConfig.get("BEECODE_BASE_URL") ||
    (ikunConfig.size ? "https://api.monkey-tools.cn" : undefined);

  return {
    apiKey: apiKey.trim(),
    baseUrl: normalizeBaseUrl(baseUrl),
    model:
      process.env.IKUN_IMAGE2_MODEL ||
      ikunConfig.get("IKUN_IMAGE2_MODEL") ||
      process.env.IMAGE2_MODEL ||
      process.env.OPENAI_IMAGE_MODEL ||
      process.env.BEECODE_IMAGE_MODEL ||
      localConfig.get("BEECODE_IMAGE_MODEL") ||
      "gpt-image-2"
  };
}

async function getRunningHubConfig() {
  const skillConfig = await readRunningHubSkillConfig();
  const apiKey = process.env.RUNNINGHUB_API_KEY || skillConfig.get("RUNNINGHUB_API_KEY") || "";
  const resolution = process.env.RUNNINGHUB_IMAGE2_RESOLUTION || skillConfig.get("RUNNINGHUB_IMAGE2_RESOLUTION") || "1k";
  return {
    apiKey: apiKey.trim(),
    baseUrl: (process.env.RUNNINGHUB_BASE_URL || skillConfig.get("RUNNINGHUB_BASE_URL") || "https://www.runninghub.cn").trim().replace(/\/+$/, ""),
    resolution: resolution.trim()
  };
}

export async function getImage2PublicConfig() {
  const config = await getImageConfig();
  const runningHubConfig = await getRunningHubConfig();
  return {
    configured: Boolean(config.apiKey || runningHubConfig.apiKey),
    channels: {
      auto: Boolean(config.apiKey || runningHubConfig.apiKey),
      ikun: Boolean(config.apiKey),
      runninghub: Boolean(runningHubConfig.apiKey)
    },
    ratios: Array.from(allowedImage2Ratios),
    resolutions: Array.from(allowedImage2Resolutions),
    sizes: Array.from(allowedImage2Sizes)
  };
}

export function sanitizeImage2ProviderMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https:\/\/beecode\.cc\/?v?1?/gi, "图片生成服务")
    .replace(/https:\/\/www\.runninghub\.(?:cn|ai)\/?[^\s,，。)）]*/gi, "图片生成服务")
    .replace(/https:\/\/api\.monkey-tools\.cn\/?[^\s,，。)）]*/gi, "图片生成服务")
    .replace(/beecode/gi, "图片生成服务")
    .replace(/runninghub/gi, "图片生成服务")
    .replace(/monkey-tools|ikun/gi, "图片生成服务")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
}

export function parseImage2Input(body: unknown): Image2Input {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const prompt = String(record.prompt ?? "").trim();
  const legacySize = allowedImage2Sizes.has(String(record.size)) ? String(record.size) : "";
  const ratio = normalizeImage2Ratio(record.ratio, legacySize);
  const resolution = allowedImage2Resolutions.has(String(record.resolution)) ? (String(record.resolution) as Image2Resolution) : "1k";
  const rawChannel = allowedImage2Channels.has(String(record.channel)) ? (String(record.channel) as Image2Channel) : "ikun";
  const channel = normalizeImage2Channel(rawChannel);
  const requestedMode = allowedImage2Modes.has(String(record.mode)) ? (String(record.mode) as Image2Mode) : "text-to-image";
  const size = legacySize || sizeForRatio(ratio);
  const count = Math.min(Math.max(Number(record.n) || 1, 1), 4);
  const seedValue = Number(record.seed);
  const seed = Number.isFinite(seedValue) && seedValue > 0 ? Math.floor(seedValue) : undefined;
  const references: ReferenceImage[] = Array.isArray(record.images)
    ? record.images
        .slice(0, 4)
        .filter((item): item is ReferenceImage => Boolean(item) && typeof item === "object")
        .map((item) => ({
          name: typeof item.name === "string" ? item.name : undefined,
          dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : undefined
        }))
        .filter((item) => Boolean(item.dataUrl))
    : [];

  if (prompt.length < 12) {
    throw new Error("提示词太短，至少写清主体、场景和画面要求。");
  }

  return {
    channel,
    count,
    mode: requestedMode,
    prompt,
    ratio,
    references,
    requestedChannel: rawChannel,
    resolution,
    seed,
    size
  };
}

async function readImageUrl(url: string) {
  if (!url) throw new Error("图片生成服务没有返回可下载的图片地址。");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("生成图片下载失败。");
  return Buffer.from(await response.arrayBuffer());
}

function publicAppUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
}

async function writeReferencesForPublicAccess(references: ReferenceImage[], jobDir: string, jobId: string) {
  const baseUrl = publicAppUrl();
  if (!baseUrl) {
    throw new Error("参考图生成需要配置 APP_URL，才能让备用通道读取上传图片。");
  }

  const urls: string[] = [];
  for (const [index, image] of references.entries()) {
    if (!image.dataUrl) continue;
    const parsed = parseDataUrl(image.dataUrl);
    const name = `reference-${String(index + 1).padStart(2, "0")}.${parsed.extension}`;
    await writeFile(path.join(/* turbopackIgnore: true */ jobDir, name), parsed.buffer);
    urls.push(`${baseUrl}/api/image2/output/${encodeURIComponent(jobId)}/${encodeURIComponent(name)}`);
  }
  return urls;
}

function normalizeImage2Ratio(value: unknown, legacySize = ""): Image2Ratio {
  const ratio = String(value ?? "");
  if (allowedImage2Ratios.has(ratio)) return ratio as Image2Ratio;
  if (legacySize === "1024x1536") return "9:16";
  if (legacySize === "1536x1024") return "16:9";
  return "1:1";
}

function normalizeImage2Channel(channel: Image2Channel): Image2Channel {
  if (channel === "fast") return "ikun";
  if (channel === "stable") return "runninghub";
  return channel;
}

function sizeForRatio(ratio: Image2Ratio) {
  if (ratio === "16:9") return "1536x1024";
  if (ratio === "3:4" || ratio === "9:16") return "1024x1536";
  return "1024x1024";
}

function aspectRatioForSize(size: string) {
  if (size === "1024x1536") return "2:3";
  if (size === "1536x1024") return "3:2";
  return "1:1";
}

function extractTaskId(response: Record<string, unknown>) {
  const candidates = [response, response.data].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  for (const item of candidates) {
    for (const key of ["taskId", "task_id", "id"]) {
      const value = item[key];
      if (typeof value === "string" || typeof value === "number") return String(value);
    }
  }
  return "";
}

function findImageUrls(value: unknown): string[] {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return value.startsWith("http") && [".png", ".jpg", ".jpeg", ".webp"].some((ext) => lower.includes(ext)) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(findImageUrls))];
  }
  if (value && typeof value === "object") {
    return [...new Set(Object.values(value).flatMap(findImageUrls))];
  }
  return [];
}

function runningHubLooksDone(response: Record<string, unknown>) {
  if (findImageUrls(response).length) return true;
  const text = JSON.stringify(response).toLowerCase();
  return ["success", "succeeded", "completed", "finish"].some((word) => text.includes(word));
}

async function postRunningHubJson(
  config: Awaited<ReturnType<typeof getRunningHubConfig>>,
  endpoint: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "image2-case-library/1.0"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : typeof data?.error?.message === "string"
            ? data.error.message
            : `图片生成失败：${response.status}`;
    throw new Error(message);
  }
  return data as Record<string, unknown>;
}

async function pollRunningHubResult(config: Awaited<ReturnType<typeof getRunningHubConfig>>, taskId: string) {
  const timeoutMs = Math.max(15000, Number(process.env.RUNNINGHUB_IMAGE2_TIMEOUT_MS) || 240000);
  const pollMs = Math.max(2000, Number(process.env.RUNNINGHUB_IMAGE2_POLL_MS) || 5000);
  const deadline = Date.now() + timeoutMs;
  let lastResponse: Record<string, unknown> = {};

  while (Date.now() < deadline) {
    lastResponse = await postRunningHubJson(config, runningHubQueryEndpoint, { taskId });
    if (runningHubLooksDone(lastResponse)) return lastResponse;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error("图片生成排队时间过长。");
}

async function requestRunningHubImage2(
  config: Awaited<ReturnType<typeof getRunningHubConfig>>,
  input: Image2Input,
  context: { jobDir: string; jobId: string }
) {
  const responses: Record<string, unknown>[] = [];
  const imageUrls = input.references.length ? await writeReferencesForPublicAccess(input.references, context.jobDir, context.jobId) : [];
  const endpoint = imageUrls.length ? runningHubImageEndpoint : runningHubTextEndpoint;
  for (let index = 0; index < input.count; index += 1) {
    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      aspectRatio: input.ratio,
      resolution: input.resolution || config.resolution
    };
    if (imageUrls.length) payload.imageUrls = imageUrls;
    if (input.seed) payload.seed = input.seed + index;

    const submitResponse = await postRunningHubJson(config, endpoint, payload);
    const taskId = extractTaskId(submitResponse);
    if (!taskId) {
      responses.push(submitResponse);
      continue;
    }
    responses.push({
      submit: submitResponse,
      query: await pollRunningHubResult(config, taskId)
    });
  }
  return { provider: "runninghub" as Image2ProviderName, response: { data: responses } };
}

async function requestGeneration(config: Awaited<ReturnType<typeof getImageConfig>>, payload: Record<string, unknown>, references: ReferenceImage[]) {
  const endpoint = `${config.baseUrl}${references.length ? "/images/edits" : "/images/generations"}`;

  if (references.length) {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      form.append(key, String(value));
    }
    for (const [index, image] of references.entries()) {
      if (!image.dataUrl) continue;
      const parsed = parseDataUrl(image.dataUrl);
      form.append("image", new Blob([parsed.buffer], { type: parsed.mime }), image.name || `reference-${index + 1}.${parsed.extension}`);
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : `图片生成失败：${response.status}`);
    return data as Record<string, unknown>;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : `图片生成失败：${response.status}`);
  return data as Record<string, unknown>;
}

function shouldRetryGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:429|500|502|503|504|timeout|timed out|gateway|service unavailable|fetch failed)/i.test(message);
}

async function requestGenerationWithRetry(
  config: Awaited<ReturnType<typeof getImageConfig>>,
  payload: Record<string, unknown>,
  references: ReferenceImage[]
) {
  try {
    return await requestGeneration(config, payload, references);
  } catch (error) {
    if (!shouldRetryGenerationError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1600));
    return requestGeneration(config, payload, references);
  }
}

function qualityForResolution(resolution: Image2Resolution) {
  if (resolution === "1k") return "medium";
  return "high";
}

async function requestIkunImage2(
  config: Awaited<ReturnType<typeof getImageConfig>>,
  input: Image2Input
) {
  const response = await requestGenerationWithRetry(
    config,
    {
      model: config.model,
      prompt: input.prompt,
      n: input.count,
      size: input.size,
      quality: qualityForResolution(input.resolution),
      ...(input.seed ? { seed: input.seed } : {}),
      output_format: "png"
    },
    input.references
  );
  return { provider: "ikun" as Image2ProviderName, response };
}

async function requestImage2WithFallback(input: Image2Input, context: { jobDir: string; jobId: string }) {
  const config = await getImageConfig();
  const runningHubConfig = await getRunningHubConfig();
  let primaryError: unknown = null;

  if (input.channel === "runninghub") {
    if (!runningHubConfig.apiKey) throw new Error("所选生成通道还没有配置好。");
    try {
      return await requestRunningHubImage2(runningHubConfig, input, context);
    } catch (error) {
      if (input.requestedChannel !== "stable" || !config.apiKey) throw error;
      primaryError = error;
      return requestIkunImage2(config, input);
    }
  }

  if (config.apiKey) {
    try {
      return await requestIkunImage2(config, input);
    } catch (error) {
      primaryError = error;
      if (input.channel === "ikun") throw error;
    }
  } else {
    primaryError = new Error("图片生成主通道还没有配置好。");
    if (input.channel === "ikun") throw primaryError;
  }

  if (!runningHubConfig.apiKey) {
    throw primaryError instanceof Error ? primaryError : new Error("图片生成通道暂时不可用。");
  }
  if (!process.env.VERCEL && process.env.IMAGE2_DISABLE_RUNNINGHUB_FALLBACK === "1") {
    throw primaryError instanceof Error ? primaryError : new Error("图片生成通道暂时不可用。");
  }

  try {
    return await requestRunningHubImage2(runningHubConfig, input, context);
  } catch (runningHubError) {
    const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError ?? "");
    const fallbackMessage = runningHubError instanceof Error ? runningHubError.message : String(runningHubError);
    throw new Error(`主通道失败，备用通道也失败：${primaryMessage || fallbackMessage}`);
  }
}

export async function generateImage2(body: unknown): Promise<Image2GenerationResult> {
  const input = parseImage2Input(body);

  const start = Date.now();
  const jobId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const jobDir = path.join(outputRoot, jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(path.join(jobDir, "prompt.txt"), input.prompt, "utf-8");

  if (imageGenerationMockEnabled()) {
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGNgYPgPAAEDAQB9nU7zAAAAAElFTkSuQmCC",
      "base64"
    );
    await writeFile(
      path.join(jobDir, "response.json"),
      JSON.stringify({ provider: "mock", response: { ok: true, count: input.count } }, null, 2),
      "utf-8"
    );
    const images: GeneratedImage[] = [];
    for (let index = 0; index < input.count; index += 1) {
      const fileName = `generated-${String(index + 1).padStart(2, "0")}.png`;
      await writeFile(path.join(/* turbopackIgnore: true */ jobDir, fileName), pngBuffer);
      images.push({
        name: fileName,
        path: `${jobId}/${fileName}`,
        dataUrl: `data:image/png;base64,${pngBuffer.toString("base64")}`
      });
    }
    return {
      provider: "image2",
      channel: input.channel === "runninghub" ? "runninghub" : "ikun",
      mode: input.references.length > 0 || input.mode !== "text-to-image" ? "image-to-image" : "text-to-image",
      ratio: input.ratio,
      resolution: input.resolution,
      seed: input.seed,
      size: input.size,
      outDir: jobId,
      elapsedSeconds: Math.round((Date.now() - start) / 100) / 10,
      images
    };
  }

  const generation = await requestImage2WithFallback(input, { jobDir, jobId });
  const response = generation.response;

  await writeFile(
    path.join(jobDir, "response.json"),
    JSON.stringify(scrubResponse({ provider: generation.provider, response }), null, 2),
    "utf-8"
  );

  const items = imageItems(response);
  const images: GeneratedImage[] = [];
  const seenSources = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = sourceKeyFromItem(item);
    if (!key || seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  });

  for (const [index, item] of uniqueItems.entries()) {
    const encoded = base64FromItem(item);
    const buffer = encoded ? Buffer.from(encoded, "base64") : await readImageUrl(urlFromItem(item) || "");
    const extension = sniffExtension(buffer, "png");
    const filePath = path.join(/* turbopackIgnore: true */ jobDir, `generated-${String(index + 1).padStart(2, "0")}.${extension}`);
    await writeFile(filePath, buffer);
    images.push({
      name: path.basename(filePath),
      path: `${jobId}/${path.basename(filePath)}`,
      dataUrl: `data:${mimeForExtension(extension)};base64,${buffer.toString("base64")}`
    });
  }

  if (!images.length) {
    throw new Error("图片生成服务没有返回可识别的图片。");
  }

  return {
    provider: "image2",
    channel: generation.provider,
    mode: input.references.length > 0 || input.mode !== "text-to-image" ? "image-to-image" : "text-to-image",
    ratio: input.ratio,
    resolution: input.resolution,
    seed: input.seed,
    size: input.size,
    outDir: jobId,
    elapsedSeconds: Math.round((Date.now() - start) / 100) / 10,
    images
  };
}
