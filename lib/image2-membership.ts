import crypto from "crypto";
import { NextRequest } from "next/server";

export type Image2MembershipEntitlement = {
  id: string;
  source: string;
  plan: string;
  status: string;
  startsAt: string;
  endsAt: string;
  dailyLimit: number;
  resolution: string;
  maxDurationSeconds: number;
  canCloudSync: boolean;
  canPromptWorkbench: boolean;
  canBulkExport: boolean;
  canMemberCases: boolean;
  createdAt: string;
};

export type Image2MembershipStatus = {
  storageMode: "supabase-postgres";
  active: boolean;
  activeEntitlement?: Image2MembershipEntitlement;
  entitlements: Image2MembershipEntitlement[];
  user: {
    id: string;
    email?: string;
  };
};

export type SupabaseUser = {
  id: string;
  email?: string;
};

type EntitlementRow = {
  id: string;
  source: string;
  plan: string;
  status: string;
  starts_at: string;
  ends_at: string;
  daily_limit: number;
  resolution: string;
  max_duration_seconds: number;
  can_cloud_sync: boolean;
  can_prompt_workbench: boolean;
  can_bulk_export: boolean;
  can_member_cases: boolean;
  created_at: string;
};

type LicenseCodeRow = {
  id: string;
  plan: string;
  status: string;
  max_redemptions: number;
  redeemed_count: number;
  expires_at: string | null;
  disabled_reason: string | null;
};

const supabaseStorageMode = "supabase-postgres" as const;

export function getSupabaseConfig() {
  return {
    url: (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, ""),
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  };
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    throw new Error("Supabase 会员系统未配置完整，请检查 URL、publishable/anon key 和 secret/service role key。");
  }
  return config;
}

export function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function serviceHeaders(prefer?: string) {
  const config = requireSupabaseConfig();
  const isSecretApiKey = config.serviceRoleKey.startsWith("sb_secret_");
  return {
    apikey: config.serviceRoleKey,
    ...(isSecretApiKey ? {} : { Authorization: `Bearer ${config.serviceRoleKey}` }),
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

export async function parseSupabaseError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  if (!text) return fallback;

  try {
    const data = JSON.parse(text) as { error?: string; error_description?: string; message?: string };
    return data.error_description ?? data.message ?? data.error ?? fallback;
  } catch {
    return text.slice(0, 240) || fallback;
  }
}

export async function getSupabaseUser(
  request: NextRequest,
  loginMessage = "请先登录账号后再查看会员权益。"
): Promise<SupabaseUser> {
  const token = getBearerToken(request);
  if (!token) throw new Error(loginMessage);

  return getSupabaseUserFromAccessToken(token, loginMessage);
}

export async function getSupabaseUserFromAccessToken(
  token: string,
  loginMessage = "登录状态已失效，请重新登录。"
): Promise<SupabaseUser> {
  const config = requireSupabaseConfig();
  if (!token.trim()) throw new Error(loginMessage);

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response, loginMessage));
  }

  const user = (await response.json()) as { id?: string; email?: string };
  if (!user.id) throw new Error("无法识别当前登录账号。");

  return {
    id: user.id,
    email: user.email
  };
}

function toMembershipError(message: string) {
  if (/relation .*entitlements|Could not find the table|schema cache|PGRST205|404/i.test(message)) {
    return "卡密数据库还未完成迁移，请先执行 Image2 license redemption minimal migration。";
  }
  if (/redeem_license_code|function .* not found|PGRST202/i.test(message)) {
    return "卡密兑换 RPC 还未完成迁移，请先执行 Image2 license redemption minimal migration。";
  }
  return message;
}

function toEntitlement(row: EntitlementRow): Image2MembershipEntitlement {
  return {
    id: row.id,
    source: row.source,
    plan: row.plan,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    dailyLimit: row.daily_limit,
    resolution: row.resolution,
    maxDurationSeconds: row.max_duration_seconds,
    canCloudSync: row.can_cloud_sync,
    canPromptWorkbench: row.can_prompt_workbench,
    canBulkExport: row.can_bulk_export,
    canMemberCases: row.can_member_cases,
    createdAt: row.created_at
  };
}

export async function readImage2Membership(user: SupabaseUser): Promise<Image2MembershipStatus> {
  const config = requireSupabaseConfig();
  const response = await fetch(
    `${config.url}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(
      user.id
    )}&select=id,source,plan,status,starts_at,ends_at,daily_limit,resolution,max_duration_seconds,can_cloud_sync,can_prompt_workbench,can_bulk_export,can_member_cases,created_at&order=ends_at.desc&limit=5`,
    {
      headers: serviceHeaders(),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(toMembershipError(await parseSupabaseError(response, "会员权益读取失败。")));
  }

  const entitlements = ((await response.json()) as EntitlementRow[]).map(toEntitlement);
  const now = Date.now();
  const activeEntitlement = entitlements.find(
    (item) => item.status === "active" && new Date(item.endsAt).getTime() > now
  );

  return {
    storageMode: supabaseStorageMode,
    active: Boolean(activeEntitlement),
    activeEntitlement,
    entitlements,
    user
  };
}

export function hashLicenseCode(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function hashAuditValue(value: string) {
  if (!value) return null;
  const salt = process.env.IMAGE2_LICENSE_AUDIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "image2-license-audit-v1";
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "";
}

function redeemReasonMessage(reason: string) {
  const messages: Record<string, string> = {
    disabled: "卡密已被禁用。",
    duplicate: "这个账号已经兑换过该卡密。",
    exhausted: "卡密已被兑换完。",
    expired: "卡密已过期。",
    invalid: "卡密无效。",
    license_not_active: "卡密当前不可用。",
    not_authenticated: "请先登录账号后再兑换卡密。"
  };
  return messages[reason] ?? "卡密兑换失败。";
}

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(toMembershipError(await parseSupabaseError(response, fallback)));
  }

  return (await response.json()) as T;
}

async function writeRedemptionAudit(input: {
  licenseCodeId?: string;
  userId: string;
  entitlementId?: string;
  requestHash: string;
  result: "succeeded" | "invalid" | "expired" | "disabled" | "exhausted" | "duplicate" | "failed";
  failureReason?: string;
  ipHash: string | null;
  userAgent: string;
}) {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/license_redemptions`, {
    method: "POST",
    headers: serviceHeaders("return=minimal"),
    body: JSON.stringify({
      license_code_id: input.licenseCodeId,
      user_id: input.userId,
      entitlement_id: input.entitlementId,
      request_hash: input.requestHash,
      result: input.result,
      failure_reason: input.failureReason,
      ip_hash: input.ipHash,
      user_agent: input.userAgent
    })
  });

  if (!response.ok) {
    throw new Error(toMembershipError(await parseSupabaseError(response, "卡密兑换记录写入失败。")));
  }
}

async function rejectRedemption(input: {
  licenseCodeId?: string;
  userId: string;
  requestHash: string;
  result: "invalid" | "expired" | "disabled" | "exhausted" | "duplicate" | "failed";
  failureReason: string;
  ipHash: string | null;
  userAgent: string;
  reason: string;
}): Promise<never> {
  await writeRedemptionAudit(input);
  throw new Error(redeemReasonMessage(input.reason));
}

async function redeemImage2LicenseWithTables(request: NextRequest, user: SupabaseUser, code: string) {
  const config = requireSupabaseConfig();
  const codeHash = hashLicenseCode(code);
  const ipHash = hashAuditValue(getClientIp(request));
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";

  const licenseResponse = await fetch(
    `${config.url}/rest/v1/license_codes?code_hash=eq.${encodeURIComponent(
      codeHash
    )}&select=id,plan,status,max_redemptions,redeemed_count,expires_at,disabled_reason&limit=1`,
    {
      headers: serviceHeaders(),
      cache: "no-store"
    }
  );
  const licenses = await readJsonResponse<LicenseCodeRow[]>(licenseResponse, "卡密查询失败。");
  const license = licenses[0];

  if (!license) {
    return rejectRedemption({
      userId: user.id,
      requestHash: codeHash,
      result: "invalid",
      failureReason: "license_not_found",
      ipHash,
      userAgent,
      reason: "invalid"
    });
  }

  const duplicateResponse = await fetch(
    `${config.url}/rest/v1/license_redemptions?license_code_id=eq.${encodeURIComponent(
      license.id
    )}&user_id=eq.${encodeURIComponent(user.id)}&result=eq.succeeded&select=id&limit=1`,
    {
      headers: serviceHeaders(),
      cache: "no-store"
    }
  );
  const duplicates = await readJsonResponse<{ id: string }[]>(duplicateResponse, "卡密兑换记录查询失败。");

  if (duplicates.length) {
    return rejectRedemption({
      licenseCodeId: license.id,
      userId: user.id,
      requestHash: codeHash,
      result: "duplicate",
      failureReason: "already_redeemed_by_user",
      ipHash,
      userAgent,
      reason: "duplicate"
    });
  }

  const now = new Date();

  if (license.status === "disabled") {
    return rejectRedemption({
      licenseCodeId: license.id,
      userId: user.id,
      requestHash: codeHash,
      result: "disabled",
      failureReason: license.disabled_reason || "license_disabled",
      ipHash,
      userAgent,
      reason: "disabled"
    });
  }

  if (license.status === "expired" || (license.expires_at && new Date(license.expires_at).getTime() <= now.getTime())) {
    if (license.status === "active") {
      await fetch(`${config.url}/rest/v1/license_codes?id=eq.${encodeURIComponent(license.id)}&status=eq.active`, {
        method: "PATCH",
        headers: serviceHeaders("return=minimal"),
        body: JSON.stringify({ status: "expired" })
      });
    }

    return rejectRedemption({
      licenseCodeId: license.id,
      userId: user.id,
      requestHash: codeHash,
      result: "expired",
      failureReason: "license_expired",
      ipHash,
      userAgent,
      reason: "expired"
    });
  }

  if (license.status === "used" || license.redeemed_count >= license.max_redemptions) {
    if (license.status === "active") {
      await fetch(`${config.url}/rest/v1/license_codes?id=eq.${encodeURIComponent(license.id)}&status=eq.active`, {
        method: "PATCH",
        headers: serviceHeaders("return=minimal"),
        body: JSON.stringify({ status: "used" })
      });
    }

    return rejectRedemption({
      licenseCodeId: license.id,
      userId: user.id,
      requestHash: codeHash,
      result: "exhausted",
      failureReason: "license_exhausted",
      ipHash,
      userAgent,
      reason: "exhausted"
    });
  }

  if (license.status !== "active") {
    return rejectRedemption({
      licenseCodeId: license.id,
      userId: user.id,
      requestHash: codeHash,
      result: "failed",
      failureReason: "license_not_active",
      ipHash,
      userAgent,
      reason: "license_not_active"
    });
  }

  const nextRedeemedCount = license.redeemed_count + 1;
  const nextStatus = nextRedeemedCount >= license.max_redemptions ? "used" : "active";
  const updateResponse = await fetch(
    `${config.url}/rest/v1/license_codes?id=eq.${encodeURIComponent(
      license.id
    )}&status=eq.active&redeemed_count=eq.${license.redeemed_count}&select=id`,
    {
      method: "PATCH",
      headers: serviceHeaders("return=representation"),
      body: JSON.stringify({
        redeemed_count: nextRedeemedCount,
        status: nextStatus
      })
    }
  );
  const updatedLicenses = await readJsonResponse<{ id: string }[]>(updateResponse, "卡密状态更新失败。");

  if (!updatedLicenses.length) {
    return rejectRedemption({
      licenseCodeId: license.id,
      userId: user.id,
      requestHash: codeHash,
      result: "exhausted",
      failureReason: "license_changed_during_redeem",
      ipHash,
      userAgent,
      reason: "exhausted"
    });
  }

  const startsAt = now.toISOString();
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const isPaidPlan = license.plan !== "weekly_free";
  const entitlementResponse = await fetch(`${config.url}/rest/v1/entitlements?select=id`, {
    method: "POST",
    headers: serviceHeaders("return=representation"),
    body: JSON.stringify({
      user_id: user.id,
      source: "license",
      source_license_id: license.id,
      plan: license.plan,
      starts_at: startsAt,
      ends_at: endsAt,
      daily_limit: 2,
      resolution: "720p",
      max_duration_seconds: 15,
      can_cloud_sync: true,
      can_prompt_workbench: isPaidPlan,
      can_bulk_export: isPaidPlan,
      can_member_cases: isPaidPlan
    })
  });
  const entitlements = await readJsonResponse<{ id: string }[]>(entitlementResponse, "会员权益创建失败。");
  const entitlementId = entitlements[0]?.id;

  if (!entitlementId) {
    throw new Error("会员权益创建失败。");
  }

  await writeRedemptionAudit({
    licenseCodeId: license.id,
    userId: user.id,
    entitlementId,
    requestHash: codeHash,
    result: "succeeded",
    ipHash,
    userAgent
  });

  return {
    redemption: {
      ok: true,
      entitlementId,
      plan: license.plan,
      startsAt,
      endsAt
    },
    membership: await readImage2Membership(user)
  };
}

export async function redeemImage2License(request: NextRequest, user: SupabaseUser, code: string) {
  const token = getBearerToken(request);
  if (!token) throw new Error("请先登录账号后再兑换卡密。");

  return redeemImage2LicenseWithTables(request, user, code);
}
