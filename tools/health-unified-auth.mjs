import fs from "node:fs";
import path from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(path.join(process.cwd(), ".env"));
loadEnv(path.join(process.cwd(), ".env.local"));

const supabaseUrl = (args.get("supabase-url") ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const serviceRoleKey = args.get("service-role-key") ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const adminToken = args.get("admin-token") ?? process.env.UNIFIED_AUTH_SMOKE_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN ?? "";
const appBaseUrl = (args.get("base-url") ?? process.env.UNIFIED_AUTH_HEALTH_BASE_URL ?? "").replace(/\/+$/, "");
const timeoutMs = Number(args.get("timeout-ms") ?? 25000);

const checks = [];

function pass(label, detail) {
  checks.push({ label, ok: true, detail });
  console.log(`[ok] ${label}${detail ? ` - ${detail}` : ""}`);
}

function fail(label, detail) {
  checks.push({ label, ok: false, detail });
  console.error(`[fail] ${label}${detail ? ` - ${detail}` : ""}`);
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "seedance2-unified-auth-health/1.0",
        ...(init.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyMessage(response) {
  const body = await response.text().catch(() => "");
  try {
    const parsed = body ? JSON.parse(body) : {};
    return String(parsed.message ?? parsed.error ?? body).slice(0, 180);
  } catch {
    return body.slice(0, 180);
  }
}

function supabaseHeaders() {
  const isSecretApiKey = serviceRoleKey.startsWith("sb_secret_");
  return {
    apikey: serviceRoleKey,
    ...(isSecretApiKey ? {} : { Authorization: `Bearer ${serviceRoleKey}` }),
    "Content-Type": "application/json"
  };
}

async function probeTable(table, select) {
  const response = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`,
    {
      headers: supabaseHeaders()
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await readBodyMessage(response)}`);
  }

  pass(`Supabase table ${table}`, `HTTP ${response.status}`);
}

async function probeAdminUsersApi() {
  if (!appBaseUrl) return;

  const unauth = await fetchWithTimeout(`${appBaseUrl}/api/admin/users`);
  if (unauth.status !== 401) {
    throw new Error(`Expected unauthenticated /api/admin/users HTTP 401, got ${unauth.status}`);
  }
  pass("admin users API rejects unauthenticated", "HTTP 401");

  if (!adminToken) {
    fail("admin users API authorized probe", "missing ADMIN_TOKEN / UNIFIED_AUTH_SMOKE_ADMIN_TOKEN");
    return;
  }

  const authorized = await fetchWithTimeout(`${appBaseUrl}/api/admin/users`, {
    headers: {
      "x-admin-token": adminToken
    }
  });
  if (!authorized.ok) {
    throw new Error(`Expected authorized /api/admin/users 2xx, got HTTP ${authorized.status}: ${await readBodyMessage(authorized)}`);
  }
  pass("admin users API authorized probe", `HTTP ${authorized.status}`);
}

async function runCheck(label, fn) {
  try {
    await fn();
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

await runCheck("Supabase config present", async () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  pass("Supabase config present", new URL(supabaseUrl).hostname);
});

if (supabaseUrl && serviceRoleKey) {
  await runCheck("user_profiles exists", () => probeTable("user_profiles", "user_id"));
  await runCheck("auth_events exists", () => probeTable("auth_events", "id"));
  await runCheck("image2_wallets exists", () => probeTable("image2_wallets", "user_id,balance"));
}

await runCheck("Turnstile env present", async () => {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const secret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (!siteKey || !secret) {
    throw new Error("Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY or TURNSTILE_SECRET_KEY.");
  }
  pass("Turnstile env present", "site key + secret configured");
});

await runCheck("admin users API probe", probeAdminUsersApi);

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`Unified auth health failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Unified auth health passed: ${checks.length}/${checks.length} checks passed.`);
