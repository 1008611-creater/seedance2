import type { MetadataRoute } from "next";
import { headers } from "next/headers";

const image2SiteUrl = (process.env.NEXT_PUBLIC_IMAGE2_SITE_URL || "https://image2.cauai.fun").replace(/\/+$/, "");
const sceneSiteUrl = "https://scene.lsb0713.online";
const pictureSiteUrl = "https://picture.lsb0713.online";
const sceneHosts = new Set(["scene.lsb0713.online"]);
const pictureHosts = new Set(["picture.lsb0713.online", "picture.localhost"]);

async function requestHost() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = await requestHost();
  const lastModified = new Date();

  if (sceneHosts.has(host)) {
    return [{ url: `${sceneSiteUrl}/`, lastModified, changeFrequency: "weekly", priority: 1 }];
  }

  if (pictureHosts.has(host)) {
    return [{ url: `${pictureSiteUrl}/`, lastModified, changeFrequency: "weekly", priority: 1 }];
  }

  // 案例详情是前端状态（查询串/hash），不做逐条索引；只收录两个稳定入口页。
  return [
    { url: `${image2SiteUrl}/`, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${image2SiteUrl}/image2-cases`, lastModified, changeFrequency: "daily", priority: 0.9 }
  ];
}