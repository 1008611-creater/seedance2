import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminQueue, mutateStore, updateManualGeneration } from "@/lib/store";
import type { GenerationStatus } from "@/lib/types";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request);
    const queue = await mutateStore((state) => adminQueue(state));
    return NextResponse.json(queue);
  } catch (error) {
    return NextResponse.json({ error: toUserFacingError(error instanceof Error ? error.message : error, "后台访问失败。") }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdmin(request);
    const body = await request.json();
    const jobId = String(body.jobId ?? "");
    const status = body.status ? (String(body.status) as GenerationStatus) : undefined;

    const queue = await mutateStore((state) => {
      updateManualGeneration(state, jobId, {
        status,
        progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : undefined,
        videoUrl: typeof body.videoUrl === "string" ? body.videoUrl : undefined,
        coverUrl: typeof body.coverUrl === "string" ? body.coverUrl : undefined,
        operatorName: typeof body.operatorName === "string" ? body.operatorName : undefined,
        externalAccount: typeof body.externalAccount === "string" ? body.externalAccount : undefined,
        sourceTaskUrl: typeof body.sourceTaskUrl === "string" ? body.sourceTaskUrl : undefined,
        operatorNote: typeof body.operatorNote === "string" ? body.operatorNote : undefined,
        userMessage: typeof body.userMessage === "string" ? body.userMessage : undefined,
        errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined
      });
      return adminQueue(state);
    });

    return NextResponse.json(queue);
  } catch (error) {
    return NextResponse.json({ error: toUserFacingError(error instanceof Error ? error.message : error, "任务更新失败。") }, { status: 400 });
  }
}
