import type { NextRequest } from "next/server";
import { getSupabaseUser } from "@/lib/image2-membership";
import { isImage2GachaSupabaseEnabled, type Image2GachaStoreContext } from "@/lib/image2-gacha-store";
import { isProductionRuntime } from "@/lib/runtime-access";

export async function resolveImage2GachaContext(
  request: NextRequest,
  loginMessage = "请先登录账号后再使用云端抽卡。"
): Promise<Image2GachaStoreContext> {
  if (!isImage2GachaSupabaseEnabled()) {
    if (isProductionRuntime()) throw new Error("抽卡云端存储未配置，服务暂不可用。");
    return {};
  }
  const user = await getSupabaseUser(request, loginMessage);
  return { userId: user.id };
}

export function image2GachaErrorStatus(message: string) {
  if (message.includes("未配置")) return 503;
  return message.includes("登录") ? 401 : 400;
}
