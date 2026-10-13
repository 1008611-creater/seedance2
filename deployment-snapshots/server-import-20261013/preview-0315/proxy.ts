import { NextRequest, NextResponse } from "next/server";
import { resolveImage2SiteTarget } from "@/lib/image2-site-target";

const legacyImage2Hosts = new Set(["image2.lsb0713.online", "ai.lsb0713.online"]);
const sceneHosts = new Set(["scene.lsb0713.online"]);

// 配置非法（例如只写了域名没写协议）时回退到默认新域，不能让旧域整站 500。
const image2SiteTarget = resolveImage2SiteTarget();
const image2SiteHosts = new Set(["image2.cauai.fun", image2SiteTarget.hostname.toLowerCase()]);

function requestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

// 保留 pathname 与查询串，目标主机与端口取自配置，协议统一为 https。
function image2TargetUrl(pathname: string, search: string) {
  const url = new URL(`${pathname}${search}`, image2SiteTarget);
  url.protocol = "https:";
  return url;
}

export function proxy(request: NextRequest) {
  const host = requestHost(request);
  const { pathname } = request.nextUrl;

  // 明文 http 访问本站时跳转到 https。
  // 判据是边缘转发的 X-Forwarded-Proto —— 它反映「用户到边缘」的协议，
  // 与边缘回源用 http 还是 https 无关，因此不会与源站形成重定向循环。
  // 逃生开关：IMAGE2_DISABLE_HTTPS_REDIRECT=1 可临时关闭。
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (
    forwardedProto === "http" &&
    image2SiteHosts.has(host) &&
    process.env.IMAGE2_DISABLE_HTTPS_REDIRECT !== "1"
  ) {
    // 用绝对 URL 重建，不要改 clone() 的 host/port ——
    // NextURL 会保留内部端口（如 :3052），导致 Location 带上它、跳转后 502。
    const url = new URL(`${pathname}${request.nextUrl.search}`, `https://${host}`);
    return NextResponse.redirect(url, 301);
  }

  if (legacyImage2Hosts.has(host) && process.env.IMAGE2_DISABLE_LEGACY_REDIRECT !== "1") {
    return NextResponse.redirect(image2TargetUrl(pathname, request.nextUrl.search), 308);
  }

  // 场景域的商用落地页不属于 Image2 案例库站；同名路径统一回到案例库，避免两站内容互相污染。
  if (image2SiteHosts.has(host) && pathname.startsWith("/image2-social-commerce")) {
    const url = request.nextUrl.clone();
    url.pathname = "/image2-cases";
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  if (
    sceneHosts.has(host) &&
    (pathname === "/image2-cases" ||
      pathname.startsWith("/image2-cases/") ||
      pathname === "/admin/image2-cases" ||
      pathname.startsWith("/admin/image2-cases/") ||
      pathname === "/video-studio" ||
      pathname.startsWith("/video-studio/"))
  ) {
    return NextResponse.redirect(image2TargetUrl(pathname, request.nextUrl.search), 308);
  }

  return NextResponse.next();
}

export const config = {
  // 旧域 308 需要覆盖全部页面路径（含 /、/login、/auth/callback、/workbench、/admin），
  // 但要放过：/api（避免在途请求被跨域跳转打断）、/_next 与带扩展名的静态资源。
  // 注：2026-10-06 旧域整条迁移线作废、/migrate 页面已撤除，故不再为它保留豁免；
  // 该路径与其他不存在的页面一致，由旧域 308 送到新域，再由新域返回 404。
  matcher: ["/((?!api/|api$|_next/|.*\\.[^/]+$).*)"]
};