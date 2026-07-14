import { NextRequest, NextResponse } from "next/server";
import { loginPictureAccount, PictureAuthError } from "@/lib/picture-auth";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";

function requestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

function safeStatus(error: unknown) {
  return error instanceof PictureAuthError ? error.status : 400;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = await loginPictureAccount({
      host: requestHost(request),
      password: String(body.password ?? ""),
      username: String(body.username ?? "")
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: toUserFacingError(error instanceof Error ? error.message : error, "登录失败。") },
      { status: safeStatus(error) }
    );
  }
}
