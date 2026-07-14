import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthStatus, requireAdmin } from "@/lib/admin-auth";
import { contentTypeForPictureOutput, safePictureOutputPath } from "@/lib/picture-admin";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";

function filenameFor(filePath: string) {
  return path.basename(filePath).replace(/[^\w.-]/g, "") || "picture.png";
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const pathValue = request.nextUrl.searchParams.get("path") || "";
    const filePath = safePictureOutputPath(pathValue);
    const file = await readFile(/* turbopackIgnore: true */ filePath);

    return new Response(new Uint8Array(file), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filenameFor(filePath)}"`,
        "Content-Type": contentTypeForPictureOutput(filePath)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : error;
    const status = adminAuthStatus(error, 404);
    return NextResponse.json({ error: toUserFacingError(message, "图片不存在或已过期。") }, { status });
  }
}
