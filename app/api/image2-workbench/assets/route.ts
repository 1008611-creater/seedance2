import { NextRequest, NextResponse } from "next/server";
import { loadImage2WorkbenchData, saveImage2WorkbenchAsset, type WorkbenchAssetKind } from "@/lib/image2-workbench-data";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";

const allowedKinds = new Set<WorkbenchAssetKind>(["person", "clothing", "scene", "motion", "result"]);
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maximumBytes = 12 * 1024 * 1024;

export async function GET() {
  try {
    return NextResponse.json(await loadImage2WorkbenchData());
  } catch (error) {
    return NextResponse.json(
      { error: toUserFacingError(error instanceof Error ? error.message : error, "素材读取失败。") },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") ?? "") as WorkbenchAssetKind;
    if (!(file instanceof File) || !allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "请上传 PNG、JPG 或 WEBP 图片。" }, { status: 400 });
    }
    if (!allowedKinds.has(kind)) {
      return NextResponse.json({ error: "请选择素材分类。" }, { status: 400 });
    }
    if (file.size > maximumBytes) {
      return NextResponse.json({ error: "图片不能超过 12MB。" }, { status: 400 });
    }

    const tags = String(formData.get("tags") ?? "")
      .split(/[,，\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 4);
    const asset = await saveImage2WorkbenchAsset({
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      originalName: file.name,
      kind,
      title: String(formData.get("title") ?? file.name),
      note: String(formData.get("note") ?? ""),
      tags,
      origin: "upload"
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: toUserFacingError(error instanceof Error ? error.message : error, "素材上传失败。") },
      { status: 500 }
    );
  }
}

