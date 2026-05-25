import crypto from "crypto";
import type { NextRequest } from "next/server";
import {
  getBearerToken,
  getSupabaseUser,
  hashLicenseCode,
  parseSupabaseError,
  requireSupabaseConfig,
  serviceHeaders,
  type SupabaseUser
} from "@/lib/image2-membership";
import {
  image2FreeQuotaExceededPayload,
  isImage2FreeQuotaExceeded,
  refundImage2FreeQuota,
  reserveImage2FreeQuota,
  type Image2FreeQuotaReservation,
  type Image2FreeQuotaStatus
} from "@/lib/image2-free-quota";

export type Image2WalletSummary = {
  balance: number;
  lifetimeCredited: number;
  lifetimeSpent: number;
  updatedAt?: string;
};

export type Image2WalletTransaction = {
  id: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  source?: string;
  status: string;
  type: string;
};

export type Image2WalletStatus = {
  storageMode: "supabase-postgres";
  user: {
    id: string;
    email?: string;
  };
  wallet: Image2WalletSummary;
  recentTransactions: Image2WalletTransaction[];
};

type WalletRow = {
  balance: number;
  lifetime_credited: number;
  lifetime_spent: number;
  updated_at: string;
};

type WalletTransactionRow = {
  id: string;
  amount: number;
  balance_after: number;
  created_at: string;
  source: string | null;
  status: string;
  type: string;
};

type WalletRpcResult = {
  ok?: boolean;
  reason?: string;
  redemption?: {
    credits?: number;
    plan?: string;
    transactionId?: string;
  };
  transactionId?: string;
  wallet?: Partial<Image2WalletSummary>;
};

export type Image2BalanceRedemption = {
  credits: number;
  plan: string;
  transactionId?: string;
};

export type Image2BalanceRedemptionResult = {
  redemption: Image2BalanceRedemption;
  wallet: Image2WalletStatus;
};

type PaidBalanceReservation = {
  transactionId?: string;
  userId: string;
  wallet?: Image2WalletSummary;
};

export type Image2GenerationUsageReservation =
  | {
      kind: "free";
      quota: Image2FreeQuotaStatus;
      reservation: Image2FreeQuotaReservation;
    }
  | {
      kind: "paid";
      reservation: PaidBalanceReservation;
      wallet?: Image2WalletSummary;
      quota?: Image2FreeQuotaStatus;
    };

export const image2BalanceInsufficientCode = "IMAGE2_BALANCE_INSUFFICIENT";
export const image2LoginRequiredForBalanceCode = "IMAGE2_LOGIN_REQUIRED_FOR_BALANCE";

export class Image2LegacyLicenseCodeError extends Error {
  code = "IMAGE2_LEGACY_LICENSE_CODE" as const;
}

export class Image2BalanceInsufficientError extends Error {
  code = image2BalanceInsufficientCode;
  quota?: Image2FreeQuotaStatus;
  wallet?: Image2WalletSummary;

  constructor(message: string, input?: { quota?: Image2FreeQuotaStatus; wallet?: Image2WalletSummary }) {
    super(message);
    this.name = "Image2BalanceInsufficientError";
    this.quota = input?.quota;
    this.wallet = input?.wallet;
  }
}

function toWalletError(message: string) {
  if (/image2_wallets|image2_wallet_transactions|image2_redeem_balance_code|image2_apply_wallet_delta|schema cache|PGRST202|PGRST205|404/i.test(message)) {
    return "余额数据库还未完成迁移，请先执行 Image2 wallet balance migration。";
  }
  return message;
}

function hashAuditValue(value: string) {
  if (!value) return null;
  const salt = process.env.IMAGE2_LICENSE_AUDIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "image2-wallet-audit-v1";
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "";
}

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(toWalletError(await parseSupabaseError(response, fallback)));
  }

  return (await response.json()) as T;
}

function normalizeWallet(value?: Partial<Image2WalletSummary> | null): Image2WalletSummary {
  return {
    balance: Math.max(0, Number(value?.balance ?? 0) || 0),
    lifetimeCredited: Math.max(0, Number(value?.lifetimeCredited ?? 0) || 0),
    lifetimeSpent: Math.max(0, Number(value?.lifetimeSpent ?? 0) || 0),
    updatedAt: value?.updatedAt
  };
}

function toWallet(row?: WalletRow | null): Image2WalletSummary {
  if (!row) return normalizeWallet();
  return {
    balance: Math.max(0, row.balance),
    lifetimeCredited: Math.max(0, row.lifetime_credited),
    lifetimeSpent: Math.max(0, row.lifetime_spent),
    updatedAt: row.updated_at
  };
}

function toTransaction(row: WalletTransactionRow): Image2WalletTransaction {
  return {
    id: row.id,
    amount: row.amount,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
    source: row.source ?? undefined,
    status: row.status,
    type: row.type
  };
}

function redemptionReasonMessage(reason: string) {
  const messages: Record<string, string> = {
    disabled: "卡密已被禁用。",
    duplicate: "这个账号已经兑换过该卡密。",
    exhausted: "卡密已被兑换完。",
    expired: "卡密已过期。",
    invalid: "卡密无效。",
    legacy_weekly_free: "这是旧周卡卡密，正在按旧权益兑换。",
    license_not_active: "卡密当前不可用。",
    not_authenticated: "请先登录账号后再兑换卡密。",
    unsupported_credit_plan: "这个卡密不是图片余额包。"
  };
  return messages[reason] ?? "卡密兑换失败。";
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store"
  });
  return readJsonResponse<T>(response, "余额请求失败。");
}

export async function readImage2Wallet(user: SupabaseUser): Promise<Image2WalletStatus> {
  const config = requireSupabaseConfig();
  const walletResponse = await fetch(
    `${config.url}/rest/v1/image2_wallets?user_id=eq.${encodeURIComponent(
      user.id
    )}&select=balance,lifetime_credited,lifetime_spent,updated_at&limit=1`,
    {
      headers: serviceHeaders(),
      cache: "no-store"
    }
  );
  const walletRows = await readJsonResponse<WalletRow[]>(walletResponse, "余额读取失败。");

  const transactionResponse = await fetch(
    `${config.url}/rest/v1/image2_wallet_transactions?user_id=eq.${encodeURIComponent(
      user.id
    )}&select=id,amount,balance_after,created_at,source,status,type&order=created_at.desc&limit=8`,
    {
      headers: serviceHeaders(),
      cache: "no-store"
    }
  );
  const transactionRows = await readJsonResponse<WalletTransactionRow[]>(transactionResponse, "余额流水读取失败。");

  return {
    storageMode: "supabase-postgres",
    user,
    wallet: toWallet(walletRows[0]),
    recentTransactions: transactionRows.map(toTransaction)
  };
}

export async function redeemImage2BalanceCode(
  request: NextRequest,
  user: SupabaseUser,
  code: string
): Promise<Image2BalanceRedemptionResult> {
  if (!getBearerToken(request)) throw new Error("请先登录账号后再兑换卡密。");

  const result = await rpc<WalletRpcResult>("image2_redeem_balance_code", {
    p_user_id: user.id,
    p_code_hash: hashLicenseCode(code),
    p_ip_hash: hashAuditValue(getClientIp(request)),
    p_user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? ""
  });

  if (!result.ok) {
    if (result.reason === "legacy_weekly_free") throw new Image2LegacyLicenseCodeError(redemptionReasonMessage(result.reason));
    throw new Error(redemptionReasonMessage(result.reason ?? "failed"));
  }

  const redemption = result.redemption;
  const credits = Number(redemption?.credits ?? 0);
  if (!redemption?.plan || credits <= 0) throw new Error("卡密兑换成功但额度返回异常，请刷新余额。");

  return {
    redemption: {
      credits,
      plan: redemption.plan,
      transactionId: redemption.transactionId
    },
    wallet: await readImage2Wallet(user)
  };
}

export function isImage2BalanceInsufficient(error: unknown): error is Image2BalanceInsufficientError {
  return error instanceof Image2BalanceInsufficientError;
}

export function image2BalanceInsufficientPayload(error: Image2BalanceInsufficientError) {
  return {
    code: error.code,
    error: error.message,
    quota: error.quota,
    wallet: error.wallet
  };
}

async function debitImage2Wallet(user: SupabaseUser, quota?: Image2FreeQuotaStatus) {
  const result = await rpc<WalletRpcResult>("image2_apply_wallet_delta", {
    p_user_id: user.id,
    p_amount: -1,
    p_type: "spend",
    p_source: "image2_generation",
    p_source_id: null,
    p_metadata: { unit: "image", reason: "image2_generation" }
  });

  if (!result.ok) {
    const wallet = normalizeWallet(result.wallet);
    throw new Image2BalanceInsufficientError("免费额度已用完，当前账户图片余额不足。", { quota, wallet });
  }

  return {
    transactionId: result.transactionId,
    userId: user.id,
    wallet: normalizeWallet(result.wallet)
  };
}

export async function reserveImage2GenerationUsage(request: NextRequest): Promise<Image2GenerationUsageReservation> {
  try {
    const reservation = await reserveImage2FreeQuota(request);
    return {
      kind: "free",
      quota: reservation.quota,
      reservation
    };
  } catch (error) {
    if (!isImage2FreeQuotaExceeded(error)) throw error;

    const token = getBearerToken(request);
    if (!token) {
      throw new Image2BalanceInsufficientError("免费额度已用完，请登录后兑换图片额度。", {
        quota: error.quota
      });
    }

    let user: SupabaseUser;
    try {
      user = await getSupabaseUser(request, "免费额度已用完，请登录后兑换图片额度。");
    } catch {
      throw new Image2BalanceInsufficientError("免费额度已用完，请重新登录后兑换图片额度。", {
        quota: error.quota
      });
    }

    const paid = await debitImage2Wallet(user, error.quota);
    return {
      kind: "paid",
      quota: error.quota,
      reservation: paid,
      wallet: paid.wallet
    };
  }
}

export async function refundImage2GenerationUsage(reservation: Image2GenerationUsageReservation) {
  if (reservation.kind === "free") {
    return {
      quota: await refundImage2FreeQuota(reservation.reservation)
    };
  }

  const transactionId = reservation.reservation.transactionId;
  if (!transactionId) return { wallet: reservation.wallet };

  const result = await rpc<WalletRpcResult>("image2_apply_wallet_delta", {
    p_user_id: reservation.reservation.userId,
    p_amount: 1,
    p_type: "refund",
    p_source: "image2_generation_refund",
    p_source_id: transactionId,
    p_metadata: { unit: "image", reason: "generation_failed", spendTransactionId: transactionId }
  }).catch(() => null);

  return {
    wallet: normalizeWallet(result?.wallet ?? reservation.wallet)
  };
}

export function image2UsagePayload(reservation: Image2GenerationUsageReservation) {
  if (reservation.kind === "free") {
    return { quota: reservation.quota };
  }

  return {
    quota: reservation.quota,
    wallet: reservation.wallet
  };
}

export function image2GenerationAccessPayload(error: unknown) {
  if (isImage2FreeQuotaExceeded(error)) return image2FreeQuotaExceededPayload(error);
  if (isImage2BalanceInsufficient(error)) return image2BalanceInsufficientPayload(error);
  return null;
}
