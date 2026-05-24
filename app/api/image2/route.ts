import { NextRequest, NextResponse } from "next/server";
import {
  image2FreeQuotaExceededPayload,
  isImage2FreeQuotaExceeded,
  refundImage2FreeQuota,
  reserveImage2FreeQuota
} from "@/lib/image2-free-quota";
import { generateImage2, getImage2PublicConfig, sanitizeImage2ProviderMessage } from "@/lib/image2-generation";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const config = await getImage2PublicConfig();
  return NextResponse.json({
    provider: "image2",
    configured: config.configured,
    sizes: config.sizes
  });
}

export async function POST(request: NextRequest) {
  let reservation: Awaited<ReturnType<typeof reserveImage2FreeQuota>> | null = null;

  try {
    reservation = await reserveImage2FreeQuota(request);
    const result = await generateImage2(await request.json());
    return NextResponse.json({ ...result, quota: reservation.quota });
  } catch (error) {
    if (isImage2FreeQuotaExceeded(error)) {
      return NextResponse.json(image2FreeQuotaExceededPayload(error), { status: 429 });
    }

    if (reservation) {
      await refundImage2FreeQuota(reservation);
    }

    return NextResponse.json({ error: toUserFacingError(sanitizeImage2ProviderMessage(error), "作图失败。") }, { status: 500 });
  }
}
