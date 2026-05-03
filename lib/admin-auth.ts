import type { NextRequest } from "next/server";

export function requireAdmin(request: NextRequest) {
  const configured = process.env.ADMIN_TOKEN?.trim();
  if (!configured) {
    throw new Error("后台口令未配置，请先在 Vercel 环境变量里设置 ADMIN_TOKEN。");
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-admin-token")?.trim();
  const token = bearer || header;

  if (token !== configured) {
    throw new Error("后台口令不正确。");
  }
}
