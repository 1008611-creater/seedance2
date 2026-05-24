import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedHosts = new Set([
  "gpt-image2.canghe.ai",
  "raw.githubusercontent.com",
  "cms-assets.youmind.com",
  "morphic.com",
  "imgv3.fotor.com",
  "cdnblog.picsart.com",
  "github.com",
  "user-gen-media-assets.s3.amazonaws.com",
  "api.image2studio.com"
]);

const maxBytes = 12 * 1024 * 1024;
const imageCacheHeader = "public, max-age=14400, s-maxage=604800, stale-while-revalidate=2592000";

function isAllowedUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function extensionContentType(pathname: string) {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url") ?? "";
  if (!isAllowedUrl(source)) {
    return NextResponse.json({ error: "图片来源不可用。" }, { status: 404 });
  }

  const sourceUrl = new URL(source);
  let response: Response;

  try {
    response = await fetch(sourceUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "image2-case-library/1.0"
      },
      next: { revalidate: 60 * 60 * 24 * 7 }
    });
  } catch {
    return NextResponse.json({ error: "图片读取超时。" }, { status: 504 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "图片暂时不可用。" }, { status: response.status === 404 ? 404 : 502 });
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    return NextResponse.json({ error: "图片文件过大。" }, { status: 413 });
  }

  const contentType = response.headers.get("content-type") ?? extensionContentType(sourceUrl.pathname);
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "图片格式不可用。" }, { status: 415 });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    return NextResponse.json({ error: "图片文件过大。" }, { status: 413 });
  }

  return new NextResponse(buffer, {
    headers: {
      "Cache-Control": imageCacheHeader,
      "Content-Length": String(buffer.byteLength),
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
