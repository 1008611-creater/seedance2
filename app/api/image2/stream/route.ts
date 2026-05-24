import { NextRequest } from "next/server";
import {
  image2FreeQuotaExceededPayload,
  isImage2FreeQuotaExceeded,
  refundImage2FreeQuota,
  reserveImage2FreeQuota
} from "@/lib/image2-free-quota";
import { generateImage2, sanitizeImage2ProviderMessage } from "@/lib/image2-generation";
import { toUserFacingError } from "@/lib/user-facing-error";

export const runtime = "nodejs";
export const maxDuration = 120;

const encoder = new TextEncoder();

function eventChunk(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const startedAt = Date.now();
  let reservation: Awaited<ReturnType<typeof reserveImage2FreeQuota>>;

  try {
    reservation = await reserveImage2FreeQuota(request);
  } catch (error) {
    const payload = isImage2FreeQuotaExceeded(error)
      ? image2FreeQuotaExceededPayload(error)
      : { error: "额度检查失败，请稍后重试。" };

    return new Response(eventChunk("quota", payload), {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no"
      }
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(eventChunk(event, data));
      };

      send("status", {
        elapsedSeconds: 0,
        stage: "任务已提交",
        detail: "正在进入 Image2 生成队列，请保持页面打开。"
      });

      const timer = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
        const stage =
          elapsedSeconds < 25
            ? "正在构图"
            : elapsedSeconds < 55
              ? "细节生成中"
              : elapsedSeconds < 95
                ? "等待图片返回"
                : "仍在排队";
        const detail =
          elapsedSeconds < 95
            ? "页面会自动更新结果，不需要重复点击生成。"
            : "这次比常规时间更久，可能是复杂提示词或服务高峰。";

        send("status", {
          elapsedSeconds,
          stage,
          detail
        });
      }, 5000);

      generateImage2(body)
        .then((result) => {
          clearInterval(timer);
          send("done", { ...result, quota: reservation.quota });
          controller.close();
        })
        .catch(async (error) => {
          clearInterval(timer);
          const quota = await refundImage2FreeQuota(reservation);
          send("error", {
            error: toUserFacingError(sanitizeImage2ProviderMessage(error), "作图失败。"),
            quota
          });
          controller.close();
        });
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}
