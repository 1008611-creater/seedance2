import { NextRequest, NextResponse } from "next/server";
import { dashboardForUser, mutateStore, redeemCode } from "@/lib/store";
import { DURATION_OPTIONS, RATIO_OPTIONS, VIDEO_MODES } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const userId = String(body.userId ?? "");
  const code = String(body.code ?? "");

  try {
    const dashboard = await mutateStore((state) => {
      redeemCode(state, userId, code);
      return dashboardForUser(state, userId);
    });

    return NextResponse.json({
      ...dashboard,
      ratios: RATIO_OPTIONS,
      durations: DURATION_OPTIONS,
      modes: VIDEO_MODES
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "兑换失败。" }, { status: 400 });
  }
}
