import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, getSupabaseUser } from "./image2-membership";
import { loadImage2WorkbenchData, loadPublicImage2WorkbenchData, type WorkbenchAccessState } from "./image2-workbench-data";

export class Image2WorkbenchAccessError extends Error {
  code: "not_authenticated" | "not_whitelisted" | "not_configured";
  status: 401 | 403;

  constructor(message: string, status: 401 | 403, code: Image2WorkbenchAccessError["code"]) {
    super(message);
    this.name = "Image2WorkbenchAccessError";
    this.status = status;
    this.code = code;
  }
}

function normalizeEmail(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function configuredTeamEmails() {
  return new Set(
    (process.env.IMAGE2_WORKBENCH_TEAM_EMAILS ?? "")
      .split(/[,;\s]+/)
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function isImage2WorkbenchTeamEmail(email: string | undefined) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return configuredTeamEmails().has(normalized);
}

export async function getImage2WorkbenchAccess(request: NextRequest): Promise<WorkbenchAccessState> {
  const token = getBearerToken(request);
  if (!token) {
    return {
      isAuthenticated: false,
      isTeamMember: false,
      message: "团队素材仅对登录且通过白名单的成员开放。",
      mode: "public"
    };
  }

  let user: Awaited<ReturnType<typeof getSupabaseUser>>;
  try {
    user = await getSupabaseUser(request, "请先登录团队账号。");
  } catch (error) {
    throw new Image2WorkbenchAccessError(
      error instanceof Error ? error.message : "登录状态已失效，请重新登录。",
      401,
      "not_authenticated"
    );
  }
  const email = normalizeEmail(user.email);
  const hasWhitelist = configuredTeamEmails().size > 0;
  const isTeamMember = hasWhitelist && isImage2WorkbenchTeamEmail(email);

  return {
    email: user.email,
    isAuthenticated: true,
    isTeamMember,
    message: isTeamMember
      ? "团队成员已验证。"
      : hasWhitelist
        ? "该邮箱尚未加入团队白名单。"
        : "团队白名单尚未配置。",
    mode: isTeamMember ? "team" : "public"
  };
}

export async function requireImage2WorkbenchTeamMember(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    throw new Image2WorkbenchAccessError("请先登录团队账号。", 401, "not_authenticated");
  }

  const access = await getImage2WorkbenchAccess(request);
  if (!access.isTeamMember) {
    throw new Image2WorkbenchAccessError(
      access.message || "该邮箱尚未加入团队白名单。",
      403,
      access.message === "团队白名单尚未配置。" ? "not_configured" : "not_whitelisted"
    );
  }

  return access;
}

export async function image2WorkbenchAccessResponse(error: unknown) {
  if (error instanceof Image2WorkbenchAccessError) {
    const access: WorkbenchAccessState = {
      isAuthenticated: error.status !== 401,
      isTeamMember: false,
      message: error.message,
      mode: "public"
    };
    return NextResponse.json(
      {
        ...(await loadPublicImage2WorkbenchData(access)),
        error: error.message,
        code: error.code
      },
      { status: error.status }
    );
  }

  return null;
}

export async function loadImage2WorkbenchDataForRequest(request: NextRequest) {
  const access = await getImage2WorkbenchAccess(request);
  if (!access.isAuthenticated) return loadPublicImage2WorkbenchData(access);
  if (!access.isTeamMember) {
    throw new Image2WorkbenchAccessError(
      access.message || "该邮箱尚未加入团队白名单。",
      403,
      access.message === "团队白名单尚未配置。" ? "not_configured" : "not_whitelisted"
    );
  }
  return loadImage2WorkbenchData(access);
}
