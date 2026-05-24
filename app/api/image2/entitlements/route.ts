import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, readImage2Membership } from "@/lib/image2-membership";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await getSupabaseUser(request);
    return NextResponse.json(await readImage2Membership(user));
  } catch (error) {
    const message = toUserFacingError(error instanceof Error ? error.message : error, "会员权益读取失败。");
    const status = message.includes("登录") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
