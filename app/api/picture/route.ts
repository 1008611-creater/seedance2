export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { generateImage2, getImage2PublicConfig, sanitizeImage2ProviderMessage } from "@/lib/image2-generation";
import { requirePictureUser } from "@/lib/picture-auth";
import { savePictureGenerationHistory } from "@/lib/picture-history";
import { toUserFacingError } from "@/lib/user-facing-error";

function publicPicturePayload(result: Awaited<ReturnType<typeof generateImage2>>, requestedMode?: unknown) {
  const mode = requestedMode === "smart-edit" ? "smart-edit" : result.mode;
  return {
    provider: "picture",
    channel: result.channel === "runninghub" ? "stable" : "fast",
    mode,
    ratio: result.ratio,
    resolution: result.resolution,
    seed: result.seed,
    elapsedSeconds: result.elapsedSeconds,
    images: result.images.map((image, index) => {
      const extension = image.name.split(".").pop() || "png";
      return {
        dataUrl: image.dataUrl,
        path: image.path,
        name: `picture-${String(index + 1).padStart(2, "0")}.${extension}`
      };
    })
  };
}

export async function GET() {
  const config = await getImage2PublicConfig();
  return NextResponse.json({
    provider: "picture",
    configured: config.configured,
    channels: {
      auto: config.channels.auto,
      fast: config.channels.ikun,
      stable: config.channels.runninghub
    },
    authRequired: true,
    historyEnabled: true,
    ratios: config.ratios,
    resolutions: config.resolutions,
    sizes: config.sizes
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = String(body?.prompt ?? "").trim();
    if (prompt.length < 12) {
      return NextResponse.json({ error: "提示词太短，至少写清主体、场景和画面要求。" }, { status: 400 });
    }

    const user = await requirePictureUser(request);
    const result = await generateImage2(body);
    const payload = publicPicturePayload(result, body?.mode);
    const historyItem = await savePictureGenerationHistory({
      prompt,
      result: payload,
      user
    });
    return NextResponse.json({ ...payload, historyItem });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const status = /登录|账号|认证|会话|token/i.test(rawMessage) ? 401 : 500;
    return NextResponse.json({ error: toUserFacingError(sanitizeImage2ProviderMessage(error), "作图失败。") }, { status });
  }
}
