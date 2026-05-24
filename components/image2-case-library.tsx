"use client";

import { type FormEvent, type MouseEvent, type SyntheticEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  Clock3,
  Clipboard,
  ClipboardCheck,
  Crown,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Heart,
  History,
  ImageOff,
  KeyRound,
  LogIn,
  LogOut,
  Loader2,
  Maximize2,
  NotebookPen,
  Radar,
  RotateCcw,
  Search,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  WandSparkles,
  X
} from "lucide-react";
import { toUserFacingError } from "@/lib/user-facing-error";
import type { Image2AssetSnapshot } from "@/lib/types";

type Image2Case = {
  id: number;
  detailKey?: string;
  caseCode?: string;
  sourceCaseId?: string;
  sourceId?: string;
  sourceName?: string;
  title: string;
  category: string;
  categoryLabel: string;
  sourceCategory?: string;
  styles: string[];
  styleLabels: string[];
  scenes: string[];
  sceneLabels: string[];
  imageUrl: string;
  imageAlt: string;
  prompt?: string;
  promptPreview: string;
  promptKind: string;
  sourceLabel?: string;
  sourceUrl?: string;
  githubUrl?: string;
  featured: boolean;
  valueScore: number;
  valueTier: "精选" | "高价值" | "可参考";
  author?: string;
  aspect?: string;
  resolution?: string;
  sourceNote?: string;
  riskNote?: string;
  publishAngle?: string;
  promptStructure?: PromptStructure;
  reuseProfile?: ReuseProfile;
};

type PromptStructure = {
  subject: string;
  style: string;
  composition: string;
  lighting: string;
  materials: string;
  text: string;
};

type ReuseProfile = {
  verdict: "direct" | "study" | "inspiration";
  label: string;
  difficulty: string;
  stability: string;
  sourceConfidence: string;
  note: string;
};

type PromptWorkbenchDraft = {
  caseTitle: string;
  fields: PromptStructure;
  note: string;
  prompt: string;
  updatedAt: string;
};

type PromptReuseHistoryItem = {
  action: "copied" | "generated" | "saved";
  caseKey: string;
  caseTitle: string;
  createdAt: string;
  id: string;
  prompt: string;
};

type CaseCollection = {
  id: string;
  name: string;
  caseKeys: string[];
  createdAt: string;
  updatedAt: string;
};

type CaseNote = {
  caseKey: string;
  note: string;
  updatedAt: string;
};

type CaseAssetState = {
  activeCollectionId: string | null;
  collections: CaseCollection[];
  notes: Record<string, CaseNote>;
};

type AssetSyncStatus = {
  message: string;
  storageMode?: string;
  tone: "idle" | "busy" | "success" | "error";
};

type AccountAuthMode = "login" | "signup" | "recover";

type AccountAuthStatus = {
  message: string;
  tone: "idle" | "busy" | "success" | "error";
};

type MembershipStatus = AccountAuthStatus;

type Image2MembershipEntitlement = {
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

type Image2Membership = {
  active: boolean;
  activeEntitlement?: Image2MembershipEntitlement;
  entitlements: Image2MembershipEntitlement[];
  storageMode: string;
};

type Image2AccountSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: {
    id: string;
    email?: string;
  };
};

type SourceSummary = {
  id: string;
  label: string;
  site: string;
  repository: string;
  count: number;
  licenseNote: string;
};

type SourceRadar = {
  id: string;
  label: string;
  url: string;
  status: string;
  note: string;
};

type CasePayload = {
  source?: {
    site: string;
    repository: string;
    importedAt: string;
    licenseNote: string;
  };
  sources?: SourceSummary[];
  importedAt?: string;
  licenseNote?: string;
  totalCases: number;
  categories: Array<{ value: string; label: string; count: number }>;
  sourceRadar?: SourceRadar[];
  cases: Image2Case[];
};

type GeneratedImage = {
  name: string;
  path: string;
  dataUrl: string;
};

type GenerationResult = {
  outDir: string;
  images: GeneratedImage[];
  elapsedSeconds?: number;
  quota?: Image2FreeQuota;
};

type Image2FreeQuota = {
  blocked: boolean;
  limit: number;
  remaining: number;
  used: number;
};

type GenerationStreamStatus = {
  detail?: string;
  elapsedSeconds?: number;
  stage?: string;
};

type GenerationHistoryItem = GenerationResult & {
  id: string;
  caseId: number;
  caseKey?: string;
  caseCode?: string;
  caseTitle: string;
  createdAt: string;
};

type CaseDetailContentProps = {
  copiedId: number | null;
  freeQuota: Image2FreeQuota | null;
  generation: GenerationResult | null;
  generationError: string;
  generationElapsedSeconds: number;
  generationHistory: GenerationHistoryItem[];
  generationStatus: GenerationStreamStatus | null;
  isGenerating: boolean;
  isFavorite: boolean;
  isPromptLoading: boolean;
  item: Image2Case;
  onCopy: (item: Image2Case) => void;
  onCopyRewrite: () => void;
  onToggleFavorite: (item: Image2Case) => void;
  onImageUnavailable?: (item: Image2Case) => void;
  onGenerate: () => void;
  onGenerateRewrite: () => void;
  onPreviewImage: (preview: ImagePreview) => void;
  onOpenHistory: () => void;
  onOpenQuota: () => void;
  onResetWorkbench: () => void;
  onSaveWorkbench: () => void;
  onSaveCaseNote: () => void;
  onWorkbenchFieldChange: (field: keyof PromptStructure, value: string) => void;
  onWorkbenchNoteChange: (value: string) => void;
  recentReuse: PromptReuseHistoryItem[];
  caseCollections: CaseCollection[];
  selectedCaseCollectionIds: string[];
  rewriteCopiedKey: string | null;
  rewritePrompt: string;
  savedWorkbench?: PromptWorkbenchDraft;
  workbenchFields: PromptStructure;
  workbenchNote: string;
  caseNoteDraft: string;
  caseNoteUpdatedAt?: string;
  onCaseNoteChange: (value: string) => void;
  onClearCaseNote: () => void;
  onToggleCaseCollection: (collectionId: string) => void;
};

type CaseImageProps = {
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  onUnavailable?: () => void;
  onPreview?: () => void;
  previewLabel?: string;
  src: string;
  timeoutMs?: number;
};

type ImagePreview = {
  alt: string;
  meta?: string;
  src: string;
  title: string;
};

const tierOptions = ["全部", "精选", "高价值", "可参考"] as const;
const sortOptions = ["价值优先", "最新优先", "案例编号"] as const;
const image2DataVersion = "20260520-hide-broken-v4";
const favoriteCaseStorageKey = "image2-case-favorites:v1";
const generationHistoryStorageKey = "image2-generation-history:v1";
const promptWorkbenchStorageKey = "image2-prompt-workbench:v1";
const promptReuseHistoryStorageKey = "image2-prompt-reuse-history:v1";
const caseAssetStorageKey = "image2-case-assets:v1";
const assetUserStorageKey = "image2-asset-user-id:v1";
const accountSessionStorageKey = "image2-account-session:v1";
const supabaseAuthUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const isSupabaseAuthConfigured = Boolean(supabaseAuthUrl && supabaseAnonKey);
const maxGenerationHistoryItems = 6;
const maxPromptReuseHistoryItems = 8;
const freeQuotaExhaustedCode = "FREE_QUOTA_EXHAUSTED";
const promptFieldLabels: Array<{ field: keyof PromptStructure; label: string }> = [
  { field: "subject", label: "主体" },
  { field: "style", label: "风格" },
  { field: "composition", label: "构图" },
  { field: "lighting", label: "光线" },
  { field: "materials", label: "材质" },
  { field: "text", label: "文字" }
];
const emptyPromptStructure: PromptStructure = {
  subject: "",
  style: "",
  composition: "",
  lighting: "",
  materials: "",
  text: ""
};
const heroImageOverrides: Record<number, string> = {
  20125: "/image2/hero/case-20125-portrait.jpg",
  20242: "/image2/hero/case-20242-coffee.jpg",
  20243: "/image2/hero/case-20243-fashion.jpg",
  20259: "/image2/hero/case-20259-burger.jpg",
  20275: "/image2/hero/case-20275-bangkok.jpg",
  30001: "/image2/hero/case-30001-vr.jpg"
};

const normalize = (value: string) => value.trim().toLowerCase();
const getCaseKey = (item: Pick<Image2Case, "detailKey" | "id">) => item.detailKey ?? String(item.id);
const withDataVersion = (url: string) => `${url}${url.includes("?") ? "&" : "?"}v=${image2DataVersion}`;

const proxyRemoteImageUrl = (value: string) => {
  if (!value || value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return value;
    return `/api/image2/proxy?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return value;
  }
};

const normalizeCaseImages = (data: CasePayload): CasePayload => ({
  ...data,
  cases: data.cases.map((item) => ({
    ...item,
    imageUrl: proxyRemoteImageUrl(item.imageUrl)
  }))
});

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
};

const formatHistoryTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

const formatMembershipDate = (value?: string) => {
  if (!value) return "未激活";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未激活";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const formatFreeQuotaText = (quota: Image2FreeQuota | null) => {
  if (!quota) return "免费试用额度";
  return quota.remaining > 0 ? `免费剩余 ${quota.remaining}/${quota.limit} 张` : "免费额度已用完";
};

const readAccountSession = () => {
  try {
    const raw = window.localStorage.getItem(accountSessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Image2AccountSession;
    if (!parsed.accessToken || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
};

const persistAccountSession = (session: Image2AccountSession) => {
  window.localStorage.setItem(accountSessionStorageKey, JSON.stringify(session));
  return session;
};

const clearAccountSession = () => {
  window.localStorage.removeItem(accountSessionStorageKey);
};

const supabaseAuthHeaders = (accessToken?: string) => ({
  apikey: supabaseAnonKey,
  "Content-Type": "application/json",
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
});

const toAccountSession = (data: Record<string, unknown>): Image2AccountSession => {
  const user = data.user as { id?: string; email?: string } | undefined;
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken || !user?.id) throw new Error("登录响应缺少会话信息。");

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : undefined;
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    user: {
      id: user.id,
      email: user.email
    }
  };
};

const supabaseAuthRequest = async (path: string, init: RequestInit = {}, accessToken?: string) => {
  if (!isSupabaseAuthConfigured) throw new Error("Supabase 账号入口未配置。");
  const response = await fetch(`${supabaseAuthUrl}/auth/v1/${path}`, {
    ...init,
    headers: {
      ...supabaseAuthHeaders(accessToken),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { message: text.slice(0, 240) };
    }
  }

  if (!response.ok) {
    throw new Error(
      String(data.error_description ?? data.msg ?? data.message ?? data.error ?? "账号请求失败。")
    );
  }

  return data;
};

const getSupabaseUser = async (accessToken: string) => {
  const data = await supabaseAuthRequest("user", { cache: "no-store" }, accessToken);
  const id = typeof data.id === "string" ? data.id : "";
  if (!id) throw new Error("登录状态已失效。");
  return {
    id,
    email: typeof data.email === "string" ? data.email : undefined
  };
};

const signInWithSupabasePassword = async (email: string, password: string) =>
  toAccountSession(
    await supabaseAuthRequest("token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    })
  );

const withAuthRedirect = (path: string, redirectTo?: string) =>
  redirectTo ? `${path}${path.includes("?") ? "&" : "?"}redirect_to=${encodeURIComponent(redirectTo)}` : path;

const getAuthCallbackUrl = (mode: "confirm" | "recovery") => {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth/callback?mode=${mode}`;
};

const signUpWithSupabasePassword = async (email: string, password: string, redirectTo?: string) => {
  const data = await supabaseAuthRequest(withAuthRedirect("signup", redirectTo), {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  return data.access_token ? toAccountSession(data) : null;
};

const recoverSupabasePassword = async (email: string, redirectTo?: string) => {
  await supabaseAuthRequest(withAuthRedirect("recover", redirectTo), {
    method: "POST",
    body: JSON.stringify({ email })
  });
};

const signOutSupabaseSession = async (accessToken: string) => {
  await supabaseAuthRequest("logout", { method: "POST" }, accessToken);
};

const requestImage2Membership = async (session: Image2AccountSession) => {
  const response = await fetch("/api/image2/entitlements", {
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    },
    cache: "no-store"
  });
  const data = (await response.json()) as Image2Membership & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "会员权益读取失败。");
  return data;
};

const redeemImage2License = async (session: Image2AccountSession, code: string) => {
  const response = await fetch("/api/image2/redeem", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code })
  });
  const data = (await response.json()) as { membership?: Image2Membership; error?: string };
  if (!response.ok || !data.membership) throw new Error(data.error ?? "卡密兑换失败。");
  return data.membership;
};

const promptTextHas = (item: Image2Case, pattern: RegExp) => pattern.test(`${item.title} ${item.prompt ?? ""}`);

const normalizePromptStructure = (value: Partial<PromptStructure> | undefined, fallback: PromptStructure) =>
  promptFieldLabels.reduce(
    (fields, { field }) => ({
      ...fields,
      [field]: typeof value?.[field] === "string" && value[field]?.trim() ? value[field]?.trim() : fallback[field]
    }),
    { ...emptyPromptStructure }
  );

const inferPromptStructure = (item: Image2Case): PromptStructure => {
  const fallback: PromptStructure = {
    subject: item.title,
    style: item.styleLabels.slice(0, 3).join("、") || item.categoryLabel || "清晰可复用风格",
    composition:
      item.aspect === "portrait"
        ? "竖向主视觉，主体层级清楚，保留上下安全区"
        : item.aspect === "landscape"
          ? "横向布局，前中后景分层明确"
          : `${item.categoryLabel} 构图，主体优先，留出改写空间`,
    lighting: promptTextHas(item, /light|lighting|shadow|sun|glow|studio|光|阴影|日光/i)
      ? "沿用原提示词的光线方向、反差和氛围"
      : "光线服务主体识别、材质层次和画面焦点",
    materials: promptTextHas(item, /glass|metal|paper|stone|fabric|texture|wood|plastic|marble|材质|纹理|纸|金属|玻璃/i)
      ? "保留关键材质、表面纹理与边缘细节"
      : "补足主体材质、背景表面和细节可信度",
    text: promptTextHas(item, /text|title|headline|copy|logo|label|typography|font|字|标题|文案|排版/i)
      ? "只保留必要文字，指定层级、位置和可读留白"
      : "不强行加字，需要投放时预留文字安全区"
  };

  return normalizePromptStructure(item.promptStructure, fallback);
};

const inferReuseProfile = (item: Image2Case): ReuseProfile => {
  if (item.reuseProfile) return item.reuseProfile;

  const text = `${item.title} ${item.prompt ?? ""} ${item.riskNote ?? ""}`.toLowerCase();
  const brandRisk = /brand|logo|marvel|openai|youtube|meta|spider|品牌|商标|ip|reference_/.test(text);
  const structured = item.promptKind === "JSON/结构化" || /^\s*[\[{]/.test(item.prompt ?? "");
  const sourced = Boolean(item.sourceUrl);

  if (!brandRisk && (structured || (item.prompt ?? "").length >= 260)) {
    return {
      verdict: "direct",
      label: "可直接改写",
      difficulty: structured ? "结构清楚" : "轻改可用",
      stability: structured ? "高" : "中",
      sourceConfidence: sourced ? "来源可追溯" : "来源待核查",
      note: "主体和变量替换后即可进入生成验证。"
    };
  }

  if (brandRisk || item.riskNote?.trim()) {
    return {
      verdict: "study",
      label: "适合拆解",
      difficulty: brandRisk ? "先去品牌" : "需改边界",
      stability: structured ? "中高" : "中",
      sourceConfidence: sourced ? "来源可追溯" : "来源待核查",
      note: "先吸收构图和提示词结构，再替换来源资产与敏感元素。"
    };
  }

  return {
    verdict: "inspiration",
    label: "灵感参考",
    difficulty: "需补变量",
    stability: "待验证",
    sourceConfidence: sourced ? "来源可追溯" : "来源待核查",
    note: "更适合作为方向卡片，生成前先补主体和输出约束。"
  };
};

const buildRewritePrompt = (item: Image2Case, fields: PromptStructure) =>
  [
    `以案例“${item.title}”为参考，生成一张新的 Image2 图像。`,
    `主体：${fields.subject || item.title}。`,
    `风格：${fields.style || item.categoryLabel}。`,
    `构图：${fields.composition || `${item.categoryLabel} 构图，主体优先。`}。`,
    `光线：${fields.lighting || "光线服务主体识别与材质层次。"}。`,
    `材质与细节：${fields.materials || "补足关键材质与边缘细节。"}。`,
    `文字要求：${fields.text || "不强行加字，需要投放时预留文字安全区。"}。`,
    "保留参考案例的可复用结构，但替换来源品牌、角色和受保护资产。"
  ].join("\n");

const readPromptWorkbenchDrafts = () => {
  if (typeof window === "undefined") return {} as Record<string, PromptWorkbenchDraft>;

  try {
    const raw = window.localStorage.getItem(promptWorkbenchStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, PromptWorkbenchDraft] => {
        const draft = entry[1] as PromptWorkbenchDraft;
        return Boolean(
          entry[0] &&
            draft &&
            typeof draft.caseTitle === "string" &&
            typeof draft.note === "string" &&
            typeof draft.prompt === "string" &&
            typeof draft.updatedAt === "string" &&
            draft.fields &&
            promptFieldLabels.every(({ field }) => typeof draft.fields[field] === "string")
        );
      })
    );
  } catch {
    return {};
  }
};

const persistPromptWorkbenchDrafts = (drafts: Record<string, PromptWorkbenchDraft>) => {
  if (typeof window === "undefined") return drafts;

  try {
    if (Object.keys(drafts).length) {
      window.localStorage.setItem(promptWorkbenchStorageKey, JSON.stringify(drafts));
    } else {
      window.localStorage.removeItem(promptWorkbenchStorageKey);
    }
  } catch {
    // Keep the visible draft when browser storage is unavailable.
  }

  return drafts;
};

const readPromptReuseHistory = () => {
  if (typeof window === "undefined") return [] as PromptReuseHistoryItem[];

  try {
    const raw = window.localStorage.getItem(promptReuseHistoryStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is PromptReuseHistoryItem => {
        return Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.caseKey === "string" &&
            typeof item.caseTitle === "string" &&
            typeof item.createdAt === "string" &&
            typeof item.prompt === "string" &&
            ["copied", "generated", "saved"].includes(item.action)
        );
      })
      .slice(0, maxPromptReuseHistoryItems);
  } catch {
    return [];
  }
};

const persistPromptReuseHistory = (items: PromptReuseHistoryItem[]) => {
  const next = items.slice(0, maxPromptReuseHistoryItems);
  if (typeof window === "undefined") return next;

  try {
    if (next.length) {
      window.localStorage.setItem(promptReuseHistoryStorageKey, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(promptReuseHistoryStorageKey);
    }
  } catch {
    // Keep the session list when browser storage is unavailable.
  }

  return next;
};

const readCaseAssetState = (): CaseAssetState => {
  const fallback: CaseAssetState = {
    activeCollectionId: null,
    collections: [],
    notes: {}
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(caseAssetStorageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CaseAssetState>;

    const collections = Array.isArray(parsed.collections)
      ? parsed.collections
          .filter((item): item is CaseCollection => {
            return Boolean(
              item &&
                typeof item.id === "string" &&
                typeof item.name === "string" &&
                typeof item.createdAt === "string" &&
                typeof item.updatedAt === "string" &&
                Array.isArray(item.caseKeys)
            );
          })
          .map((item) => ({
            ...item,
            name: item.name.trim(),
            caseKeys: [...new Set(item.caseKeys.filter((key): key is string => typeof key === "string" && Boolean(key.trim())).map((key) => key.trim()))]
          }))
          .filter((item) => Boolean(item.name))
      : [];

    const notes =
      parsed.notes && typeof parsed.notes === "object" && !Array.isArray(parsed.notes)
        ? Object.fromEntries(
            Object.entries(parsed.notes).filter((entry): entry is [string, CaseNote] => {
              const value = entry[1] as CaseNote;
              return Boolean(
                entry[0] &&
                  value &&
                  typeof value.caseKey === "string" &&
                  typeof value.note === "string" &&
                  typeof value.updatedAt === "string"
              );
            })
          )
        : {};

    const activeCollectionId =
      typeof parsed.activeCollectionId === "string" && collections.some((item) => item.id === parsed.activeCollectionId)
        ? parsed.activeCollectionId
        : null;

    return {
      activeCollectionId,
      collections,
      notes
    };
  } catch {
    return fallback;
  }
};

const persistCaseAssetState = (state: CaseAssetState) => {
  if (typeof window === "undefined") return state;

  try {
    if (!state.collections.length && !Object.keys(state.notes).length && !state.activeCollectionId) {
      window.localStorage.removeItem(caseAssetStorageKey);
    } else {
      window.localStorage.setItem(caseAssetStorageKey, JSON.stringify(state));
    }
  } catch {
    // Keep in-memory state when browser storage is unavailable.
  }

  return state;
};

const uniqueById = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const newerIso = (left?: string, right?: string) => {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return leftTime >= rightTime ? left : right;
};

const mergeCaseAssetSnapshots = (local: Image2AssetSnapshot, remote: Image2AssetSnapshot): Image2AssetSnapshot => {
  const collectionMap = new Map<string, CaseCollection>();
  for (const collection of [...remote.collections, ...local.collections]) {
    const existing = collectionMap.get(collection.id);
    if (!existing) {
      collectionMap.set(collection.id, {
        ...collection,
        caseKeys: [...new Set(collection.caseKeys)]
      });
      continue;
    }

    const updatedAt = newerIso(existing.updatedAt, collection.updatedAt) ?? new Date().toISOString();
    collectionMap.set(collection.id, {
      ...existing,
      name: updatedAt === collection.updatedAt ? collection.name : existing.name,
      caseKeys: [...new Set([...existing.caseKeys, ...collection.caseKeys])],
      updatedAt
    });
  }

  const notes: Record<string, CaseNote> = { ...remote.notes };
  for (const [key, note] of Object.entries(local.notes)) {
    const existing = notes[key];
    if (!existing || (new Date(note.updatedAt).getTime() >= new Date(existing.updatedAt).getTime())) {
      notes[key] = note;
    }
  }

  const promptDrafts: Record<string, PromptWorkbenchDraft> = { ...remote.promptDrafts };
  for (const [key, draft] of Object.entries(local.promptDrafts)) {
    const existing = promptDrafts[key];
    if (!existing || (new Date(draft.updatedAt).getTime() >= new Date(existing.updatedAt).getTime())) {
      promptDrafts[key] = draft;
    }
  }

  return {
    version: "image2-assets-v1",
    favoriteCaseKeys: [...new Set([...remote.favoriteCaseKeys, ...local.favoriteCaseKeys])],
    activeCollectionId: local.activeCollectionId ?? remote.activeCollectionId,
    collections: [...collectionMap.values()],
    notes,
    promptDrafts,
    promptReuseHistory: uniqueById([...local.promptReuseHistory, ...remote.promptReuseHistory])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, maxPromptReuseHistoryItems),
    updatedAt: new Date().toISOString()
  };
};

const progressForStage = (stage?: string, elapsedSeconds = 0) => {
  if (stage === "任务已提交") return 14;
  if (stage === "正在构图") return 36;
  if (stage === "细节生成中") return 68;
  if (stage === "等待图片返回") return 88;
  if (stage === "仍在排队") return 94;
  return getGenerationStage(elapsedSeconds).progress;
};

class FreeQuotaExhaustedError extends Error {
  code = freeQuotaExhaustedCode;
  quota?: Image2FreeQuota;

  constructor(message: string, quota?: Image2FreeQuota) {
    super(message);
    this.name = "FreeQuotaExhaustedError";
    this.quota = quota;
  }
}

const isQuotaPayload = (value: unknown): value is { code?: string; error?: string; quota?: Image2FreeQuota } => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.code === freeQuotaExhaustedCode || Boolean(record.quota);
};

const isFreeQuotaError = (error: unknown): error is FreeQuotaExhaustedError => {
  return error instanceof FreeQuotaExhaustedError || (Boolean(error) && (error as { code?: string }).code === freeQuotaExhaustedCode);
};

const getGenerationStage = (seconds: number) => {
  if (seconds < 8) {
    return {
      label: "任务已提交",
      detail: "正在把提示词和画幅参数送入生成队列。",
      progress: 12
    };
  }
  if (seconds < 28) {
    return {
      label: "正在构图",
      detail: "模型在搭主体、背景和视觉结构，这一段通常看不到中间图。",
      progress: 36
    };
  }
  if (seconds < 58) {
    return {
      label: "细节生成中",
      detail: "纹理、文字、光影和边缘细节会在这一阶段变慢。",
      progress: 68
    };
  }
  if (seconds < 100) {
    return {
      label: "接近完成",
      detail: "正在等待图片返回并写入结果区，高峰期可能会多等一会。",
      progress: 88
    };
  }
  return {
    label: "仍在排队",
    detail: "已超过常规时间，不要重复点击；如果失败，页面会给出错误提示。",
    progress: 94
  };
};

const readGenerationHistory = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(generationHistoryStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is GenerationHistoryItem => {
        return (
          item &&
          typeof item.id === "string" &&
          typeof item.caseId === "number" &&
          typeof item.caseTitle === "string" &&
          Array.isArray(item.images)
        );
      })
      .slice(0, maxGenerationHistoryItems);
  } catch {
    return [];
  }
};

const readFavoriteCaseKeys = () => {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(favoriteCaseStorageKey);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())));
  } catch {
    return new Set<string>();
  }
};

const persistFavoriteCaseKeys = (keys: Set<string>) => {
  if (typeof window === "undefined") return keys;

  try {
    if (keys.size) {
      window.localStorage.setItem(favoriteCaseStorageKey, JSON.stringify([...keys]));
    } else {
      window.localStorage.removeItem(favoriteCaseStorageKey);
    }
  } catch {
    // Keep the session state even when browser storage is unavailable.
  }

  return keys;
};

const persistGenerationHistory = (items: GenerationHistoryItem[]) => {
  if (typeof window === "undefined") return items.slice(0, maxGenerationHistoryItems);
  let next = items.slice(0, maxGenerationHistoryItems);

  while (next.length) {
    try {
      window.localStorage.setItem(generationHistoryStorageKey, JSON.stringify(next));
      return next;
    } catch {
      next = next.slice(0, -1);
    }
  }

  try {
    window.localStorage.removeItem(generationHistoryStorageKey);
  } catch {
    // Local browser storage can be unavailable in private modes.
  }
  return [];
};

async function requestImage2Json(payload: Record<string, unknown>) {
  const response = await fetch("/api/image2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && isQuotaPayload(data) && data.code === freeQuotaExhaustedCode) {
    throw new FreeQuotaExhaustedError(data.error ?? "免费额度已用完，请添加微信领取生图额度。", data.quota);
  }
  if (!response.ok) throw new Error(data.error ?? "生成失败。");
  return data as GenerationResult;
}

async function requestImage2Quota() {
  const response = await fetch("/api/image2/quota", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data.quota as Image2FreeQuota | undefined;
}

async function requestImage2Stream(
  payload: Record<string, unknown>,
  onStatus: (status: GenerationStreamStatus) => void
) {
  const response = await fetch("/api/image2/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    return requestImage2Json(payload);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleEvent = (raw: string) => {
    const lines = raw.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (!dataLines.length) return null;
    const data = JSON.parse(dataLines.join("\n"));
    if (event === "status") {
      onStatus(data as GenerationStreamStatus);
      return null;
    }
    if (event === "error") {
      if (isQuotaPayload(data) && data.code === freeQuotaExhaustedCode) {
        throw new FreeQuotaExhaustedError(data.error ?? "免费额度已用完，请添加微信领取生图额度。", data.quota);
      }
      throw new Error(typeof data.error === "string" ? data.error : "生成失败。");
    }
    if (event === "quota") {
      throw new FreeQuotaExhaustedError(data.error ?? "免费额度已用完，请添加微信领取生图额度。", data.quota);
    }
    if (event === "done") {
      return data as GenerationResult;
    }
    return null;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const raw = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);
      if (raw) {
        const result = handleEvent(raw);
        if (result) return result;
      }
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  throw new Error("生成连接中断，请稍后重试。");
}

function CaseImage({
  alt,
  className,
  loading = "lazy",
  onPreview,
  onUnavailable,
  previewLabel = "查看高清大图",
  src,
  timeoutMs = 12000
}: CaseImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isInView, setIsInView] = useState(loading === "eager");
  const [shellElement, setShellElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setIsInView(loading === "eager");
  }, [loading, src]);

  useEffect(() => {
    if (!shellElement || loading === "eager") return;
    if (!("IntersectionObserver" in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "420px 0px" }
    );

    observer.observe(shellElement);
    return () => observer.disconnect();
  }, [loading, shellElement, src]);

  useEffect(() => {
    if (!isInView || failed || loaded) return;

    const timer = window.setTimeout(() => {
      setFailed(true);
      onUnavailable?.();
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [failed, isInView, loaded, onUnavailable, src, timeoutMs]);

  const handleUnavailable = () => {
    setFailed(true);
    setLoaded(false);
    onUnavailable?.();
  };

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) {
      handleUnavailable();
      return;
    }

    setLoaded(true);
  };

  const shellClassName = `case-image-shell${className ? ` ${className}` : ""}${loaded ? " is-loaded" : ""}${failed ? " is-hidden" : ""}${onPreview ? " can-preview" : ""}`;
  const content = !failed ? (
    <>
      <img alt={alt} loading={loading} src={src} onError={handleUnavailable} onLoad={handleLoad} />
      {onPreview && loaded && (
        <span className="case-image-zoom-cue" aria-hidden="true">
          <Maximize2 />
        </span>
      )}
    </>
  ) : null;

  if (onPreview) {
    return (
      <button
        ref={setShellElement}
        aria-label={previewLabel}
        className={shellClassName}
        title={previewLabel}
        type="button"
        onClick={onPreview}
      >
        {content}
      </button>
    );
  }

  return (
    <div ref={setShellElement} className={shellClassName}>
      {content}
    </div>
  );
}

function CaseDetailContent({
  copiedId,
  freeQuota,
  generation,
  generationError,
  generationElapsedSeconds,
  generationHistory,
  generationStatus,
  isGenerating,
  isFavorite,
  isPromptLoading,
  item,
  onCopy,
  onCopyRewrite,
  onImageUnavailable,
  onGenerate,
  onGenerateRewrite,
  onToggleFavorite,
  onPreviewImage,
  onOpenHistory,
  onOpenQuota,
  onResetWorkbench,
  onSaveWorkbench,
  onSaveCaseNote,
  onWorkbenchFieldChange,
  onWorkbenchNoteChange,
  recentReuse,
  caseCollections,
  selectedCaseCollectionIds,
  rewriteCopiedKey,
  rewritePrompt,
  savedWorkbench,
  workbenchFields,
  workbenchNote,
  caseNoteDraft,
  caseNoteUpdatedAt,
  onCaseNoteChange,
  onClearCaseNote,
  onToggleCaseCollection,
}: CaseDetailContentProps) {
  const hasPrompt = Boolean(item.prompt?.trim());
  const quotaIsBlocked = Boolean(freeQuota?.blocked || freeQuota?.remaining === 0);
  const reuse = inferReuseProfile(item);
  const currentStage = isGenerating
    ? generationStatus?.stage
      ? {
          label: generationStatus.stage,
          detail: generationStatus.detail ?? "页面正在持续等待结果，不需要重复点击生成。",
          progress: progressForStage(generationStatus.stage, generationElapsedSeconds)
        }
      : getGenerationStage(generationElapsedSeconds)
    : {
        label: generation ? "生成完成" : "等待生成",
        detail: generation
          ? `本次用时 ${formatDuration(Math.round(generation.elapsedSeconds ?? 0))}，结果已显示在下方并加入历史记录。`
          : "每张图通常需要 60 到 90 秒，开始后可以留在这个面板等待。",
        progress: generation ? 100 : 0
      };

  return (
    <>
      <CaseImage
        alt={item.imageAlt}
        className="case-detail-cover"
        loading="eager"
        src={item.imageUrl}
        timeoutMs={9000}
        onUnavailable={() => onImageUnavailable?.(item)}
        onPreview={() =>
          onPreviewImage({
            alt: item.imageAlt,
            meta: [item.caseCode ?? `Case ${item.id}`, item.categoryLabel, item.resolution].filter(Boolean).join(" · "),
            src: item.imageUrl,
            title: item.title
          })
        }
      />
      <div className="case-detail-body">
        <p className="case-detail-kicker">
          {item.caseCode ?? `Case ${item.id}`} · {item.sourceName ?? "Canghe"} · {item.valueTier}
        </p>
        <div className="case-detail-heading">
          <h2>{item.title}</h2>
          <button
            aria-pressed={isFavorite}
            className={isFavorite ? "case-favorite-detail active" : "case-favorite-detail"}
            title={isFavorite ? "移出收藏" : "收藏图片与提示词"}
            type="button"
            onClick={() => onToggleFavorite(item)}
          >
            <Heart aria-hidden="true" />
            <span>{isFavorite ? "已收藏" : "收藏"}</span>
          </button>
        </div>
        <div className="case-tag-row">
          {[item.categoryLabel, item.sourceCategory, item.promptKind, item.resolution, `价值 ${item.valueScore}`]
            .filter((tag): tag is string => Boolean(tag))
            .map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
        </div>

        <section className={`case-reuse-profile ${reuse.verdict}`} aria-label="案例复用标注">
          <div>
            <strong>{reuse.label}</strong>
            <span>{reuse.difficulty}</span>
            <span>稳定度 {reuse.stability}</span>
            <span>{reuse.sourceConfidence}</span>
          </div>
          <p>{reuse.note}</p>
        </section>

        <div className="case-prompt-box">
          <h3>提示词记录</h3>
          <pre className={!hasPrompt ? "is-loading" : ""}>
            {hasPrompt
              ? item.prompt
              : isPromptLoading
                ? "正在加载完整提示词，稍等一下就能复制或生成同款。"
                : "完整提示词暂时没有加载成功，请重新点开这个案例。"}
          </pre>
          <div className="case-actions">
            <button disabled={!hasPrompt || isPromptLoading} type="button" onClick={() => onCopy(item)}>
              {copiedId === item.id ? <ClipboardCheck aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
              {copiedId === item.id ? "已复制" : "复制提示词"}
            </button>
            <button disabled={!hasPrompt || isPromptLoading || isGenerating} type="button" onClick={quotaIsBlocked ? onOpenQuota : onGenerate}>
              <WandSparkles aria-hidden="true" />
              {isPromptLoading
                ? "加载提示词"
                : isGenerating
                  ? `生成中 ${formatDuration(generationElapsedSeconds)}`
                  : quotaIsBlocked
                    ? "领取额度"
                    : "免费生成同款"}
            </button>
          </div>
          <p className="case-generate-note">
            <span>{formatFreeQuotaText(freeQuota)}</span>
            每张图通常 60 到 90 秒；页面会持续等待结果，完成后出现在下方“生成结果”，并自动进入“生成历史”。
          </p>
          {(isGenerating || generation) && (
            <div className={`case-generation-status${isGenerating ? " is-running" : " is-done"}`}>
              <div className="case-generation-status-head">
                <span>
                  {isGenerating ? <Clock3 aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                  当前生成
                </span>
                <strong>{isGenerating ? formatDuration(generationElapsedSeconds) : "已完成"}</strong>
              </div>
              <div className="case-generation-progress" aria-hidden="true">
                <span style={{ width: `${currentStage.progress}%` }} />
              </div>
              <div className="case-generation-stage">
                <strong>{currentStage.label}</strong>
                <p>{currentStage.detail}</p>
              </div>
              <div className="case-generation-guides">
                <span>
                  <b>预计</b> 60-90 秒/张
                </span>
                <span>
                  <b>结果</b> 本面板下方
                </span>
                <span>
                  <b>历史</b> 页面会自动保留最近记录
                </span>
              </div>
            </div>
          )}
        </div>

        <section className="case-workbench" aria-label="提示词改写工作台">
          <header>
            <div>
              <small>
                <SlidersHorizontal aria-hidden="true" />
                Prompt Workbench
              </small>
              <h3>改写提示词</h3>
            </div>
            <span>{savedWorkbench ? `已保存 ${formatHistoryTime(savedWorkbench.updatedAt)}` : "本地草稿"}</span>
          </header>

          <div className="case-workbench-fields">
            {promptFieldLabels.map(({ field, label }) => (
              <label key={field}>
                <span>{label}</span>
                <textarea
                  aria-label={`${label}改写字段`}
                  rows={field === "subject" ? 2 : 3}
                  value={workbenchFields[field]}
                  onChange={(event) => onWorkbenchFieldChange(field, event.target.value)}
                />
              </label>
            ))}
          </div>

          <label className="case-workbench-note">
            <span>备注</span>
            <textarea
              aria-label="提示词工作台备注"
              placeholder="项目名、投放渠道或想保留的变量"
              rows={2}
              value={workbenchNote}
              onChange={(event) => onWorkbenchNoteChange(event.target.value)}
            />
          </label>

          <div className="case-workbench-output">
            <strong>改写稿</strong>
            <pre>{rewritePrompt}</pre>
          </div>

          <div className="case-workbench-actions">
            <button type="button" onClick={onCopyRewrite}>
              {rewriteCopiedKey === getCaseKey(item) ? <ClipboardCheck aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
              {rewriteCopiedKey === getCaseKey(item) ? "已复制" : "复制改写稿"}
            </button>
            <button disabled={isGenerating} type="button" onClick={quotaIsBlocked ? onOpenQuota : onGenerateRewrite}>
              <WandSparkles aria-hidden="true" />
              {isGenerating ? `生成中 ${formatDuration(generationElapsedSeconds)}` : quotaIsBlocked ? "领取额度" : "生成改写稿"}
            </button>
            <button type="button" onClick={onSaveWorkbench}>
              <Save aria-hidden="true" />
              保存变体
            </button>
            <button type="button" onClick={onResetWorkbench}>
              <RotateCcw aria-hidden="true" />
              重置
            </button>
          </div>

          {recentReuse.length > 0 && (
            <div className="case-reuse-history" aria-label="最近复用">
              {recentReuse.slice(0, 3).map((record) => (
                <span key={record.id}>
                  <b>{record.action === "saved" ? "保存" : record.action === "generated" ? "生成" : "复制"}</b>
                  {formatHistoryTime(record.createdAt)}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="case-asset-hub" aria-label="项目夹与备注">
          <header>
            <div>
              <small>
                <FolderPlus aria-hidden="true" />
                Asset Hub
              </small>
              <h3>项目夹与备注</h3>
            </div>
            <span>{caseCollections.length ? `${caseCollections.length} 个项目夹` : "本地资产"}</span>
          </header>

          <div className="case-asset-collections">
            <div className="case-asset-collections-head">
              <strong>把当前案例收录到项目夹</strong>
              <small>{selectedCaseCollectionIds.length ? `${selectedCaseCollectionIds.length} 个已收录` : "未收录到任何项目夹"}</small>
            </div>
            <div className="case-asset-collection-list">
              {caseCollections.length ? (
                caseCollections.map((collection) => {
                  const isActive = selectedCaseCollectionIds.includes(collection.id);

                  return (
                    <button
                      key={collection.id}
                      className={isActive ? "active" : ""}
                      type="button"
                      onClick={() => onToggleCaseCollection(collection.id)}
                    >
                      <span>
                        <strong>{collection.name}</strong>
                        <small>{collection.caseKeys.length} 个案例</small>
                      </span>
                      {isActive ? <CheckCircle2 aria-hidden="true" /> : <FolderOpen aria-hidden="true" />}
                    </button>
                  );
                })
              ) : (
                <div className="case-asset-empty">
                  <FolderOpen aria-hidden="true" />
                  <strong>还没有项目夹</strong>
                  <p>先在侧边栏新建一个，再把常用案例收进去。</p>
                </div>
              )}
            </div>
          </div>

          <label className="case-asset-note">
            <span>案例备注</span>
            <textarea
              aria-label="案例备注"
              placeholder="记录这个案例的用途、需要替换的主体、投放渠道或者测试结论。"
              rows={4}
              value={caseNoteDraft}
              onChange={(event) => onCaseNoteChange(event.target.value)}
            />
          </label>

          <div className="case-asset-actions">
            <button type="button" onClick={onSaveCaseNote}>
              <Save aria-hidden="true" />
              保存备注
            </button>
            <button type="button" onClick={onClearCaseNote}>
              <Trash2 aria-hidden="true" />
              清空备注
            </button>
          </div>

          <p className="case-asset-note-meta">
            {caseNoteUpdatedAt ? `已保存 ${formatHistoryTime(caseNoteUpdatedAt)}` : "备注只保存在当前浏览器"}
          </p>
        </section>

        {generationError && <p className="case-error">{generationError}</p>}
        {generation && (
          <div className="case-generation" id="case-generation-result">
            <strong>本地生成结果</strong>
            <small>刚生成的图片会先显示在这里，同时写入下方“生成历史”。</small>
            {generation.images.map((image) => (
              <figure key={image.path}>
                <button
                  aria-label="查看生成图高清大图"
                  className="case-generation-preview-button"
                  type="button"
                  onClick={() =>
                    onPreviewImage({
                      alt: image.name,
                      meta: generation.elapsedSeconds ? `生成耗时 ${formatDuration(Math.round(generation.elapsedSeconds))}` : "生成结果",
                      src: image.dataUrl,
                      title: image.name
                    })
                  }
                >
                  <img alt={image.name} src={image.dataUrl} />
                  <span aria-hidden="true">
                    <Maximize2 />
                  </span>
                </button>
                <figcaption>{image.name}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="case-generation-history" id="case-generation-history">
          <button className="case-history-open-button" type="button" onClick={onOpenHistory}>
            <span>
              <History aria-hidden="true" />
              生成历史
            </span>
            <strong>{generationHistory.length ? `最近 ${generationHistory.length} 次` : "暂无记录"}</strong>
            <small>弹出查看已出图、生成时间和耗时</small>
          </button>
        </div>

        <div className="case-tag-cloud">
          {[...item.styleLabels, ...item.sceneLabels].map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="case-links">
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              {item.sourceLabel || "原始来源"}
            </a>
          )}
          {item.githubUrl && (
            <a href={item.githubUrl} target="_blank" rel="noreferrer">
              <Database aria-hidden="true" />
              GitHub 记录
            </a>
          )}
        </div>
      </div>
    </>
  );
}

function Image2QuotaModal({
  onClose,
  quota
}: {
  onClose: () => void;
  quota: Image2FreeQuota | null;
}) {
  return (
    <section className="case-quota-modal-layer" aria-label="领取生图额度">
      <button aria-label="关闭领取额度弹窗" className="case-quota-modal-backdrop" type="button" onClick={onClose} />
      <div className="case-quota-modal-panel" role="dialog" aria-modal="true" aria-labelledby="case-quota-title">
        <button aria-label="关闭领取额度弹窗" className="case-quota-close" type="button" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        <div className="case-quota-copy">
          <p>免费额度</p>
          <h2 id="case-quota-title">扫码领取更多生图次数</h2>
          <span>
            每个 IP 可免费生成 {quota?.limit ?? 2} 张图。当前免费额度已用完，添加微信后备注
            <b> image2额度 </b>
            领取更多次数。
          </span>
        </div>
        <div className="case-quota-qr-card">
          <img alt="添加微信领取 Image2 生图额度二维码" src="/image2/wechat-quota-qr.jpg" />
          <small>微信扫码添加好友</small>
        </div>
        <button className="case-quota-primary" type="button" onClick={onClose}>
          我已添加，稍后再试
        </button>
      </div>
    </section>
  );
}

function Image2HistoryModal({
  history,
  onClose,
  onSelectHistory
}: {
  history: GenerationHistoryItem[];
  onClose: () => void;
  onSelectHistory: (item: GenerationHistoryItem) => void;
}) {
  return (
    <section className="case-history-modal-layer" aria-label="生成历史">
      <button aria-label="关闭生成历史" className="case-history-modal-backdrop" type="button" onClick={onClose} />
      <div className="case-history-modal-panel" role="dialog" aria-modal="true" aria-labelledby="case-history-title">
        <div className="case-history-modal-head">
          <div>
            <small>本机浏览器保留最近 {maxGenerationHistoryItems} 次</small>
            <h2 id="case-history-title">生成历史</h2>
          </div>
          <button aria-label="关闭生成历史" type="button" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        {history.length ? (
          <div className="case-history-modal-list">
            {history.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => {
                  onSelectHistory(record);
                  onClose();
                }}
              >
                {record.images[0]?.dataUrl ? (
                  <img alt={record.images[0].name} src={record.images[0].dataUrl} />
                ) : (
                  <div className="case-history-thumb" aria-hidden="true">
                    <ImageOff />
                  </div>
                )}
                <span>
                  <small>{record.caseCode ?? `Case ${record.caseId}`}</small>
                  <strong>{record.caseTitle}</strong>
                  <em>
                    {formatHistoryTime(record.createdAt)}
                    {record.elapsedSeconds ? ` · ${formatDuration(Math.round(record.elapsedSeconds))}` : ""}
                    {record.images.length > 1 ? ` · ${record.images.length} 张` : ""}
                  </em>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="case-history-empty">
            <History aria-hidden="true" />
            <strong>还没有生成记录</strong>
            <p>第一次生成成功后，图片、案例名、时间和耗时都会保存在这里。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Image2ImagePreviewModal({
  onClose,
  preview
}: {
  onClose: () => void;
  preview: ImagePreview;
}) {
  return (
    <section className="case-image-preview-layer" aria-label="高清大图预览">
      <button aria-label="关闭高清大图" className="case-image-preview-backdrop" type="button" onClick={onClose} />
      <div className="case-image-preview-panel" role="dialog" aria-modal="true" aria-labelledby="case-image-preview-title">
        <div className="case-image-preview-head">
          <div>
            <small>{preview.meta ?? "Image2 case"}</small>
            <h2 id="case-image-preview-title">{preview.title}</h2>
          </div>
          <button aria-label="关闭高清大图" type="button" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <figure className="case-image-preview-frame">
          <img alt={preview.alt} src={preview.src} />
        </figure>
      </div>
    </section>
  );
}

function mergeCasePayloads(base: CasePayload, extra?: Partial<CasePayload> | null): CasePayload {
  if (!extra) return base;

  const cases = [...(base.cases ?? []), ...((extra.cases as Image2Case[] | undefined) ?? [])];
  const counts = new Map<string, number>();
  for (const item of cases) {
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  }

  const categories = [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label:
        base.categories.find((item) => item.value === value)?.label ??
        extra.categories?.find((item) => item.value === value)?.label ??
        value,
      count
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));

  const mergedSources = [...(base.sources ?? []), ...((extra.sources as SourceSummary[] | undefined) ?? [])].filter(
    (item, index, list) => index === list.findIndex((candidate) => candidate.id === item.id)
  );
  const mergedRadar = [...(base.sourceRadar ?? []), ...((extra.sourceRadar as SourceRadar[] | undefined) ?? [])].filter(
    (item, index, list) => index === list.findIndex((candidate) => candidate.id === item.id)
  );

  return {
    ...base,
    sources: mergedSources.map((item) => ({
      ...item,
      count: cases.filter((entry) => (entry.sourceId ?? "canghe") === item.id).length || item.count
    })),
    sourceRadar: mergedRadar,
    totalCases: cases.length,
    categories,
    importedAt: extra.importedAt ?? base.importedAt,
    cases
  };
}

export function Image2CaseLibrary() {
  const [payload, setPayload] = useState<CasePayload | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState("全部");
  const [category, setCategory] = useState("全部");
  const [tier, setTier] = useState<(typeof tierOptions)[number]>("全部");
  const [sort, setSort] = useState<(typeof sortOptions)[number]>("价值优先");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteCaseKeys, setFavoriteCaseKeys] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [rewriteCopiedKey, setRewriteCopiedKey] = useState<string | null>(null);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, PromptWorkbenchDraft>>({});
  const [promptReuseHistory, setPromptReuseHistory] = useState<PromptReuseHistoryItem[]>([]);
  const [workbenchFields, setWorkbenchFields] = useState<PromptStructure>({ ...emptyPromptStructure });
  const [workbenchNote, setWorkbenchNote] = useState("");
  const [workbenchDirtyKey, setWorkbenchDirtyKey] = useState<string | null>(null);
  const [caseAssetState, setCaseAssetState] = useState<CaseAssetState>({
    activeCollectionId: null,
    collections: [],
    notes: {}
  });
  const [assetUserId, setAssetUserId] = useState("");
  const [assetSyncStatus, setAssetSyncStatus] = useState<AssetSyncStatus>({
    message: "等待同步",
    tone: "idle"
  });
  const [accountSession, setAccountSession] = useState<Image2AccountSession | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [accountAuthMode, setAccountAuthMode] = useState<AccountAuthMode>("login");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordVisible, setAccountPasswordVisible] = useState(false);
  const [accountAuthStatus, setAccountAuthStatus] = useState<AccountAuthStatus>({
    message: isSupabaseAuthConfigured ? "可登录云端账号" : "未配置云端账号",
    tone: "idle"
  });
  const [membership, setMembership] = useState<Image2Membership | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>({
    message: isSupabaseAuthConfigured ? "登录后查看会员权益" : "卡密系统未配置",
    tone: "idle"
  });
  const [licenseCodeDraft, setLicenseCodeDraft] = useState("");
  const [collectionNameDraft, setCollectionNameDraft] = useState("");
  const [caseNoteDraft, setCaseNoteDraft] = useState("");
  const [caseNoteDirtyKey, setCaseNoteDirtyKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationTick, setGenerationTick] = useState(0);
  const [generationError, setGenerationError] = useState("");
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStreamStatus | null>(null);
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>([]);
  const [freeQuota, setFreeQuota] = useState<Image2FreeQuota | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [caseDetails, setCaseDetails] = useState<Record<string, Partial<Image2Case>>>({});
  const [loadingDetailKey, setLoadingDetailKey] = useState<string | null>(null);
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [unavailableImageKeys, setUnavailableImageKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let ignore = false;
    const loadCases = async () => {
      const response = await fetch(withDataVersion("/data/image2-case-library.index.js"), { cache: "no-store" });
      const data = response.ok
        ? normalizeCaseImages((await response.json()) as CasePayload)
        : normalizeCaseImages((await (await fetch(withDataVersion("/data/image2-case-library.json"), { cache: "no-store" })).json()) as CasePayload);

      if (!ignore) {
        if (ignore) return;
        setPayload(data);
        const firstValue = [...data.cases].sort((a, b) => b.valueScore - a.valueScore || b.id - a.id)[0];
        setSelectedKey(firstValue ? getCaseKey(firstValue) : null);
      }
    };
    loadCases();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const shouldLock = isDetailOpen || isHistoryOpen || isQuotaModalOpen || isAuthModalOpen || Boolean(imagePreview);
    if (!shouldLock) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (imagePreview) {
        setImagePreview(null);
        return;
      }
      if (isQuotaModalOpen) {
        setIsQuotaModalOpen(false);
        return;
      }
      if (isHistoryOpen) {
        setIsHistoryOpen(false);
        return;
      }
      if (isAuthModalOpen) {
        setIsAuthModalOpen(false);
        return;
      }
      setIsDetailOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imagePreview, isDetailOpen, isHistoryOpen, isQuotaModalOpen, isAuthModalOpen]);

  useEffect(() => {
    setGenerationHistory(readGenerationHistory());
  }, []);

  useEffect(() => {
    setFavoriteCaseKeys(readFavoriteCaseKeys());
  }, []);

  useEffect(() => {
    setPromptDrafts(readPromptWorkbenchDrafts());
    setPromptReuseHistory(readPromptReuseHistory());
  }, []);

  useEffect(() => {
    setCaseAssetState(readCaseAssetState());
  }, []);

  useEffect(() => {
    let saved = window.localStorage.getItem(assetUserStorageKey);
    if (!saved) {
      saved = crypto.randomUUID();
      window.localStorage.setItem(assetUserStorageKey, saved);
    }
    setAssetUserId(saved);
  }, []);

  useEffect(() => {
    if (!isSupabaseAuthConfigured) return;
    const saved = readAccountSession();
    if (!saved) return;

    setAccountSession(saved);
    setAccountAuthStatus({ message: "正在恢复账号...", tone: "busy" });
    void getSupabaseUser(saved.accessToken)
      .then((user) => {
        const session = persistAccountSession({ ...saved, user });
        setAccountSession(session);
        setAccountEmail(user.email ?? "");
        setAccountAuthStatus({ message: "账号已登录", tone: "success" });
      })
      .catch(() => {
        clearAccountSession();
        setAccountSession(null);
        setAccountAuthStatus({ message: "登录状态已失效，请重新登录", tone: "error" });
      });
  }, []);

  useEffect(() => {
    if (!isSupabaseAuthConfigured) return;
    if (!accountSession) {
      setMembership(null);
      setMembershipStatus({ message: "登录后查看会员权益", tone: "idle" });
      return;
    }

    let ignore = false;
    setMembershipStatus({ message: "正在读取会员权益...", tone: "busy" });
    void requestImage2Membership(accountSession)
      .then((data) => {
        if (ignore) return;
        setMembership(data);
        setMembershipStatus({
          message: data.active
            ? `权益生效中，有效期至 ${formatMembershipDate(data.activeEntitlement?.endsAt)}`
            : "当前账号还没有生效权益",
          tone: data.active ? "success" : "idle"
        });
      })
      .catch((error) => {
        if (ignore) return;
        setMembership(null);
        setMembershipStatus({
          message: toUserFacingError(error instanceof Error ? error.message : error, "会员权益读取失败。"),
          tone: "error"
        });
      });

    return () => {
      ignore = true;
    };
  }, [accountSession?.accessToken]);

  useEffect(() => {
    void requestImage2Quota().then((quota) => {
      if (quota) setFreeQuota(quota);
    });
  }, []);

  useEffect(() => {
    if (!isGenerating || !generationStartedAt) return;

    setGenerationTick(Date.now());
    const timer = window.setInterval(() => {
      setGenerationTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [generationStartedAt, isGenerating]);

  const cases = useMemo(
    () => (payload?.cases ?? []).filter((item) => !unavailableImageKeys.has(getCaseKey(item))),
    [payload, unavailableImageKeys]
  );
  const categories = payload?.categories ?? [];
  const sources = useMemo<SourceSummary[]>(() => {
    if (!payload) return [];
    if (payload.sources?.length) return payload.sources;
    if (payload.source) {
      return [
        {
          id: "canghe",
          label: "Canghe / awesome-gpt-image-2",
          site: payload.source.site,
          repository: payload.source.repository,
          count: payload.totalCases,
          licenseNote: payload.source.licenseNote
        }
      ];
    }
    return [];
  }, [payload]);
  const activeSource = sourceId === "全部" ? null : sources.find((item) => item.id === sourceId) ?? null;
  const activeCollection = caseAssetState.activeCollectionId
    ? caseAssetState.collections.find((item) => item.id === caseAssetState.activeCollectionId) ?? null
    : null;
  const activeCategoryLabel = category === "全部" ? "全部分类" : categories.find((item) => item.value === category)?.label;
  const galleryTitle = [favoritesOnly ? "我的收藏" : null, activeCollection?.name, activeSource?.label, activeCategoryLabel]
    .filter(Boolean)
    .join(" · ");
  const heroCases = useMemo(() => {
    const curatedHeroIds = [20275, 20259, 20243, 30001, 20242, 20125, 20269, 30005, 20313];
    const ordered = [...cases].sort((a, b) => b.valueScore - a.valueScore || b.id - a.id);
    const picks: Image2Case[] = [];
    const seen = new Set<number>();
    const add = (item?: Image2Case) => {
      if (!item || seen.has(item.id)) return;
      seen.add(item.id);
      picks.push(item);
    };

    curatedHeroIds.forEach((id) => add(cases.find((item) => item.id === id)));

    for (const item of ordered) {
      if (picks.length >= 6) break;
      add(item);
    }

    return picks.slice(0, 6);
  }, [cases]);

  const filteredCases = useMemo(() => {
    const q = normalize(query);
    const rows = cases.filter((item) => {
      const matchesSource = sourceId === "全部" || item.sourceId === sourceId || (!item.sourceId && sourceId === "canghe");
      const matchesCategory = category === "全部" || item.category === category;
      const matchesTier = tier === "全部" || item.valueTier === tier;
      const matchesFavorite = !favoritesOnly || favoriteCaseKeys.has(getCaseKey(item));
      const matchesCollection = !activeCollection || activeCollection.caseKeys.includes(getCaseKey(item));
      const haystack = normalize(
        [
          item.id,
          item.caseCode,
          item.title,
          item.categoryLabel,
          item.sourceName,
          item.sourceCategory,
          item.author,
          item.styles.join(" "),
          item.styleLabels.join(" "),
          item.scenes.join(" "),
          item.sceneLabels.join(" "),
          item.promptPreview,
          item.sourceLabel
        ].join(" ")
      );
      return matchesSource && matchesCategory && matchesTier && matchesFavorite && matchesCollection && (!q || haystack.includes(q));
    });

    return rows.sort((a, b) => {
      if (sort === "最新优先") return b.id - a.id;
      if (sort === "案例编号") return a.id - b.id;
      return b.valueScore - a.valueScore || b.id - a.id;
    });
  }, [activeCollection, cases, category, favoriteCaseKeys, favoritesOnly, query, sort, sourceId, tier]);

  const selectedCaseSummary = useMemo(
    () => cases.find((item) => getCaseKey(item) === selectedKey) ?? filteredCases[0] ?? (favoritesOnly ? undefined : cases[0]),
    [cases, favoritesOnly, filteredCases, selectedKey]
  );
  const selectedDetailKey = selectedCaseSummary?.detailKey ?? String(selectedCaseSummary?.id ?? "");
  const selectedCase = selectedCaseSummary
    ? ({ ...selectedCaseSummary, ...(caseDetails[selectedDetailKey] ?? {}) } as Image2Case)
    : undefined;
  const selectedCaseKey = selectedCase ? getCaseKey(selectedCase) : "";
  const selectedWorkbench = selectedCaseKey ? promptDrafts[selectedCaseKey] : undefined;
  const selectedCaseNote = selectedCaseKey ? caseAssetState.notes[selectedCaseKey] : undefined;
  const selectedCaseCollectionIds = useMemo(
    () =>
      selectedCaseKey
        ? caseAssetState.collections
            .filter((collection) => collection.caseKeys.includes(selectedCaseKey))
            .map((collection) => collection.id)
        : [],
    [caseAssetState.collections, selectedCaseKey]
  );
  const selectedRewritePrompt = selectedCase ? buildRewritePrompt(selectedCase, workbenchFields) : "";
  const selectedReuseHistory = useMemo(
    () => (selectedCaseKey ? promptReuseHistory.filter((item) => item.caseKey === selectedCaseKey).slice(0, 3) : []),
    [promptReuseHistory, selectedCaseKey]
  );
  const featuredCount = cases.filter((item) => item.valueTier === "精选").length;
  const highValueCount = cases.filter((item) => item.valueTier === "高价值").length;
  const generationElapsedSeconds =
    isGenerating && generationStartedAt
      ? Math.max(0, Math.floor(((generationTick || Date.now()) - generationStartedAt) / 1000))
      : 0;
  const isSelectedPromptLoading = Boolean(
    selectedCase && !selectedCase.prompt && loadingDetailKey === getCaseKey(selectedCase)
  );
  const selectedHasPrompt = Boolean(selectedCase?.prompt?.trim());
  const favoriteCount = useMemo(
    () => cases.filter((item) => favoriteCaseKeys.has(getCaseKey(item))).length,
    [cases, favoriteCaseKeys]
  );

  const hideUnavailableCase = (item: Image2Case) => {
    const key = getCaseKey(item);
    setUnavailableImageKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setSelectedKey((current) => (current === key ? null : current));
    setGeneration(null);
    setGenerationError("");
    setGenerationStatus(null);
  };

  const toggleFavorite = (item: Image2Case) => {
    const key = getCaseKey(item);
    setFavoriteCaseKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return persistFavoriteCaseKeys(next);
    });
  };

  useEffect(() => {
    if (!selectedCase) return;
    const key = getCaseKey(selectedCase);
    if (workbenchDirtyKey === key) return;
    const savedDraft = promptDrafts[key];
    setWorkbenchFields(savedDraft?.fields ?? inferPromptStructure(selectedCase));
    setWorkbenchNote(savedDraft?.note ?? "");
  }, [promptDrafts, selectedCase?.promptStructure, selectedDetailKey, workbenchDirtyKey]);

  useEffect(() => {
    if (!selectedCaseKey) {
      setCaseNoteDraft("");
      setCaseNoteDirtyKey(null);
      return;
    }
    if (caseNoteDirtyKey === selectedCaseKey) return;
    setCaseNoteDraft(selectedCaseNote?.note ?? "");
  }, [caseNoteDirtyKey, selectedCaseKey, selectedCaseNote?.note]);

  const updateCaseAssets = (updater: (state: CaseAssetState) => CaseAssetState) => {
    setCaseAssetState((current) => persistCaseAssetState(updater(current)));
  };

  const submitAccountAuth = async (event: FormEvent) => {
    event.preventDefault();
    if (!isSupabaseAuthConfigured) return;

    const email = accountEmail.trim();
    const password = accountPassword.trim();
    if (accountAuthMode === "recover") {
      if (!email) {
        setAccountAuthStatus({ message: "请输入要找回密码的邮箱", tone: "error" });
        return;
      }

      setAccountAuthStatus({ message: "正在发送重置邮件...", tone: "busy" });

      try {
        await recoverSupabasePassword(email, getAuthCallbackUrl("recovery"));
        setAccountPassword("");
        setAccountAuthStatus({ message: "已发送重置邮件，请打开邮箱里的链接修改密码", tone: "success" });
      } catch (error) {
        setAccountAuthStatus({
          message: toUserFacingError(error instanceof Error ? error.message : error, "重置邮件发送失败。"),
          tone: "error"
        });
      }
      return;
    }

    if (!email || password.length < 6) {
      setAccountAuthStatus({ message: "请输入邮箱和至少 6 位密码", tone: "error" });
      return;
    }

    setAccountAuthStatus({ message: accountAuthMode === "login" ? "正在登录..." : "正在注册...", tone: "busy" });

    try {
      const session =
        accountAuthMode === "login"
          ? await signInWithSupabasePassword(email, password)
          : await signUpWithSupabasePassword(email, password, getAuthCallbackUrl("confirm"));

      if (!session) {
        setAccountAuthStatus({ message: "注册成功，请完成邮箱验证后登录", tone: "success" });
        setAccountAuthMode("login");
        setAccountPassword("");
        return;
      }

      setAccountSession(persistAccountSession(session));
      setAccountEmail(session.user.email ?? email);
      setAccountPassword("");
      setAccountAuthStatus({ message: accountAuthMode === "login" ? "账号已登录" : "注册并登录成功", tone: "success" });
      closeAccountModal();
    } catch (error) {
      setAccountAuthStatus({
        message: toUserFacingError(error instanceof Error ? error.message : error, "账号请求失败。"),
        tone: "error"
      });
    }
  };

  const signOutAccount = async () => {
    if (!accountSession) return;
    setAccountAuthStatus({ message: "正在退出...", tone: "busy" });

    try {
      await signOutSupabaseSession(accountSession.accessToken);
    } catch {
      // A stale remote session should not prevent local logout.
    }

    clearAccountSession();
    setAccountSession(null);
    setAccountAuthMode("login");
    setMembership(null);
    setLicenseCodeDraft("");
    setAccountPassword("");
    setAccountPasswordVisible(false);
    setAccountAuthStatus({ message: "已退出账号，本地资产仍保留", tone: "success" });
  };

  const submitLicenseRedeem = async (event: FormEvent) => {
    event.preventDefault();
    if (!isSupabaseAuthConfigured) return;
    if (!accountSession) {
      setMembershipStatus({ message: "请先登录账号后再兑换卡密", tone: "error" });
      return;
    }

    const code = licenseCodeDraft.trim();
    if (code.length < 4) {
      setMembershipStatus({ message: "请输入有效卡密", tone: "error" });
      return;
    }

    setMembershipStatus({ message: "正在兑换卡密...", tone: "busy" });

    try {
      const nextMembership = await redeemImage2License(accountSession, code);
      setMembership(nextMembership);
      setLicenseCodeDraft("");
      setMembershipStatus({
        message: nextMembership.active
          ? `卡密兑换成功，有效期至 ${formatMembershipDate(nextMembership.activeEntitlement?.endsAt)}`
          : "卡密兑换成功，权益正在刷新",
        tone: "success"
      });
    } catch (error) {
      setMembershipStatus({
        message: toUserFacingError(error instanceof Error ? error.message : error, "卡密兑换失败。"),
        tone: "error"
      });
    }
  };

  const buildAssetSnapshot = (): Image2AssetSnapshot => ({
    version: "image2-assets-v1",
    favoriteCaseKeys: [...favoriteCaseKeys],
    activeCollectionId: caseAssetState.activeCollectionId,
    collections: caseAssetState.collections,
    notes: caseAssetState.notes,
    promptDrafts,
    promptReuseHistory,
    updatedAt: new Date().toISOString()
  });

  const applyAssetSnapshot = (snapshot: Image2AssetSnapshot) => {
    setFavoriteCaseKeys(persistFavoriteCaseKeys(new Set(snapshot.favoriteCaseKeys)));
    setPromptDrafts(persistPromptWorkbenchDrafts(snapshot.promptDrafts));
    setPromptReuseHistory(persistPromptReuseHistory(snapshot.promptReuseHistory));
    setCaseAssetState(
      persistCaseAssetState({
        activeCollectionId: snapshot.activeCollectionId,
        collections: snapshot.collections,
        notes: snapshot.notes
      })
    );
  };

  const syncAssetsToTemporaryAccount = async () => {
    if (isSupabaseAuthConfigured && !accountSession) {
      setAssetSyncStatus({ message: "请先登录账号后再同步云端资产", tone: "error" });
      return;
    }

    const accountUserId = accountSession?.user.id ?? assetUserId;
    if (!accountUserId) return;
    setAssetSyncStatus({ message: accountSession ? "正在同步云端资产..." : "正在同步本地资产...", tone: "busy" });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-image2-user": accountUserId
      };
      if (accountSession?.accessToken) headers.Authorization = `Bearer ${accountSession.accessToken}`;

      const response = await fetch("/api/image2/assets", {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: accountUserId,
          snapshot: buildAssetSnapshot()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "同步失败。");
      setAssetSyncStatus({
        message: `已同步 ${formatHistoryTime(data.updatedAt ?? data.snapshot?.updatedAt ?? new Date().toISOString())}`,
        storageMode: data.storageMode,
        tone: "success"
      });
    } catch (error) {
      setAssetSyncStatus({
        message: toUserFacingError(error instanceof Error ? error.message : error, "同步失败。"),
        tone: "error"
      });
    }
  };

  const mergeAssetsFromTemporaryAccount = async () => {
    if (isSupabaseAuthConfigured && !accountSession) {
      setAssetSyncStatus({ message: "请先登录账号后再合并云端资产", tone: "error" });
      return;
    }

    const accountUserId = accountSession?.user.id ?? assetUserId;
    if (!accountUserId) return;
    setAssetSyncStatus({ message: accountSession ? "正在合并云端资产..." : "正在合并临时账号资产...", tone: "busy" });

    try {
      const headers: Record<string, string> = {
        "x-image2-user": accountUserId
      };
      if (accountSession?.accessToken) headers.Authorization = `Bearer ${accountSession.accessToken}`;

      const response = await fetch(`/api/image2/assets?userId=${encodeURIComponent(accountUserId)}`, {
        headers,
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "读取失败。");
      const merged = mergeCaseAssetSnapshots(buildAssetSnapshot(), data.snapshot as Image2AssetSnapshot);
      applyAssetSnapshot(merged);
      setAssetSyncStatus({
        message: `已合并 ${formatHistoryTime(merged.updatedAt)}`,
        storageMode: data.storageMode,
        tone: "success"
      });
    } catch (error) {
      setAssetSyncStatus({
        message: toUserFacingError(error instanceof Error ? error.message : error, "合并失败。"),
        tone: "error"
      });
    }
  };

  const createCollection = (event: FormEvent) => {
    event.preventDefault();
    const name = collectionNameDraft.trim();
    if (!name) return;

    const now = new Date().toISOString();
    const id = `collection-${Date.now()}`;
    updateCaseAssets((current) => ({
      ...current,
      activeCollectionId: id,
      collections: [
        ...current.collections,
        {
          id,
          name,
          caseKeys: selectedCaseKey ? [selectedCaseKey] : [],
          createdAt: now,
          updatedAt: now
        }
      ]
    }));
    setCollectionNameDraft("");
  };

  const setActiveCollection = (collectionId: string | null) => {
    updateCaseAssets((current) => ({
      ...current,
      activeCollectionId: collectionId
    }));
  };

  const toggleCaseCollection = (collectionId: string) => {
    if (!selectedCaseKey) return;

    const now = new Date().toISOString();
    updateCaseAssets((current) => ({
      ...current,
      collections: current.collections.map((collection) => {
        if (collection.id !== collectionId) return collection;
        const hasCase = collection.caseKeys.includes(selectedCaseKey);
        return {
          ...collection,
          caseKeys: hasCase
            ? collection.caseKeys.filter((key) => key !== selectedCaseKey)
            : [...collection.caseKeys, selectedCaseKey],
          updatedAt: now
        };
      })
    }));
  };

  const updateCaseNoteDraft = (value: string) => {
    setCaseNoteDirtyKey(selectedCaseKey || null);
    setCaseNoteDraft(value);
  };

  const saveCaseNote = () => {
    if (!selectedCaseKey) return;

    const note = caseNoteDraft.trim();
    const now = new Date().toISOString();
    updateCaseAssets((current) => {
      const notes = { ...current.notes };
      if (note) {
        notes[selectedCaseKey] = {
          caseKey: selectedCaseKey,
          note,
          updatedAt: now
        };
      } else {
        delete notes[selectedCaseKey];
      }

      return {
        ...current,
        notes
      };
    });
    setCaseNoteDirtyKey(null);
    setCaseNoteDraft(note);
  };

  const clearCaseNote = () => {
    if (!selectedCaseKey) return;

    updateCaseAssets((current) => {
      const notes = { ...current.notes };
      delete notes[selectedCaseKey];
      return {
        ...current,
        notes
      };
    });
    setCaseNoteDraft("");
    setCaseNoteDirtyKey(null);
  };

  const selectReuseRecord = (record: PromptReuseHistoryItem) => {
    setSelectedKey(record.caseKey);
    setGeneration(null);
    setGenerationError("");
    setGenerationStatus(null);
    if (window.matchMedia("(max-width: 980px)").matches) {
      setIsDetailOpen(true);
    }
  };

  const ensureCaseDetail = async (item: Image2Case) => {
    if (item.prompt?.trim()) return item;

    const detailKey = getCaseKey(item);
    const cachedDetail = caseDetails[detailKey];
    if (cachedDetail?.prompt?.trim()) return { ...item, ...cachedDetail } as Image2Case;

    setLoadingDetailKey(detailKey);

    try {
      const response = await fetch(withDataVersion(`/data/image2-cases/${detailKey}.js`), { cache: "no-store" });
      if (!response.ok) throw new Error("提示词加载失败。");
      const detail = (await response.json()) as Partial<Image2Case>;
      const next = { ...item, ...detail } as Image2Case;
      setCaseDetails((details) => ({ ...details, [detailKey]: detail }));
      return next;
    } finally {
      setLoadingDetailKey((current) => (current === detailKey ? null : current));
    }
  };

  useEffect(() => {
    if (!selectedCaseSummary) return;
    const detailKey = getCaseKey(selectedCaseSummary);
    if (caseDetails[detailKey]?.prompt) return;
    void ensureCaseDetail(selectedCaseSummary).catch(() => {
      setGenerationError("完整提示词加载失败，请重新点开这个案例。");
    });
  }, [caseDetails, selectedCaseSummary]);

  const openCase = (item: Image2Case) => {
    setSelectedKey(getCaseKey(item));
    setGeneration(null);
    setGenerationError("");
    setGenerationStatus(null);
    setIsDetailOpen(window.matchMedia("(max-width: 980px)").matches);
  };

  const previewCaseImage = (item: Image2Case, src = item.imageUrl) => {
    setImagePreview({
      alt: item.imageAlt,
      meta: [item.caseCode ?? `Case ${item.id}`, item.categoryLabel, item.resolution].filter(Boolean).join(" · "),
      src,
      title: item.title
    });
  };

  const recordPromptReuse = (item: Image2Case, action: PromptReuseHistoryItem["action"], prompt: string) => {
    const nextRecord: PromptReuseHistoryItem = {
      action,
      caseKey: getCaseKey(item),
      caseTitle: item.title,
      createdAt: new Date().toISOString(),
      id: `${getCaseKey(item)}-${action}-${Date.now()}`,
      prompt
    };

    setPromptReuseHistory((items) =>
      persistPromptReuseHistory([nextRecord, ...items.filter((entry) => entry.id !== nextRecord.id)])
    );
  };

  const updateWorkbenchField = (field: keyof PromptStructure, value: string) => {
    if (selectedCase) setWorkbenchDirtyKey(getCaseKey(selectedCase));
    setWorkbenchFields((fields) => ({ ...fields, [field]: value }));
  };

  const updateWorkbenchNote = (value: string) => {
    if (selectedCase) setWorkbenchDirtyKey(getCaseKey(selectedCase));
    setWorkbenchNote(value);
  };

  const saveWorkbench = () => {
    if (!selectedCase) return;

    const prompt = buildRewritePrompt(selectedCase, workbenchFields);
    const nextDraft: PromptWorkbenchDraft = {
      caseTitle: selectedCase.title,
      fields: { ...workbenchFields },
      note: workbenchNote.trim(),
      prompt,
      updatedAt: new Date().toISOString()
    };

    setPromptDrafts((drafts) =>
      persistPromptWorkbenchDrafts({
        ...drafts,
        [getCaseKey(selectedCase)]: nextDraft
      })
    );
    setWorkbenchDirtyKey(null);
    recordPromptReuse(selectedCase, "saved", prompt);
  };

  const resetWorkbench = () => {
    if (!selectedCase) return;

    const key = getCaseKey(selectedCase);
    setWorkbenchFields(inferPromptStructure(selectedCase));
    setWorkbenchNote("");
    setWorkbenchDirtyKey(null);
    setPromptDrafts((drafts) => {
      const next = { ...drafts };
      delete next[key];
      return persistPromptWorkbenchDrafts(next);
    });
  };

  const handleCaseCardClick = (event: MouseEvent<HTMLButtonElement>, item: Image2Case) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(".case-image-shell")) {
      previewCaseImage(item);
      return;
    }

    openCase(item);
  };

  const handleHeroCardClick = (event: MouseEvent<HTMLButtonElement>, item: Image2Case) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(".case-hero-card-overlay")) {
      openCase(item);
      return;
    }

    previewCaseImage(item);
  };

  const copyPrompt = async (item: Image2Case) => {
    try {
      const fullItem = await ensureCaseDetail(item);
      const prompt = fullItem.prompt?.trim();
      if (!prompt) throw new Error("提示词还没有加载完成。");
      await navigator.clipboard.writeText(prompt);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1300);
      recordPromptReuse(fullItem, "copied", prompt);
    } catch (error) {
      setGenerationError(toUserFacingError(error instanceof Error ? error.message : error, "提示词复制失败。"));
    }
  };

  const copyRewritePrompt = async () => {
    if (!selectedCase) return;

    try {
      const prompt = buildRewritePrompt(selectedCase, workbenchFields).trim();
      if (!prompt) throw new Error("改写提示词还没有准备好。");
      await navigator.clipboard.writeText(prompt);
      setRewriteCopiedKey(getCaseKey(selectedCase));
      window.setTimeout(() => setRewriteCopiedKey(null), 1300);
      recordPromptReuse(selectedCase, "copied", prompt);
    } catch (error) {
      setGenerationError(toUserFacingError(error instanceof Error ? error.message : error, "改写提示词复制失败。"));
    }
  };

  const generateSimilar = async (promptOverride?: string) => {
    if (!selectedCase) return;
    if (freeQuota && freeQuota.remaining <= 0) {
      setIsQuotaModalOpen(true);
      setGenerationError("");
      return;
    }

    const startedAt = Date.now();
    setGenerationError("");
    setGeneration(null);
    setGenerationStatus(null);

    try {
      const fullCase = await ensureCaseDetail(selectedCase);
      const prompt = promptOverride?.trim() || fullCase.prompt?.trim();
      if (!prompt) throw new Error("完整提示词还没有加载完成，请稍等后再生成。");

      setIsGenerating(true);
      setGenerationStartedAt(startedAt);
      setGenerationTick(startedAt);

      const payload = { prompt, size: "1024x1024", n: 1, images: [] };
      const data = await requestImage2Stream(payload, setGenerationStatus);
      if (data.quota) setFreeQuota(data.quota);
      const elapsedSeconds =
        typeof data.elapsedSeconds === "number"
          ? Math.round(data.elapsedSeconds)
          : Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const result: GenerationResult = { ...data, elapsedSeconds };
      const historyItem: GenerationHistoryItem = {
        ...result,
        id: `${fullCase.id}-${Date.now()}`,
        caseId: fullCase.id,
        caseKey: getCaseKey(fullCase),
        caseCode: fullCase.caseCode,
        caseTitle: fullCase.title,
        createdAt: new Date().toISOString()
      };

      setGeneration(result);
      setGenerationStatus(null);
      setGenerationHistory((items) =>
        persistGenerationHistory([historyItem, ...items.filter((entry) => entry.id !== historyItem.id)])
      );
      if (promptOverride?.trim()) {
        recordPromptReuse(fullCase, "generated", prompt);
      }
    } catch (error) {
      if (isFreeQuotaError(error)) {
        setFreeQuota(error.quota ?? { blocked: true, limit: freeQuota?.limit ?? 2, remaining: 0, used: freeQuota?.limit ?? 2 });
        setGenerationError("");
        setIsQuotaModalOpen(true);
      } else {
        setGenerationError(toUserFacingError(error instanceof Error ? error.message : error, "生成失败。"));
        void requestImage2Quota().then((quota) => {
          if (quota) setFreeQuota(quota);
        });
      }
    } finally {
      setIsGenerating(false);
      setGenerationStartedAt(null);
    }
  };

  const selectHistory = (record: GenerationHistoryItem) => {
    setSelectedKey(record.caseKey ?? String(record.caseId));
    setGenerationError("");
    setGenerationStatus(null);
    setGeneration({
      outDir: record.outDir,
      images: record.images,
      elapsedSeconds: record.elapsedSeconds
    });
    if (window.matchMedia("(max-width: 980px)").matches) {
      setIsDetailOpen(true);
    }
  };

  if (!payload) {
    return (
      <main className="case-library loading">
        <Loader2 className="case-spin" aria-hidden="true" />
        <p>正在加载 Image2 案例库...</p>
      </main>
    );
  }

  const syncRequiresAccount = isSupabaseAuthConfigured && !accountSession;
  const syncPanelLabel = accountSession || isSupabaseAuthConfigured ? "云端账号同步" : "临时账号同步";
  const syncIdentityLabel = accountSession
    ? accountSession.user.email ?? `ID ${accountSession.user.id.slice(0, 8)}`
    : isSupabaseAuthConfigured
      ? "请先登录"
      : assetUserId
        ? `ID ${assetUserId.slice(0, 8)}`
        : "生成临时 ID 中";
  const syncStatusMessage = syncRequiresAccount
    ? "登录后可同步收藏、项目夹、备注和提示词变体"
    : assetSyncStatus.message;
  const syncActionDisabled =
    assetSyncStatus.tone === "busy" || syncRequiresAccount || !(accountSession?.user.id ?? assetUserId);
  const activeMembership = membership?.activeEntitlement;
  const membershipPanelLabel = activeMembership ? "生效中" : accountSession ? "未激活" : "登录后兑换";
  const membershipSummary = activeMembership
    ? `${activeMembership.plan} · 每日 ${activeMembership.dailyLimit} 次 · ${activeMembership.resolution} · 至 ${formatMembershipDate(activeMembership.endsAt)}`
    : membershipStatus.message;
  const accountSubmitLabel =
    accountAuthMode === "login" ? "登录账号" : accountAuthMode === "signup" ? "注册账号" : "发送重置邮件";
  const openAccountModal = () => {
    if (!accountSession) {
      setAccountAuthMode("login");
      setAccountAuthStatus({
        message: isSupabaseAuthConfigured ? "可登录云端账号" : "未配置云端账号",
        tone: "idle"
      });
    } else {
      setAccountAuthStatus({ message: "账号已登录", tone: "success" });
    }
    setAccountPassword("");
    setAccountPasswordVisible(false);
    setIsAuthModalOpen(true);
  };
  const closeAccountModal = () => {
    setIsAuthModalOpen(false);
    setAccountPassword("");
    setAccountPasswordVisible(false);
  };
  const switchAccountMode = (mode: AccountAuthMode) => {
    setAccountAuthMode(mode);
    setAccountPassword("");
    setAccountPasswordVisible(false);
    setAccountAuthStatus({
      message: mode === "login" ? "切换为登录" : mode === "signup" ? "切换为注册" : "输入邮箱接收重置邮件",
      tone: "idle"
    });
  };

  return (
    <main className="case-library">
      <header className="case-hero">
        <div className="case-hero-toolbar">
          <button className="case-auth-launcher" type="button" onClick={openAccountModal}>
            <UserRound aria-hidden="true" />
            <span>{accountSession ? accountSession.user.email ?? "账号中心" : "登录 / 注册"}</span>
          </button>
        </div>

        <div className="case-hero-copy">
          <p className="case-kicker">
            <Sparkles aria-hidden="true" />
            LIVE GPT-IMAGE2 CASE LIBRARY
          </p>
          <h1>从爆款图到可复刻提示词。</h1>
          <p>浏览真实案例，复制提示词，点一张图就能拆解结构并生成同款。</p>

          <div className="case-hero-actions" aria-label="快捷操作">
            <a href="#case-gallery">Explore cases</a>
            <button type="button" onClick={() => setTier("精选")}>
              精选案例
            </button>
            <button aria-pressed={favoritesOnly} type="button" onClick={() => setFavoritesOnly((value) => !value)}>
              <Heart aria-hidden="true" />
              我的收藏 {favoriteCount}
            </button>
          </div>

          <div className="case-hero-stats" aria-label="案例统计">
            <span>
              <strong>{payload.totalCases}</strong>
              <small>案例</small>
            </span>
            <span>
              <strong>{categories.length}</strong>
              <small>分类</small>
            </span>
            <span>
              <strong>{featuredCount + highValueCount}</strong>
              <small>值得复刻</small>
            </span>
            <span>
              <strong>{heroCases.length}</strong>
              <small>首屏精选</small>
            </span>
          </div>
        </div>

        <div className="case-hero-visual" aria-label="精选封面预览">
          <div className="case-hero-mosaic">
            {heroCases.map((item, index) => (
              <button
                className={
                  selectedCase && getCaseKey(selectedCase) === getCaseKey(item)
                    ? `case-hero-card is-selected hero-slot-${index + 1}`
                    : `case-hero-card hero-slot-${index + 1}`
                }
                key={getCaseKey(item)}
                type="button"
                onClick={(event) => handleHeroCardClick(event, item)}
              >
                <CaseImage
                  alt={item.imageAlt}
                  loading="eager"
                  src={heroImageOverrides[item.id] ?? item.imageUrl}
                  timeoutMs={9000}
                  onUnavailable={() => hideUnavailableCase(item)}
                />
                <span className="case-hero-card-overlay">
                  <small>{item.caseCode ?? `#${item.id}`}</small>
                  <strong>{item.title}</strong>
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="case-layout">
        <aside className="case-filters" aria-label="案例筛选">
          <div className="case-search">
            <Search aria-hidden="true" />
            <input
              aria-label="搜索案例"
              placeholder="搜标题、来源、分类、标签、提示词..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="filter-section">
            <h2>价值层级</h2>
            <div className="filter-buttons">
              {tierOptions.map((option) => (
                <button
                  className={tier === option ? "active" : ""}
                  key={option}
                  type="button"
                  onClick={() => setTier(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <h2>排序</h2>
            <div className="filter-buttons">
              {sortOptions.map((option) => (
                <button
                  className={sort === option ? "active" : ""}
                  key={option}
                  type="button"
                  onClick={() => setSort(option)}
                >
                  <ArrowUpDown aria-hidden="true" />
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <h2>我的收藏</h2>
            <button
              aria-pressed={favoritesOnly}
              className={favoritesOnly ? "case-favorites-filter active" : "case-favorites-filter"}
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              <Heart aria-hidden="true" />
              <span>{favoritesOnly ? "只看收藏中" : "只看收藏"}</span>
              <b>{favoriteCount}</b>
            </button>
            <p className="case-favorites-note">收藏保存在当前浏览器，回来看图和提示词更快。</p>
          </div>

          <div className="filter-section case-assets-panel">
            <div className="case-assets-panel-head">
              <h2>项目夹</h2>
              <span>{caseAssetState.collections.length}</span>
            </div>
            <form className="case-collection-form" onSubmit={createCollection}>
              <input
                aria-label="新建项目夹名称"
                placeholder="新建项目夹"
                value={collectionNameDraft}
                onChange={(event) => setCollectionNameDraft(event.target.value)}
              />
              <button type="submit" title="新建项目夹">
                <FolderPlus aria-hidden="true" />
              </button>
            </form>
            <div className="case-collection-list" aria-label="项目夹筛选">
              <button
                className={!activeCollection ? "active" : ""}
                type="button"
                onClick={() => setActiveCollection(null)}
              >
                <span>全部项目</span>
                <b>{cases.length}</b>
              </button>
              {caseAssetState.collections.map((collection) => (
                <button
                  className={activeCollection?.id === collection.id ? "active" : ""}
                  key={collection.id}
                  type="button"
                  onClick={() => setActiveCollection(collection.id)}
                >
                  <span>{collection.name}</span>
                  <b>{collection.caseKeys.length}</b>
                  </button>
              ))}
            </div>

            <div className={`case-membership-panel ${membershipStatus.tone}`} aria-label="会员权益">
              <div className="case-membership-panel-head">
                <span>
                  <Crown aria-hidden="true" />
                  <strong>会员权益</strong>
                </span>
                <em>{membershipPanelLabel}</em>
              </div>
              <p>{membershipSummary}</p>
              {activeMembership ? (
                <div className="case-membership-features" aria-label="已开启权益">
                  <span>云端同步</span>
                  <span>{activeMembership.canPromptWorkbench ? "高级工作台" : "基础工作台"}</span>
                  <span>{activeMembership.canBulkExport ? "批量导出" : "单条复用"}</span>
                </div>
              ) : null}
              {activeMembership ? <small>{membershipStatus.message}</small> : null}
              {isSupabaseAuthConfigured && accountSession ? (
                <form className="case-membership-form" onSubmit={submitLicenseRedeem}>
                  <input
                    aria-label="Image2 卡密"
                    autoComplete="off"
                    placeholder="输入卡密"
                    value={licenseCodeDraft}
                    onChange={(event) => setLicenseCodeDraft(event.target.value)}
                  />
                  <button type="submit" disabled={membershipStatus.tone === "busy"}>
                    {membershipStatus.tone === "busy" ? <Loader2 className="spinning" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                    兑换
                  </button>
                </form>
              ) : (
                <small>{isSupabaseAuthConfigured ? "登录后可兑换卡密并同步权益。" : "云端账号启用后可接入卡密权益。"}</small>
              )}
            </div>

            <div
              className={`case-asset-sync ${assetSyncStatus.tone}`}
              aria-label={syncPanelLabel}
            >
              <div>
                <strong>{syncPanelLabel}</strong>
                <small>{syncStatusMessage}</small>
                <em>{syncIdentityLabel}</em>
              </div>
              <div className="case-asset-sync-actions">
                <button
                  disabled={syncActionDisabled}
                  type="button"
                  onClick={syncAssetsToTemporaryAccount}
                >
                  <Database aria-hidden="true" />
                  {syncRequiresAccount ? "登录后同步" : accountSession ? "同步到云端" : "同步到临时账号"}
                </button>
                <button
                  disabled={syncActionDisabled}
                  type="button"
                  onClick={mergeAssetsFromTemporaryAccount}
                >
                  <RotateCcw aria-hidden="true" />
                  {syncRequiresAccount ? "登录后合并" : accountSession ? "从云端合并" : "从临时账号合并"}
                </button>
              </div>
              {assetSyncStatus.storageMode && <p>{assetSyncStatus.storageMode}</p>}
            </div>
          </div>

          <div className="filter-section case-recent-panel">
            <h2>最近复用</h2>
            <div className="case-recent-list">
              {promptReuseHistory.length ? (
                promptReuseHistory.slice(0, 5).map((record) => (
                  <button key={record.id} type="button" onClick={() => selectReuseRecord(record)}>
                    <span>
                      <strong>{record.caseTitle}</strong>
                      <small>
                        {record.action === "saved" ? "保存变体" : record.action === "generated" ? "生成改写" : "复制提示词"} ·{" "}
                        {formatHistoryTime(record.createdAt)}
                      </small>
                    </span>
                    <History aria-hidden="true" />
                  </button>
                ))
              ) : (
                <p>复制、保存或生成后，这里会出现最近用过的案例。</p>
              )}
            </div>
          </div>

          <div className="filter-section category-list case-category-filter">
            <h2>分类</h2>
            <div className="case-filter-scroll">
              <button
                className={category === "全部" ? "active" : ""}
                type="button"
                onClick={() => setCategory("全部")}
              >
                <span>全部</span>
                <b>{payload.totalCases}</b>
              </button>
              {categories.map((item) => (
                <button
                  className={category === item.value ? "active" : ""}
                  key={item.value}
                  type="button"
                  onClick={() => setCategory(item.value)}
                >
                  <span>{item.label}</span>
                  <b>{item.count}</b>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="case-gallery" id="case-gallery" aria-label="案例图库">
          <div className="case-gallery-head">
            <div>
              <p>{filteredCases.length} 个匹配案例</p>
              <h2>{galleryTitle}</h2>
            </div>
          </div>

          {filteredCases.length ? (
            <div className="case-grid">
              {filteredCases.map((item) => {
                const caseKey = getCaseKey(item);
                const isFavorite = favoriteCaseKeys.has(caseKey);
                const reuse = inferReuseProfile(item);

                return (
                  <div className="case-card-shell" key={caseKey}>
                    <button
                      className={selectedCase && getCaseKey(selectedCase) === caseKey ? "case-card active" : "case-card"}
                      type="button"
                      onClick={(event) => handleCaseCardClick(event, item)}
                    >
                      <CaseImage alt={item.imageAlt} src={item.imageUrl} onUnavailable={() => hideUnavailableCase(item)} />
                      <span className="case-tier">{item.valueTier}</span>
                      <div>
                        <small>{item.caseCode ?? `Case ${item.id}`} · {item.categoryLabel}</small>
                        <strong>{item.title}</strong>
                        <p>{item.promptPreview}</p>
                        <footer>
                          <b>{item.valueScore}</b>
                          <span>{item.promptKind}</span>
                          <em>{reuse.label}</em>
                        </footer>
                      </div>
                    </button>
                    <button
                      aria-label={`${isFavorite ? "移出" : "加入"}收藏：${item.title} 图片与提示词`}
                      aria-pressed={isFavorite}
                      className={isFavorite ? "case-card-favorite active" : "case-card-favorite"}
                      title={isFavorite ? "移出收藏" : "收藏图片与提示词"}
                      type="button"
                      onClick={() => toggleFavorite(item)}
                    >
                      <Heart aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="case-empty-results">
              <Heart aria-hidden="true" />
              <strong>{favoritesOnly ? "还没有匹配的收藏" : "没有匹配案例"}</strong>
              <p>
                {favoritesOnly
                  ? "点卡片右上角的心形按钮，图片和提示词会留在当前浏览器。"
                  : "换个关键词，或者放宽来源、分类和价值筛选。"}
              </p>
            </div>
          )}
        </section>

        {selectedCase && (
          <aside className="case-detail" aria-label="案例详情">
            <CaseDetailContent
              copiedId={copiedId}
              freeQuota={freeQuota}
              generation={generation}
              generationError={generationError}
              generationElapsedSeconds={generationElapsedSeconds}
              generationHistory={generationHistory}
              generationStatus={generationStatus}
              isFavorite={favoriteCaseKeys.has(getCaseKey(selectedCase))}
              isPromptLoading={isSelectedPromptLoading}
              isGenerating={isGenerating}
              item={selectedCase}
              onCopy={copyPrompt}
              onCopyRewrite={copyRewritePrompt}
              onImageUnavailable={hideUnavailableCase}
              onGenerate={() => generateSimilar()}
              onGenerateRewrite={() => generateSimilar(selectedRewritePrompt)}
              onToggleFavorite={toggleFavorite}
              onPreviewImage={setImagePreview}
              onOpenHistory={() => setIsHistoryOpen(true)}
              onOpenQuota={() => setIsQuotaModalOpen(true)}
              onResetWorkbench={resetWorkbench}
              onSaveWorkbench={saveWorkbench}
              onSaveCaseNote={saveCaseNote}
              onWorkbenchFieldChange={updateWorkbenchField}
              onWorkbenchNoteChange={updateWorkbenchNote}
              recentReuse={selectedReuseHistory}
              caseCollections={caseAssetState.collections}
              selectedCaseCollectionIds={selectedCaseCollectionIds}
              rewriteCopiedKey={rewriteCopiedKey}
              rewritePrompt={selectedRewritePrompt}
              savedWorkbench={selectedWorkbench}
              workbenchFields={workbenchFields}
              workbenchNote={workbenchNote}
              caseNoteDraft={caseNoteDraft}
              caseNoteUpdatedAt={selectedCaseNote?.updatedAt}
              onCaseNoteChange={updateCaseNoteDraft}
              onClearCaseNote={clearCaseNote}
              onToggleCaseCollection={toggleCaseCollection}
            />
          </aside>
        )}
      </section>

      {selectedCase && isDetailOpen && (
        <section className="case-mobile-detail-layer" aria-label="案例详情弹窗">
          <button
            aria-label="关闭案例详情"
            className="case-mobile-detail-backdrop"
            type="button"
            onClick={() => setIsDetailOpen(false)}
          />
          <aside className="case-mobile-detail-panel" role="dialog" aria-modal="true" aria-label={selectedCase.title}>
            <div className="case-mobile-detail-head">
              <div>
                <small>案例详情</small>
                <strong>{selectedCase.title}</strong>
              </div>
              <button aria-label="关闭案例详情" type="button" onClick={() => setIsDetailOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <CaseDetailContent
              copiedId={copiedId}
              freeQuota={freeQuota}
              generation={generation}
              generationError={generationError}
              generationElapsedSeconds={generationElapsedSeconds}
              generationHistory={generationHistory}
              generationStatus={generationStatus}
              isFavorite={favoriteCaseKeys.has(getCaseKey(selectedCase))}
              isPromptLoading={isSelectedPromptLoading}
              isGenerating={isGenerating}
              item={selectedCase}
              onCopy={copyPrompt}
              onCopyRewrite={copyRewritePrompt}
              onImageUnavailable={hideUnavailableCase}
              onGenerate={() => generateSimilar()}
              onGenerateRewrite={() => generateSimilar(selectedRewritePrompt)}
              onToggleFavorite={toggleFavorite}
              onPreviewImage={setImagePreview}
              onOpenHistory={() => setIsHistoryOpen(true)}
              onOpenQuota={() => setIsQuotaModalOpen(true)}
              onResetWorkbench={resetWorkbench}
              onSaveWorkbench={saveWorkbench}
              onSaveCaseNote={saveCaseNote}
              onWorkbenchFieldChange={updateWorkbenchField}
              onWorkbenchNoteChange={updateWorkbenchNote}
              recentReuse={selectedReuseHistory}
              caseCollections={caseAssetState.collections}
              selectedCaseCollectionIds={selectedCaseCollectionIds}
              rewriteCopiedKey={rewriteCopiedKey}
              rewritePrompt={selectedRewritePrompt}
              savedWorkbench={selectedWorkbench}
              workbenchFields={workbenchFields}
              workbenchNote={workbenchNote}
              caseNoteDraft={caseNoteDraft}
              caseNoteUpdatedAt={selectedCaseNote?.updatedAt}
              onCaseNoteChange={updateCaseNoteDraft}
              onClearCaseNote={clearCaseNote}
              onToggleCaseCollection={toggleCaseCollection}
            />
          </aside>
          <div className="case-mobile-action-dock" aria-label="案例快捷操作">
            <button disabled={!selectedHasPrompt || isSelectedPromptLoading} type="button" onClick={() => copyPrompt(selectedCase)}>
              {copiedId === selectedCase.id ? <ClipboardCheck aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
              {copiedId === selectedCase.id ? "已复制" : "复制提示词"}
            </button>
            <button
              disabled={!selectedHasPrompt || isSelectedPromptLoading || isGenerating}
              type="button"
              onClick={freeQuota && freeQuota.remaining <= 0 ? () => setIsQuotaModalOpen(true) : () => generateSimilar()}
            >
              <WandSparkles aria-hidden="true" />
              {isSelectedPromptLoading
                ? "加载提示词"
                : isGenerating
                  ? `生成中 ${formatDuration(generationElapsedSeconds)}`
                  : freeQuota && freeQuota.remaining <= 0
                    ? "领取额度"
                    : "免费生成同款"}
            </button>
          </div>
        </section>
      )}

      {isHistoryOpen && (
        <Image2HistoryModal
          history={generationHistory}
          onClose={() => setIsHistoryOpen(false)}
          onSelectHistory={selectHistory}
        />
      )}

      {isQuotaModalOpen && <Image2QuotaModal quota={freeQuota} onClose={() => setIsQuotaModalOpen(false)} />}

      {imagePreview && <Image2ImagePreviewModal preview={imagePreview} onClose={() => setImagePreview(null)} />}

      {isAuthModalOpen && (
        <section className="case-auth-modal-layer" aria-label="账号中心">
          <button
            aria-label="关闭账号中心"
            className="case-auth-modal-backdrop"
            type="button"
            onClick={closeAccountModal}
          />
          <div className="case-auth-modal-panel" role="dialog" aria-modal="true" aria-labelledby="case-auth-title">
            <div className="case-auth-modal-head">
              <div className="case-auth-modal-copy">
                <small>Image2 Account</small>
                <h2 id="case-auth-title">{accountSession ? "账号中心" : "登录 / 注册"}</h2>
                <p>{accountSession ? "退出后可以切换账号，继续同步或兑换。" : "登录后可同步收藏、项目夹、备注和会员权益。"}</p>
              </div>
              <button aria-label="关闭账号中心" type="button" onClick={closeAccountModal}>
                <X aria-hidden="true" />
              </button>
            </div>

            {isSupabaseAuthConfigured ? (
              accountSession ? (
                <div className={`case-account-session case-auth-session ${accountAuthStatus.tone}`}>
                  <UserRound aria-hidden="true" />
                  <span>
                    <strong>{accountSession.user.email ?? "Image2 账号"}</strong>
                    <small>{accountAuthStatus.message}</small>
                  </span>
                  <button type="button" onClick={signOutAccount} disabled={accountAuthStatus.tone === "busy"}>
                    <LogOut aria-hidden="true" />
                    退出账号
                  </button>
                </div>
              ) : (
                <>
                  <div className="case-auth-tabs" role="tablist" aria-label="账号模式切换">
                    <button
                      aria-pressed={accountAuthMode === "login"}
                      className={accountAuthMode === "login" ? "active" : ""}
                      type="button"
                      onClick={() => switchAccountMode("login")}
                    >
                      登录
                    </button>
                    <button
                      aria-pressed={accountAuthMode === "signup"}
                      className={accountAuthMode === "signup" ? "active" : ""}
                      type="button"
                      onClick={() => switchAccountMode("signup")}
                    >
                      注册
                    </button>
                    <button
                      aria-pressed={accountAuthMode === "recover"}
                      className={accountAuthMode === "recover" ? "active" : ""}
                      type="button"
                      onClick={() => switchAccountMode("recover")}
                    >
                      找回密码
                    </button>
                  </div>

                  <form className="case-account-form case-auth-form" onSubmit={submitAccountAuth}>
                    <input
                      aria-label="账号邮箱"
                      autoComplete="email"
                      placeholder="邮箱"
                      type="email"
                      value={accountEmail}
                      onChange={(event) => setAccountEmail(event.target.value)}
                    />
                    {accountAuthMode !== "recover" ? (
                      <div className="case-password-field">
                        <input
                          aria-label="账号密码"
                          autoComplete={accountAuthMode === "login" ? "current-password" : "new-password"}
                          placeholder={accountAuthMode === "signup" ? "设置密码（至少 6 位）" : "密码"}
                          type={accountPasswordVisible ? "text" : "password"}
                          value={accountPassword}
                          onChange={(event) => setAccountPassword(event.target.value)}
                        />
                        <button
                          aria-label={accountPasswordVisible ? "隐藏密码" : "显示密码"}
                          className="case-password-toggle"
                          type="button"
                          onClick={() => setAccountPasswordVisible((value) => !value)}
                        >
                          {accountPasswordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        </button>
                      </div>
                    ) : null}
                    <div className="case-account-actions case-auth-actions">
                      <button type="submit" disabled={accountAuthStatus.tone === "busy"}>
                        {accountAuthStatus.tone === "busy" ? (
                          <Loader2 className="spinning" aria-hidden="true" />
                        ) : accountAuthMode === "recover" ? (
                          <RotateCcw aria-hidden="true" />
                        ) : (
                          <LogIn aria-hidden="true" />
                        )}
                        {accountSubmitLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => switchAccountMode(accountAuthMode === "signup" ? "login" : "signup")}
                      >
                        {accountAuthMode === "signup" ? "去登录" : "去注册"}
                      </button>
                    </div>
                    {accountAuthMode === "login" ? (
                      <button className="case-account-link" type="button" onClick={() => switchAccountMode("recover")}>
                        忘记密码
                      </button>
                    ) : accountAuthMode === "recover" ? (
                      <button className="case-account-link" type="button" onClick={() => switchAccountMode("login")}>
                        返回登录
                      </button>
                    ) : null}
                    <small>{accountAuthStatus.message}</small>
                  </form>
                </>
              )
            ) : (
              <p className="case-auth-config-note">云端账号未配置，当前继续使用浏览器临时 ID。</p>
            )}
          </div>
        </section>
      )}

      {Boolean(payload.sourceRadar?.length || sources.length) && (
        <section className={`case-radar-dock${isRadarOpen ? " open" : ""}`} aria-label="来源面板">
          <button
            aria-expanded={isRadarOpen}
            aria-label="来源面板"
            title="来源面板"
            className="case-radar-trigger"
            type="button"
            onClick={() => setIsRadarOpen((value) => !value)}
          >
            <Radar aria-hidden="true" />
          </button>
          <div className="case-radar-panel" hidden={!isRadarOpen}>
            <div className="case-radar-panel-head">
              <div>
                <small>隐藏信息层</small>
                <strong>来源面板</strong>
              </div>
              <button type="button" onClick={() => setIsRadarOpen(false)}>
                收起
              </button>
            </div>

            <div className="case-radar-block">
              <div className="case-radar-block-head">
                <strong>来源筛选</strong>
                <small>{activeSource?.label ?? "全部来源"}</small>
              </div>
              <div className="source-picker-list">
                <button className={sourceId === "全部" ? "active" : ""} type="button" onClick={() => setSourceId("全部")}>
                  <span>全部来源</span>
                  <b>{payload.totalCases}</b>
                </button>
                {sources.map((item) => (
                  <button
                    className={sourceId === item.id ? "active" : ""}
                    key={item.id}
                    type="button"
                    onClick={() => setSourceId(item.id)}
                  >
                    <span>{item.label}</span>
                    <b>{item.count}</b>
                  </button>
                ))}
              </div>
            </div>

            {Boolean(payload.sourceRadar?.length) && (
              <div className="case-radar-block">
                <div className="case-radar-block-head">
                  <strong>来源雷达</strong>
                  <small>{payload.sourceRadar?.length} 个候选站点</small>
                </div>
                <div className="radar-list">
                  {payload.sourceRadar?.map((item) => (
                    <a href={item.url} key={item.id} target="_blank" rel="noreferrer" title={item.note}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.status}</small>
                      </span>
                      <ExternalLink aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
