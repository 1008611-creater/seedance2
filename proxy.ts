import { NextRequest, NextResponse } from "next/server";

const image2Hosts = new Set(["image2.lsb0713.online", "ai.lsb0713.online"]);
const sceneHosts = new Set(["scene.lsb0713.online"]);

function requestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

export function proxy(request: NextRequest) {
  const host = requestHost(request);
  const { pathname } = request.nextUrl;

  if (image2Hosts.has(host) && pathname.startsWith("/image2-social-commerce")) {
    const url = request.nextUrl.clone();
    url.pathname = "/image2-cases";
    url.search = "";
    return NextResponse.redirect(url);
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
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.hostname = "image2.lsb0713.online";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/image2-social-commerce",
    "/image2-social-commerce/:path*",
    "/image2-cases",
    "/image2-cases/:path*",
    "/admin/image2-cases",
    "/admin/image2-cases/:path*",
    "/video-studio",
    "/video-studio/:path*"
  ]
};
