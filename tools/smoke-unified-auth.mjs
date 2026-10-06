import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

const checks = [];
const port = Number(args.get("port") ?? process.env.UNIFIED_AUTH_SMOKE_PORT ?? 3064);
const adminToken = args.get("admin-token") ?? process.env.UNIFIED_AUTH_SMOKE_ADMIN_TOKEN ?? "smoke-admin-token";
const timeoutMs = Number(args.get("timeout-ms") ?? 45000);
const externalBase = args.get("base-url") ?? process.env.UNIFIED_AUTH_SMOKE_BASE_URL ?? "";
const baseUrl = externalBase ? externalBase.replace(/\/+$/, "") : `http://127.0.0.1:${port}`;

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

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
        "user-agent": "seedance2-unified-auth-smoke/1.0",
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

function nextBin() {
  const candidate = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(candidate)) throw new Error("Next.js binary not found. Run npm install first.");
  return candidate;
}

async function waitForServer() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await request("/login", { headers: { "x-forwarded-host": "image2.cauai.fun" } });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error(`Timed out waiting for ${baseUrl}. Last error: ${lastError}`);
}

async function withServer(envOverrides, fn) {
  if (externalBase) {
    await fn();
    return;
  }

  const child = spawn(process.execPath, [nextBin(), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...envOverrides
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const log = [];
  let exited = false;
  child.stdout.on("data", (chunk) => log.push(String(chunk).trim()));
  child.stderr.on("data", (chunk) => log.push(String(chunk).trim()));
  child.once("exit", () => {
    exited = true;
  });

  try {
    await waitForServer();
    await fn();
  } finally {
    if (!exited) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    if (checks.some((check) => !check.ok)) {
      console.error(log.slice(-20).join("\n"));
    }
  }
}

await withServer(
  {
    ADMIN_TOKEN: adminToken,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    UNIFIED_AUTH_ALLOW_MOCKS: "",
    UNIFIED_AUTH_SUPABASE_MOCK: "",
    UNIFIED_AUTH_TURNSTILE_MOCK: "",
    UNIFIED_AUTH_TURNSTILE_REQUIRED: "true"
  },
  async () => {
    await runCheck("production-like Turnstile config is required", async () => {
      const response = await request("/api/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({
          identifier: "buyer@example.com"
        })
      });
      const data = await readJson(response);
      assert(response.status === 400, `expected HTTP 400, got ${response.status}; ${data.error ?? ""}`);
      assert(/人机验证|TURNSTILE_SECRET_KEY/.test(data.error ?? ""), "missing Turnstile configuration error");
      pass("turnstile missing config", `HTTP ${response.status}`);
    });

    await runCheck("admin users reports missing Supabase config", async () => {
      const response = await request("/api/admin/users", {
        headers: { "x-admin-token": adminToken }
      });
      const data = await readJson(response);
      assert(response.status === 400, `expected HTTP 400, got ${response.status}; ${data.error ?? ""}`);
      assert(/Supabase|未配置/.test(data.error ?? ""), "missing Supabase configuration error");
      pass("admin users missing Supabase config", `HTTP ${response.status}`);
    });
  }
);

await withServer(
  {
    ADMIN_TOKEN: adminToken,
    NEXT_PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "mock-site-key",
    SUPABASE_SERVICE_ROLE_KEY: "mock-service-role-key",
    TURNSTILE_SECRET_KEY: "",
    UNIFIED_AUTH_ALLOW_MOCKS: "true",
    UNIFIED_AUTH_SUPABASE_MOCK: "pass",
    UNIFIED_AUTH_TURNSTILE_MOCK: "auto",
    UNIFIED_AUTH_TURNSTILE_REQUIRED: "true"
  },
  async () => {
    await runCheck("admin users rejects missing token", async () => {
      const response = await request("/api/admin/users");
      const data = await readJson(response);
      assert(response.status === 401, `expected HTTP 401, got ${response.status}; ${data.error ?? ""}`);
      pass("admin users unauthenticated", `HTTP ${response.status}`);
  });

  await runCheck("turnstile failure blocks OTP send", async () => {
    const response = await request("/api/auth/otp/send", {
      method: "POST",
      body: JSON.stringify({
        identifier: "buyer@example.com",
        turnstileToken: "smoke-fail"
      })
    });
    const data = await readJson(response);
    assert(response.status === 403, `expected HTTP 403, got ${response.status}; ${data.error ?? ""}`);
    assert(/人机验证|Turnstile|验证/.test(data.error ?? ""), "missing human verification error");
    pass("otp send turnstile failure", `HTTP ${response.status}`);
  });

  await runCheck("email OTP send creates Supabase request shape", async () => {
    const response = await request("/api/auth/otp/send", {
      method: "POST",
      headers: { "x-forwarded-host": "scene.lsb0713.online" },
      body: JSON.stringify({
        identifier: "buyer@example.com",
        turnstileToken: "smoke-pass"
      })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.contactType === "email", "expected email contactType");
    assert(data.providerRequest?.body?.email === "buyer@example.com", "missing email in mocked Supabase request");
    assert(data.providerRequest?.body?.create_user === true, "expected create_user true");
    pass("email otp send mock", data.maskedIdentifier);
  });

  await runCheck("phone OTP send creates SMS request shape", async () => {
    const response = await request("/api/auth/otp/send", {
      method: "POST",
      headers: { "x-forwarded-host": "scene.lsb0713.online" },
      body: JSON.stringify({
        identifier: "+8613800000000",
        turnstileToken: "smoke-pass"
      })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.contactType === "phone", "expected phone contactType");
    assert(data.providerRequest?.body?.phone === "+8613800000000", "missing phone in mocked Supabase request");
    assert(data.providerRequest?.body?.channel === "sms", "expected sms channel");
    pass("phone otp send mock", data.maskedIdentifier);
  });

  await runCheck("OTP verify returns unified session and profile", async () => {
    const response = await request("/api/auth/otp/verify", {
      method: "POST",
      headers: { "x-forwarded-host": "scene.lsb0713.online" },
      body: JSON.stringify({
        code: "123456",
        identifier: "buyer@example.com"
      })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.accessToken, "missing accessToken");
    assert(data.refreshToken, "missing refreshToken");
    assert(data.user?.id, "missing user.id");
    assert(data.user?.email === "buyer@example.com", "missing user.email");
    assert(data.profile?.userId === data.user.id, "profile userId mismatch");
    pass("otp verify mock", data.user.id);
  });

  await runCheck("admin users returns list with token", async () => {
    const response = await request("/api/admin/users", {
      headers: { "x-admin-token": adminToken }
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(Array.isArray(data.users), "users is not an array");
      assert(data.users.length >= 1, "expected at least one mocked user");
      pass("admin users authorized", `${data.users.length} users`);
    });

    await runCheck("Image2 login page renders Image2 account copy", async () => {
      const response = await request("/login", {
        headers: { "x-forwarded-host": "image2.cauai.fun" }
      });
      const text = stripHtml(await response.text());
      assert(response.ok, `expected 2xx, got ${response.status}`);
      assert(text.includes("Image2 账号"), "missing Image2 account copy");
      assert(text.includes("邮箱或手机号"), "missing identifier input copy");
      assert(!text.includes("ScenePlus"), "old ScenePlus copy leaked");
      pass("image2 login page", `HTTP ${response.status}`);
    });

    await runCheck("scene login page renders scene account copy", async () => {
      const response = await request("/login", {
        headers: { "x-forwarded-host": "scene.lsb0713.online" }
      });
      const text = stripHtml(await response.text());
      assert(response.ok, `expected 2xx, got ${response.status}`);
      assert(text.includes("场景引擎账号"), "missing scene account copy");
      assert(text.includes("邮箱或手机号"), "missing identifier input copy");
      assert(!text.includes("ScenePlus"), "old ScenePlus copy leaked");
      pass("scene login page", `HTTP ${response.status}`);
    });

    await runCheck("admin users page renders management UI", async () => {
      const response = await request("/admin/users");
      const text = stripHtml(await response.text());
      assert(response.ok, `expected 2xx, got ${response.status}`);
      assert(text.includes("用户管理后台"), "missing admin users heading");
      assert(text.includes("后台口令"), "missing admin token input copy");
      assert(text.includes("暂无用户数据"), "missing empty state");
      pass("admin users page", `HTTP ${response.status}`);
    });
  }
);

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`Unified auth smoke failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Unified auth smoke passed: ${checks.length}/${checks.length} checks passed.`);
