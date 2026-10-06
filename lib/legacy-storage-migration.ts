/**
 * 旧域名（image2.lsb0713.online / ai.lsb0713.online）到 image2.cauai.fun 的
 * 浏览器本地数据迁移工具。
 *
 * 浏览器按 origin 隔离 localStorage：换域名后旧数据不会自动出现，所以这里提供
 * 一条用户主动触发的迁移路径——旧域导出成 base64url 迁移码（或 #import= 链接），
 * 新域校验后再合并写入。整个流程只发生在浏览器里，不经过任何服务端接口。
 *
 * 本模块只包含纯函数和类型，不访问 window / localStorage，
 * 因此既能在客户端组件里使用，也能在 Node 校验脚本里直接调用。
 */

export const LEGACY_IMAGE2_HOSTS = ["image2.lsb0713.online", "ai.lsb0713.online"] as const;

export const LEGACY_IMAGE2_SITE_URL = "https://image2.lsb0713.online";

export const DEFAULT_IMAGE2_SITE_URL = "https://image2.cauai.fun";

export const MIGRATION_PAYLOAD_VERSION = 1;

export const MIGRATION_HASH_PREFIX = "#import=";

/** 迁移码超过这个长度时不再作为跳转链接使用，改为提示用户复制迁移码。 */
export const MAX_DIRECT_LINK_LENGTH = 100_000;

export const MAX_IMPORT_ITEMS = 500;

export const MAX_IMPORT_CHARS = 4_000_000;

/** 账号、会话、令牌类键一律不迁移。 */
export const EXCLUDED_KEY_PATTERN = /session|token|auth|secret/i;

/** 键名不含 session/token/auth/secret，但同样属于账号身份的键。 */
export const EXCLUDED_STORAGE_KEYS: readonly string[] = ["seedance-mvp-user-id"];

export type LegacyStoragePayload = {
  v: typeof MIGRATION_PAYLOAD_VERSION;
  from: string;
  at: string;
  items: Record<string, string>;
};

export type MigrationDecodeResult =
  | { ok: true; payload: LegacyStoragePayload }
  | { ok: false; error: string };

export type StorageScan = {
  items: Record<string, string>;
  skippedKeys: string[];
  totalKeys: number;
};

export type MigrationMergeResult = {
  importedKeys: string[];
  skippedKeys: string[];
  failedKeys: string[];
};

const STORAGE_KEY_LABELS: Record<string, string> = {
  "image2-case-favorites:v1": "案例收藏",
  "image2-case-assets:v1": "案例笔记与素材",
  "image2-prompt-workbench:v1": "提示词工作台草稿",
  "image2-prompt-reuse-history:v1": "提示词复用历史",
  "image2-generation-history:v1": "生成历史",
  "image2-gacha-last-run:v1": "抽卡进度",
  "image2-language:v1": "界面语言",
  "image2-case-filters-collapsed:v1": "筛选栏折叠状态",
  "image2-motion-workbench-history:v2": "动效工作台历史",
  "image2-motion-workbench-history:v1": "动效工作台历史（旧版）",
  "daihuo-scout-review-v2": "带货侦察复核记录",
  "daihuo-douyin-leads-v1": "抖音线索池"
};

export function resolveImage2SiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_IMAGE2_SITE_URL;
  const raw = typeof configured === "string" && configured.trim() ? configured.trim() : DEFAULT_IMAGE2_SITE_URL;
  return raw.replace(/\/+$/, "");
}

/**
 * 把配置的新域解析成 URL 对象；配置缺失或非法时回退到默认新域。
 * 代理层与页面元信息都走这里，避免一个写错的环境变量让旧域整站 500。
 */
export function resolveImage2SiteTarget(): URL {
  try {
    return new URL(resolveImage2SiteUrl());
  } catch {
    return new URL(DEFAULT_IMAGE2_SITE_URL);
  }
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export function isLegacyImage2Host(host: string): boolean {
  const normalized = normalizeHost(host);
  return (LEGACY_IMAGE2_HOSTS as readonly string[]).includes(normalized);
}

export function isExcludedStorageKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return true;
  if (EXCLUDED_KEY_PATTERN.test(trimmed)) return true;
  return EXCLUDED_STORAGE_KEYS.includes(trimmed.toLowerCase());
}

export function describeStorageKey(key: string): string {
  return STORAGE_KEY_LABELS[key] ?? key;
}

export function scanMigratableStorage(storage: Storage): StorageScan {
  const items: Record<string, string> = {};
  const skippedKeys: string[] = [];
  const totalKeys = storage.length;
  for (let index = 0; index < totalKeys; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (isExcludedStorageKey(key)) {
      skippedKeys.push(key);
      continue;
    }
    const value = storage.getItem(key);
    if (value === null) continue;
    items[key] = value;
  }
  return { items, skippedKeys, totalKeys };
}

export function buildMigrationPayload(items: Record<string, string>, from: string, at: string): LegacyStoragePayload {
  return {
    v: MIGRATION_PAYLOAD_VERSION,
    from,
    at,
    items: { ...items }
  };
}

export function encodeMigrationPayload(payload: LegacyStoragePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder === 1) throw new Error("invalid base64url length");
  return normalized + "=".repeat((4 - remainder) % 4);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePayload(parsed: unknown): MigrationDecodeResult {
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "迁移码结构不正确：没有找到数据对象。" };
  }
  if (parsed.v !== MIGRATION_PAYLOAD_VERSION) {
    const version = parsed.v;
    const shown = typeof version === "number" || typeof version === "string" ? String(version) : "未知";
    return { ok: false, error: `迁移码版本不受支持（v=${shown}），请在旧域迁移页重新导出。` };
  }
  if (!isPlainObject(parsed.items)) {
    return { ok: false, error: "迁移码结构不正确：缺少 items 数据。" };
  }
  const entries = Object.entries(parsed.items);
  if (!entries.length) {
    return { ok: false, error: "迁移码里没有任何数据项。" };
  }
  if (entries.length > MAX_IMPORT_ITEMS) {
    return { ok: false, error: `迁移码包含 ${entries.length} 项数据，超过单次导入上限（${MAX_IMPORT_ITEMS} 项）。` };
  }
  const items: Record<string, string> = {};
  let totalChars = 0;
  for (const [rawKey, value] of entries) {
    const key = rawKey.trim();
    if (!key) return { ok: false, error: "迁移码里存在空键名，无法导入。" };
    if (typeof value !== "string") return { ok: false, error: `迁移码里的「${key}」不是文本数据，无法导入。` };
    totalChars += key.length + value.length;
    if (totalChars > MAX_IMPORT_CHARS) return { ok: false, error: "迁移码数据量过大，超出浏览器本地存储的安全范围。" };
    items[key] = value;
  }
  return {
    ok: true,
    payload: {
      v: MIGRATION_PAYLOAD_VERSION,
      from: typeof parsed.from === "string" ? parsed.from : "",
      at: typeof parsed.at === "string" ? parsed.at : "",
      items
    }
  };
}

export function decodeMigrationPayload(encoded: string): MigrationDecodeResult {
  const compact = encoded.trim();
  if (!compact) return { ok: false, error: "迁移码是空的，请完整复制后再导入。" };
  if (!/^[A-Za-z0-9_-]+$/.test(compact)) {
    return { ok: false, error: "迁移码包含不支持的字符，请确认复制的是完整迁移码。" };
  }
  let json: string;
  try {
    const binary = atob(base64UrlToBase64(compact));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: "迁移码无法解码，可能复制不完整或已经损坏。" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "迁移码内容不是有效的 JSON，可能在复制时被截断。" };
  }
  return validatePayload(parsed);
}

export function mergeMigrationPayload(storage: Storage, payload: LegacyStoragePayload): MigrationMergeResult {
  const importedKeys: string[] = [];
  const skippedKeys: string[] = [];
  const failedKeys: string[] = [];
  for (const [key, value] of Object.entries(payload.items)) {
    if (isExcludedStorageKey(key)) {
      skippedKeys.push(key);
      continue;
    }
    try {
      if (storage.getItem(key) !== null) {
        skippedKeys.push(key);
        continue;
      }
      storage.setItem(key, value);
      importedKeys.push(key);
    } catch {
      failedKeys.push(key);
    }
  }
  return { importedKeys, skippedKeys, failedKeys };
}

export function buildMigrationLink(siteUrl: string, encoded: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/migrate${MIGRATION_HASH_PREFIX}${encoded}`;
}

export function readMigrationCodeFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = MIGRATION_HASH_PREFIX.replace(/^#/, "");
  if (!raw.startsWith(prefix)) return null;
  const value = raw.slice(prefix.length).trim();
  return value || null;
}