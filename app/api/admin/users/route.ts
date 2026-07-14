import { NextRequest, NextResponse } from "next/server";
import { adminAuthStatus, requireAdmin } from "@/lib/admin-auth";
import { listAdminUsers, UnifiedAuthError } from "@/lib/unified-auth";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";

function limitFromRequest(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  return Math.min(Math.max(Number.isFinite(raw) ? Math.floor(raw) : 50, 1), 200);
}

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const authStatus = adminAuthStatus(error, 0);
  if (authStatus) return authStatus;
  if (error instanceof UnifiedAuthError) return error.status;
  return 400;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return NextResponse.json(await listAdminUsers(limitFromRequest(request)));
  } catch (error) {
    return NextResponse.json(
      { error: toUserFacingError(error instanceof Error ? error.message : error, "用户列表读取失败。") },
      { status: statusForError(error) }
    );
  }
}
