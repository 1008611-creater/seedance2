import { NextRequest, NextResponse } from "next/server";
import { createSeedanceTask, isSeedanceConfigured } from "@/lib/provider";
import {
  consumeQuota,
  dashboardForUser,
  mutateStore,
  randomId,
  refundQuota
} from "@/lib/store";
import { nowIso } from "@/lib/time";
import { DURATION_OPTIONS, RATIO_OPTIONS, VIDEO_MODES, type Generation } from "@/lib/types";
import type { VideoDuration, VideoMode, VideoRatio, VideoResolution } from "@/lib/types";
import { coverForRatio, titleFromPrompt, validateGenerationInput } from "@/lib/video-rules";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId") ?? request.headers.get("x-seedance-user") ?? "";
  const dashboard = await mutateStore((state) => dashboardForUser(state, userId));
  return NextResponse.json({
    ...dashboard,
    ratios: RATIO_OPTIONS,
    durations: DURATION_OPTIONS,
    modes: VIDEO_MODES
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const userId = String(body.userId ?? "");
  let created: Generation | undefined;

  try {
    const input = validateGenerationInput({
      userId,
      prompt: String(body.prompt ?? ""),
      mode: body.mode as VideoMode,
      ratio: body.ratio as VideoRatio,
      durationSeconds: Number(body.durationSeconds) as VideoDuration,
      resolution: body.resolution as VideoResolution,
      style: typeof body.style === "string" ? body.style : undefined,
      seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : undefined,
      generateAudio: Boolean(body.generateAudio),
      privacy: body.privacy === "link" ? "link" : "private",
      assets: Array.isArray(body.assets) ? body.assets : []
    });

    await mutateStore((state) => {
      consumeQuota(state, userId);
      const now = nowIso();
      created = {
        id: randomId("gen"),
        userId,
        title: titleFromPrompt(input.prompt),
        prompt: input.prompt,
        mode: input.mode,
        ratio: input.ratio,
        durationSeconds: input.durationSeconds,
        resolution: "720p",
        style: input.style,
        seed: input.seed,
        generateAudio: input.generateAudio,
        privacy: input.privacy,
        assets: input.assets,
        status: "queued",
        progress: 2,
        provider: isSeedanceConfigured() ? "seedance" : "mock",
        providerTaskId: isSeedanceConfigured() ? undefined : randomId("mock"),
        coverUrl: input.assets[0]?.dataUrl ?? input.assets[0]?.url ?? coverForRatio(input.ratio, state.generations.length),
        createdAt: now,
        updatedAt: now
      };
      state.generations.unshift(created);
    });

    if (!created) throw new Error("任务创建失败。");

    if (created.provider === "seedance") {
      try {
        const providerTask = await createSeedanceTask(created);
        await mutateStore((state) => {
          const generation = state.generations.find((item) => item.id === created?.id);
          if (!generation) return;
          generation.providerTaskId = providerTask.providerTaskId;
          generation.status = "queued";
          generation.progress = 5;
          generation.updatedAt = nowIso();
        });
      } catch (error) {
        await mutateStore((state) => {
          const generation = state.generations.find((item) => item.id === created?.id);
          if (!generation) return;
          generation.status = "failed";
          generation.progress = 100;
          generation.errorMessage = error instanceof Error ? error.message : "Seedance 创建任务失败。";
          generation.updatedAt = nowIso();
          refundQuota(state, generation);
        });
      }
    }

    const dashboard = await mutateStore((state) => dashboardForUser(state, userId));
    return NextResponse.json({
      ...dashboard,
      ratios: RATIO_OPTIONS,
      durations: DURATION_OPTIONS,
      modes: VIDEO_MODES
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提交失败。" }, { status: 400 });
  }
}
