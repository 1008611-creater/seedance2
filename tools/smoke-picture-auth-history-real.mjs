import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const envFile = resolve(process.cwd(), args.get("env-file") ?? ".env.local");
const baseUrl = (args.get("base-url") ?? process.env.PICTURE_AUTH_REAL_SMOKE_BASE_URL ?? "http://127.0.0.1:3012").replace(/\/+$/, "");
const hostHeader = args.get("host") ?? process.env.PICTURE_AUTH_REAL_SMOKE_HOST ?? "picture.lsb0713.online";
const timeoutMs = Number(args.get("timeout-ms") ?? process.env.PICTURE_AUTH_REAL_SMOKE_TIMEOUT_MS ?? 300000);
const cleanup = args.get("cleanup") !== "false";
const checks = [];
const createdUserIds = new Set();

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
        if (!match) return null;
        return [match[1].trim(), match[2].trim().replace(/^["']|["']$/g, "")];
      })
      .filter(Boolean)
  );
}

const fileEnv = parseEnvFile(envFile);
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

function pass(label, detail) {
  checks.push({ label, ok: true, detail });
  console.log(`[ok] ${label}${detail ? ` - ${detail}` : ""}`);
}

function fail(label, detail) {
  checks.push({ label, ok: false, detail });
  console.error(`[fail] ${label}${detail ? ` - ${detail}` : ""}`);
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 240) };
  }
}

async function request(pathname, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "picture-auth-history-real-smoke/1.0",
        "x-forwarded-host": hostHeader,
        ...(init.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runCheck(label, fn) {
  try {
    await fn();
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

async function deleteSupabaseUser(userId) {
  if (!cleanup || !userId || !supabaseUrl || !serviceRoleKey) return false;

  const isSecretApiKey = serviceRoleKey.startsWith("sb_secret_");
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      ...(isSecretApiKey ? {} : { Authorization: `Bearer ${serviceRoleKey}` }),
      "Content-Type": "application/json"
    }
  });
  return response.ok;
}

async function deleteSupabaseRows(table, query) {
  if (!cleanup || !supabaseUrl || !serviceRoleKey) return false;

  const isSecretApiKey = serviceRoleKey.startsWith("sb_secret_");
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      ...(isSecretApiKey ? {} : { Authorization: `Bearer ${serviceRoleKey}` }),
      "Content-Type": "application/json"
    }
  });
  return response.ok || response.status === 404;
}

async function cleanupUsers() {
  if (!createdUserIds.size) return;
  let deleted = 0;
  let deletedHistory = 0;
  for (const userId of createdUserIds) {
    const userFilter = `user_id=eq.${encodeURIComponent(userId)}`;
    if (await deleteSupabaseRows("picture_generation_runs", userFilter)) deletedHistory += 1;
    if (await deleteSupabaseRows("image2_asset_snapshots", userFilter)) deletedHistory += 1;
    if (await deleteSupabaseRows("seedance_generations", `${userFilter}&source_task_url=eq.picture-history`)) {
      deletedHistory += 1;
    }
    if (await deleteSupabaseUser(userId)) deleted += 1;
  }
  console.log(`[cleanup] deleted ${deleted}/${createdUserIds.size} smoke users; cleaned ${deletedHistory} history table(s)`);
}

try {
  const suffix = Date.now().toString(36);
  const username = `smoke_${suffix}`;
  const otherUsername = `smoke_${suffix}_b`;
  const password = `PictureSmoke${suffix}!`;
  let accessToken = "";
  let otherAccessToken = "";

  await runCheck("public config is reachable and history-enabled", async () => {
    const response = await request("/api/picture");
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.provider === "picture", "expected public picture provider");
    assert(data.authRequired === true, "authRequired should be true");
    assert(data.historyEnabled === true, "historyEnabled should be true");
    pass("picture config", `${data.ratios?.length ?? 0} ratios`);
  });

  await runCheck("register username/password account", async () => {
    const response = await request("/api/picture/auth/register", {
      method: "POST",
      body: JSON.stringify({ password, username })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.accessToken, "missing accessToken");
    assert(data.user?.id, "missing user id");
    assert(data.user?.username === username, "username mismatch");
    createdUserIds.add(data.user.id);
    accessToken = data.accessToken;
    pass("register", username);
  });

  await runCheck("login username/password account", async () => {
    const response = await request("/api/picture/auth/login", {
      method: "POST",
      body: JSON.stringify({ password, username })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.accessToken, "missing accessToken");
    assert(data.user?.username === username, "username mismatch");
    accessToken = data.accessToken;
    pass("login", username);
  });

  await runCheck("authenticated generation saves history", async () => {
    const response = await request("/api/picture", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        channel: "fast",
        mode: "text-to-image",
        n: 1,
        prompt: "一张简洁的手机端登录系统示意图，白色背景，清晰按钮，适合验证生成历史保存。",
        ratio: "1:1",
        resolution: "1k",
        seed: 246810
      })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.images?.[0]?.path, "missing generated image path");
    assert(data.historyItem?.id, "missing returned history item");
    assert(data.historyItem?.images?.[0]?.url?.startsWith("/api/picture/output/"), "history image should use public picture output URL");
    pass("generation saved", data.historyItem.id);
  });

  await runCheck("history returns saved item for same user", async () => {
    const response = await request("/api/picture/history", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(Array.isArray(data.items), "items should be array");
    assert(data.items.length >= 1, "expected at least one history item");
    assert(data.items[0].prompt.includes("登录系统"), "latest history prompt mismatch");
    pass("same user history", `${data.items.length} item(s)`);
  });

  await runCheck("another user cannot read first user's history", async () => {
    const register = await request("/api/picture/auth/register", {
      method: "POST",
      body: JSON.stringify({ password, username: otherUsername })
    });
    const registerData = await readJson(register);
    assert(register.ok, `expected 2xx, got ${register.status}; ${registerData.error ?? ""}`);
    assert(registerData.user?.id, "missing second user id");
    createdUserIds.add(registerData.user.id);
    otherAccessToken = registerData.accessToken;

    const history = await request("/api/picture/history", {
      headers: { Authorization: `Bearer ${otherAccessToken}` }
    });
    const historyData = await readJson(history);
    assert(history.ok, `expected 2xx, got ${history.status}; ${historyData.error ?? ""}`);
    assert(Array.isArray(historyData.items) && historyData.items.length === 0, "second user should not see first user's history");
    pass("history isolation", "second user sees 0 items");
  });
} finally {
  await cleanupUsers().catch((error) => {
    console.error(`[cleanup] ${error instanceof Error ? error.message : String(error)}`);
  });
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`Picture real auth/history smoke failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Picture real auth/history smoke passed: ${checks.length}/${checks.length} checks passed.`);
