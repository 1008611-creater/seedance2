import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

const outputRoot = path.resolve(
  process.env.DAIHUO_OUTPUT_ROOT
    ? path.join(process.env.DAIHUO_OUTPUT_ROOT, "image2-studio")
    : process.env.VERCEL
      ? path.join(os.tmpdir(), "image2-studio")
      : path.join(process.cwd(), "outputs", "image2-studio")
);

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function isSupportedImage(filePath: string) {
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(path.extname(filePath).toLowerCase());
}

function safeOutputPath(segments: string[]) {
  const cleanSegments = segments
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean);
  if (!cleanSegments.length || cleanSegments.some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    throw new Error("图片路径不可读取。");
  }

  const filePath = path.resolve(outputRoot, ...cleanSegments);
  const rootWithSep = `${outputRoot}${path.sep}`;
  if (filePath !== outputRoot && !filePath.startsWith(rootWithSep)) {
    throw new Error("图片路径不可读取。");
  }
  if (!isSupportedImage(filePath)) {
    throw new Error("只允许读取图片文件。");
  }
  return filePath;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const filePath = safeOutputPath(params.path ?? []);
    const file = await readFile(/* turbopackIgnore: true */ filePath);

    return new Response(new Uint8Array(file), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentTypeFor(filePath)
      }
    });
  } catch {
    return NextResponse.json({ error: "图片不存在或已过期。" }, { status: 404 });
  }
}
