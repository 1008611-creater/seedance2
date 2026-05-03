import crypto from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  DURATION_OPTIONS,
  RATIO_OPTIONS,
  VIDEO_MODES,
  type AdminQueueResponse,
  type DailyUsage,
  type DashboardResponse,
  type Entitlement,
  type Generation,
  type LicenseCode,
  type QuotaSummary,
  type UserProfile
} from "./types";
import { addDaysIso, nextShanghaiMidnightIso, nowIso, shanghaiDateKey } from "./time";

type StoreState = {
  users: UserProfile[];
  licenseCodes: LicenseCode[];
  entitlements: Entitlement[];
  dailyUsage: DailyUsage[];
  generations: Generation[];
};

const demoCodes = ["WEEK-SEED-2026", "VIP-720P-7D", "FREEWEEK"];
const fallbackStore: { state?: StoreState } = {};

function storeFilePath() {
  if (process.env.VERCEL) {
    return path.join("/tmp", "seedance-store.json");
  }

  return path.join(process.cwd(), ".data", "seedance-store.json");
}

export function codeHash(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function providerMode() {
  return process.env.BYTEPLUS_API_KEY || process.env.ARK_API_KEY ? "seedance" : "manual";
}

function createDefaultStore(): StoreState {
  const now = nowIso();
  return {
    users: [],
    entitlements: [],
    dailyUsage: [],
    generations: [],
    licenseCodes: demoCodes.map((code, index) => ({
      id: randomId("code"),
      codeHash: codeHash(code),
      plan: "weekly_free",
      maxRedemptions: index === 0 ? 500 : 50,
      redeemedBy: [],
      createdAt: now
    }))
  };
}

async function readStore(): Promise<StoreState> {
  const file = storeFilePath();
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as StoreState;
    fallbackStore.state = parsed;
    return structuredClone(parsed);
  } catch {
    if (fallbackStore.state) return structuredClone(fallbackStore.state);

    const state = createDefaultStore();
    fallbackStore.state = state;
    await writeStore(state);
    return structuredClone(state);
  }
}

async function writeStore(state: StoreState) {
  fallbackStore.state = structuredClone(state);
  const file = storeFilePath();
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Vercel functions can fall back to process memory when the filesystem is not durable.
  }
}

export async function mutateStore<T>(mutator: (state: StoreState) => T | Promise<T>) {
  const state = await readStore();
  const result = await mutator(state);
  await writeStore(state);
  return result;
}

export async function getDashboard(userId: string): Promise<DashboardResponse> {
  return mutateStore((state) => {
    normalizeLegacyGenerations(state);
    const user = ensureUser(state, userId);
    return dashboardForUser(state, user.id);
  });
}

export function ensureUser(state: StoreState, userId: string) {
  const id = userId || randomId("user");
  let user = state.users.find((item) => item.id === id);
  if (!user) {
    user = {
      id,
      displayName: `创作者_${id.slice(-4).toUpperCase()}`,
      createdAt: nowIso()
    };
    state.users.push(user);
  }
  return user;
}

export function updateUser(state: StoreState, userId: string, patch: Partial<UserProfile>) {
  const user = ensureUser(state, userId);
  user.displayName = patch.displayName?.trim() || user.displayName;
  user.email = patch.email?.trim() || user.email;
  return user;
}

export function activeEntitlement(state: StoreState, userId: string) {
  const now = Date.now();
  return state.entitlements
    .filter((item) => item.userId === userId && new Date(item.endsAt).getTime() > now)
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0];
}

export function activateWeeklyEntitlement(state: StoreState, userId: string) {
  const now = nowIso();
  const entitlement: Entitlement = {
    id: randomId("ent"),
    userId,
    plan: "weekly_free",
    startsAt: now,
    endsAt: addDaysIso(now, 7),
    dailyLimit: 2,
    resolution: "720p",
    maxDurationSeconds: 15,
    createdAt: now
  };
  state.entitlements.push(entitlement);
  ensureUsage(state, userId, entitlement.dailyLimit);
  return entitlement;
}

export function redeemCode(state: StoreState, userId: string, code: string) {
  const normalizedHash = codeHash(code);
  const license = state.licenseCodes.find((item) => item.codeHash === normalizedHash);
  if (!license) throw new Error("卡密无效。");
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    throw new Error("卡密已过期。");
  }
  if (license.redeemedBy.includes(userId)) {
    throw new Error("这个账号已经兑换过该卡密。");
  }
  if (license.redeemedBy.length >= license.maxRedemptions) {
    throw new Error("卡密已被兑换完。");
  }

  license.redeemedBy.push(userId);
  return activateWeeklyEntitlement(state, userId);
}

export function claimTrial(state: StoreState, userId: string) {
  const user = ensureUser(state, userId);
  if (user.claimedTrialAt) {
    throw new Error("这个账号已经领取过免费周卡。");
  }
  user.claimedTrialAt = nowIso();
  return activateWeeklyEntitlement(state, userId);
}

export function ensureUsage(state: StoreState, userId: string, limit = 2) {
  const usageDate = shanghaiDateKey();
  let usage = state.dailyUsage.find((item) => item.userId === userId && item.usageDate === usageDate);
  if (!usage) {
    usage = {
      id: randomId("usage"),
      userId,
      usageDate,
      usedCount: 0,
      limitCount: limit,
      updatedAt: nowIso()
    };
    state.dailyUsage.push(usage);
  }
  usage.limitCount = limit;
  return usage;
}

export function consumeQuota(state: StoreState, userId: string) {
  const entitlement = activeEntitlement(state, userId);
  if (!entitlement) throw new Error("周卡未生效，请先领取或兑换卡密。");

  const usage = ensureUsage(state, userId, entitlement.dailyLimit);
  if (usage.usedCount >= usage.limitCount) {
    throw new Error("今日额度已用完，明天 00:00 自动重置。");
  }

  usage.usedCount += 1;
  usage.updatedAt = nowIso();
  return { entitlement, usage };
}

export function refundQuota(state: StoreState, generation: Generation) {
  if (generation.refundedAt) return;
  const usage = state.dailyUsage.find(
    (item) => item.userId === generation.userId && item.usageDate === shanghaiDateKey(new Date(generation.createdAt))
  );
  if (usage) {
    usage.usedCount = Math.max(0, usage.usedCount - 1);
    usage.updatedAt = nowIso();
  }
  generation.refundedAt = nowIso();
}

export function dashboardForUser(state: StoreState, userId: string): DashboardResponse {
  const user = ensureUser(state, userId);
  const entitlement = activeEntitlement(state, userId);
  const quota = quotaForUser(state, userId, entitlement);
  const ownGenerations = state.generations
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    user,
    entitlement,
    quota,
    jobs: ownGenerations.filter((item) => item.status !== "succeeded").slice(0, 8),
    gallery: ownGenerations.filter((item) => item.status === "succeeded").slice(0, 12),
    providerMode: providerMode(),
    ratios: RATIO_OPTIONS,
    durations: DURATION_OPTIONS,
    modes: VIDEO_MODES
  };
}

export function adminQueue(state: StoreState): AdminQueueResponse {
  normalizeLegacyGenerations(state);
  const jobs = state.generations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    jobs,
    totals: {
      queued: jobs.filter((item) => item.status === "queued").length,
      running: jobs.filter((item) => item.status === "running").length,
      succeeded: jobs.filter((item) => item.status === "succeeded").length,
      failed: jobs.filter((item) => item.status === "failed").length,
      expired: jobs.filter((item) => item.status === "expired").length
    },
    providerMode: providerMode()
  };
}

export function updateManualGeneration(
  state: StoreState,
  id: string,
  patch: Partial<Pick<
    Generation,
    | "status"
    | "progress"
    | "videoUrl"
    | "coverUrl"
    | "operatorName"
    | "externalAccount"
    | "sourceTaskUrl"
    | "operatorNote"
    | "userMessage"
    | "errorMessage"
  >>
) {
  const generation = state.generations.find((item) => item.id === id);
  if (!generation) throw new Error("任务不存在。");

  const previousStatus = generation.status;
  generation.status = patch.status ?? generation.status;
  generation.progress = patch.progress ?? generation.progress;
  generation.videoUrl = patch.videoUrl?.trim() || generation.videoUrl;
  generation.coverUrl = patch.coverUrl?.trim() || generation.coverUrl;
  generation.operatorName = patch.operatorName?.trim() || generation.operatorName;
  generation.externalAccount = patch.externalAccount?.trim() || generation.externalAccount;
  generation.sourceTaskUrl = patch.sourceTaskUrl?.trim() || generation.sourceTaskUrl;
  generation.operatorNote = patch.operatorNote?.trim() || generation.operatorNote;
  generation.userMessage = patch.userMessage?.trim() || generation.userMessage;
  generation.errorMessage = patch.errorMessage?.trim() || generation.errorMessage;
  generation.updatedAt = nowIso();

  if (generation.status === "running") {
    generation.progress = Math.max(generation.progress, 18);
  }

  if (generation.status === "succeeded") {
    if (!generation.videoUrl) throw new Error("发布成片前需要填写视频链接。");
    generation.progress = 100;
    generation.completedAt = generation.updatedAt;
    generation.errorMessage = undefined;
  }

  if ((generation.status === "failed" || generation.status === "expired") && previousStatus !== generation.status) {
    generation.progress = 100;
    refundQuota(state, generation);
  }

  return generation;
}

export function quotaForUser(state: StoreState, userId: string, entitlement?: Entitlement): QuotaSummary {
  const limit = entitlement?.dailyLimit ?? 0;
  const usage = entitlement ? ensureUsage(state, userId, limit) : undefined;
  const used = usage?.usedCount ?? 0;
  return {
    active: Boolean(entitlement),
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: nextShanghaiMidnightIso()
  };
}

export function normalizeLegacyGenerations(state: StoreState) {
  for (const generation of state.generations) {
    if ((generation.provider as string) === "mock") {
      generation.provider = "manual";
      if (generation.status === "running") {
        generation.status = "queued";
        generation.progress = 8;
      }
      if (generation.videoUrl?.includes("interactive-examples.mdn.mozilla.net")) {
        generation.videoUrl = undefined;
        generation.completedAt = undefined;
        generation.status = "queued";
        generation.progress = 8;
      }
      generation.updatedAt = nowIso();
    }
  }
}
