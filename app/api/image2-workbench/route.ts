import { NextResponse } from "next/server";
import { loadImage2WorkbenchData } from "@/lib/image2-workbench-data";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await loadImage2WorkbenchData());
  } catch (error) {
    return NextResponse.json(
      { error: toUserFacingError(error instanceof Error ? error.message : error, "工作台数据读取失败。") },
      { status: 500 }
    );
  }
}

