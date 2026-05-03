import type { Generation, GenerationStatus, MediaAsset } from "./types";

type SeedanceCreateResult = {
  providerTaskId: string;
};

type SeedanceTaskResult = {
  status: GenerationStatus;
  videoUrl?: string;
  lastFrameUrl?: string;
  errorMessage?: string;
};

const apiBase = process.env.SEEDANCE_API_BASE ?? "https://ark.ap-southeast.bytepluses.com";
const modelId = process.env.SEEDANCE_MODEL_ID ?? "dreamina-seedance-2-0-260128";

function apiKey() {
  return process.env.BYTEPLUS_API_KEY ?? process.env.ARK_API_KEY;
}

export function isSeedanceConfigured() {
  return Boolean(apiKey());
}

export async function createSeedanceTask(generation: Generation): Promise<SeedanceCreateResult> {
  const key = apiKey();
  if (!key) throw new Error("未配置 BYTEPLUS_API_KEY，当前只能使用模拟生成器。");

  const body: Record<string, unknown> = {
    model: modelId,
    content: buildContent(generation),
    resolution: generation.resolution,
    ratio: generation.ratio,
    duration: generation.durationSeconds,
    generate_audio: generation.generateAudio,
    watermark: false,
    return_last_frame: true,
    safety_identifier: generation.userId
  };

  if (process.env.APP_URL) {
    body.callback_url = `${process.env.APP_URL.replace(/\/$/, "")}/api/provider/seedance/callback`;
  }

  const response = await fetch(`${apiBase}/api/v3/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(providerError(payload, `Seedance 创建任务失败：${response.status}`));
  }

  const providerTaskId = payload.id ?? payload.task_id ?? payload.data?.id;
  if (!providerTaskId) {
    throw new Error("Seedance 创建任务成功，但未返回任务 ID。");
  }

  return { providerTaskId };
}

export async function retrieveSeedanceTask(providerTaskId: string): Promise<SeedanceTaskResult> {
  const key = apiKey();
  if (!key) throw new Error("未配置 BYTEPLUS_API_KEY。");

  const response = await fetch(`${apiBase}/api/v3/contents/generations/tasks/${providerTaskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(providerError(payload, `Seedance 查询任务失败：${response.status}`));
  }

  return normalizeProviderTask(payload);
}

export function normalizeProviderTask(payload: Record<string, any>): SeedanceTaskResult {
  const status = String(payload.status ?? payload.data?.status ?? "queued");
  const normalizedStatus: GenerationStatus =
    status === "succeeded" || status === "failed" || status === "expired"
      ? status
      : status === "running"
        ? "running"
        : "queued";

  return {
    status: normalizedStatus,
    videoUrl: payload.content?.video_url ?? payload.data?.content?.video_url,
    lastFrameUrl: payload.content?.last_frame_url ?? payload.data?.content?.last_frame_url,
    errorMessage: payload.error?.message ?? payload.message ?? payload.data?.error?.message
  };
}

function buildContent(generation: Generation) {
  const content: Record<string, unknown>[] = [];
  const text = [generation.prompt, generation.style ? `风格：${generation.style}` : ""].filter(Boolean).join("\n");

  if (text) {
    content.push({
      type: "text",
      text
    });
  }

  for (const asset of generation.assets) {
    const url = asset.url ?? asset.dataUrl;
    if (!url) continue;
    content.push(assetToProviderContent(asset, url));
  }

  return content;
}

function assetToProviderContent(asset: MediaAsset, url: string) {
  if (asset.kind === "video") {
    return {
      type: "video_url",
      role: asset.role,
      video_url: { url }
    };
  }

  if (asset.kind === "audio") {
    return {
      type: "audio_url",
      role: asset.role,
      audio_url: { url }
    };
  }

  return {
    type: "image_url",
    role: asset.role,
    image_url: { url }
  };
}

function providerError(payload: Record<string, any>, fallback: string) {
  return payload?.error?.message ?? payload?.message ?? payload?.data?.error?.message ?? fallback;
}
