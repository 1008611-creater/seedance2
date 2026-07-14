import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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
const appPort = Number(args.get("port") ?? process.env.PICTURE_AUTH_SMOKE_PORT ?? 3067);
const supabasePort = Number(args.get("supabase-port") ?? process.env.PICTURE_AUTH_SMOKE_SUPABASE_PORT ?? 3068);
const timeoutMs = Number(args.get("timeout-ms") ?? 60000);
const baseUrl = `http://127.0.0.1:${appPort}`;
const supabaseUrl = `http://127.0.0.1:${supabasePort}`;

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

function nextBin() {
  const candidate = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(candidate)) throw new Error("Next.js binary not found. Run npm install first.");
  return candidate;
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
        "user-agent": "picture-auth-history-smoke/1.0",
        "x-forwarded-host": "picture.lsb0713.online",
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

async function waitForServer() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await request("/api/picture");
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error(`Timed out waiting for ${baseUrl}. Last error: ${lastError}`);
}

function createMockSupabaseServer() {
  const usersById = new Map();
  const usersByEmail = new Map();
  const accountsByUserId = new Map();
  const accountsByUsername = new Map();
  const tokens = new Map();
  const historiesByUserId = new Map();

  function send(response, status, data, headers = {}) {
    const body = typeof data === "string" ? data : JSON.stringify(data);
    response.writeHead(status, {
      "content-type": "application/json",
      ...headers
    });
    response.end(body);
  }

  async function bodyJson(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : {};
  }

  function userFromAuth(request) {
    const token = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const userId = tokens.get(token);
    return userId ? usersById.get(userId) : null;
  }

  function accountRow(row) {
    return {
      user_id: row.user_id,
      username: row.username,
      last_login_at: row.last_login_at ?? null,
      login_count: row.login_count ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", supabaseUrl);

      if (request.method === "POST" && url.pathname === "/auth/v1/admin/users") {
        const body = await bodyJson(request);
        const username = body.user_metadata?.picture_username;
        const email = body.email;
        if (!username || !email || !body.password) return send(response, 400, { message: "missing user fields" });
        if (usersByEmail.has(email)) return send(response, 422, { message: "User already registered" });
        const user = {
          email,
          id: `user-${usersById.size + 1}`,
          password: body.password,
          username
        };
        usersById.set(user.id, user);
        usersByEmail.set(email, user);
        return send(response, 200, { id: user.id, email: user.email, user_metadata: { picture_username: username } });
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/auth/v1/admin/users/")) {
        const userId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        const user = usersById.get(userId);
        if (user) {
          usersById.delete(userId);
          usersByEmail.delete(user.email);
          accountsByUserId.delete(userId);
          accountsByUsername.delete(user.username);
        }
        return send(response, 200, {});
      }

      if (request.method === "POST" && url.pathname === "/auth/v1/token") {
        const body = await bodyJson(request);
        const user = usersByEmail.get(body.email);
        if (!user || user.password !== body.password) return send(response, 400, { message: "Invalid login credentials" });
        const accessToken = `token-${user.id}-${Date.now()}`;
        tokens.set(accessToken, user.id);
        return send(response, 200, {
          access_token: accessToken,
          expires_in: 3600,
          refresh_token: `refresh-${user.id}`,
          token_type: "bearer",
          user: {
            email: user.email,
            id: user.id
          }
        });
      }

      if (request.method === "GET" && url.pathname === "/auth/v1/user") {
        const user = userFromAuth(request);
        if (!user) return send(response, 401, { message: "invalid token" });
        return send(response, 200, { email: user.email, id: user.id });
      }

      if (request.method === "POST" && url.pathname === "/auth/v1/logout") {
        return send(response, 200, {});
      }

      if (url.pathname === "/rest/v1/user_profiles" && request.method === "POST") {
        await bodyJson(request);
        return send(response, 201, []);
      }

      if (url.pathname === "/rest/v1/picture_accounts") {
        if (request.method === "GET") {
          const usernameFilter = url.searchParams.get("username")?.replace(/^eq\./, "");
          const userIdFilter = url.searchParams.get("user_id")?.replace(/^eq\./, "");
          const row = usernameFilter ? accountsByUsername.get(usernameFilter) : userIdFilter ? accountsByUserId.get(userIdFilter) : null;
          return send(response, 200, row ? [accountRow(row)] : []);
        }

        if (request.method === "POST") {
          const body = await bodyJson(request);
          if (accountsByUsername.has(body.username)) return send(response, 409, { message: "duplicate key" });
          const now = new Date().toISOString();
          const row = {
            created_at: now,
            last_login_at: null,
            login_count: 0,
            updated_at: now,
            user_id: body.user_id,
            username: body.username
          };
          accountsByUserId.set(row.user_id, row);
          accountsByUsername.set(row.username, row);
          return send(response, 201, [accountRow(row)]);
        }

        if (request.method === "PATCH") {
          const userId = url.searchParams.get("user_id")?.replace(/^eq\./, "");
          const row = accountsByUserId.get(userId);
          if (!row) return send(response, 404, { message: "not found" });
          const body = await bodyJson(request);
          row.last_login_at = body.last_login_at;
          row.login_count = body.login_count;
          row.updated_at = new Date().toISOString();
          return send(response, 200, [accountRow(row)]);
        }
      }

      if (url.pathname === "/rest/v1/picture_generation_runs") {
        if (request.method === "POST") {
          const body = await bodyJson(request);
          const now = new Date().toISOString();
          const row = {
            channel: body.channel,
            created_at: now,
            elapsed_seconds: body.elapsed_seconds,
            id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            images: body.images,
            mode: body.mode,
            prompt: body.prompt,
            ratio: body.ratio,
            resolution: body.resolution,
            seed: body.seed,
            user_id: body.user_id
          };
          const list = historiesByUserId.get(row.user_id) ?? [];
          historiesByUserId.set(row.user_id, [row, ...list]);
          return send(response, 201, [row]);
        }

        if (request.method === "GET") {
          const userId = url.searchParams.get("user_id")?.replace(/^eq\./, "");
          return send(response, 200, historiesByUserId.get(userId) ?? []);
        }
      }

      send(response, 404, { message: `unhandled ${request.method} ${url.pathname}` });
    } catch (error) {
      send(response, 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    listen: () => new Promise((resolve) => server.listen(supabasePort, "127.0.0.1", resolve))
  };
}

async function withServers(fn) {
  const mockSupabase = createMockSupabaseServer();
  await mockSupabase.listen();

  const outputRoot = path.resolve(".tmp", "picture-auth-history-output");
  mkdirSync(outputRoot, { recursive: true });

  const child = spawn(process.execPath, [nextBin(), "dev", "-H", "127.0.0.1", "-p", String(appPort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_URL: baseUrl,
      DAIHUO_OUTPUT_ROOT: outputRoot,
      IMAGE2_GENERATION_ALLOW_MOCKS: "true",
      IMAGE2_GENERATION_MOCK: "true",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: "mock-service-role-key"
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
    await mockSupabase.close();
    if (checks.some((check) => !check.ok)) {
      console.error(log.slice(-30).join("\n"));
    }
  }
}

await withServers(async () => {
  const username = `smoke_${Date.now().toString(36)}`;
  const password = "PictureSmoke123!";
  let accessToken = "";

  await runCheck("public picture config advertises auth and history", async () => {
    const response = await request("/api/picture");
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.provider === "picture", "expected public provider");
    assert(data.authRequired === true, "authRequired should be true");
    assert(data.historyEnabled === true, "historyEnabled should be true");
    pass("picture config", "authRequired/historyEnabled");
  });

  await runCheck("register returns username session", async () => {
    const response = await request("/api/picture/auth/register", {
      method: "POST",
      body: JSON.stringify({ password, username })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.accessToken, "missing accessToken");
    assert(data.user?.username === username, "username mismatch");
    accessToken = data.accessToken;
    pass("register", data.user.username);
  });

  await runCheck("me restores account session", async () => {
    const response = await request("/api/picture/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.user?.username === username, "username mismatch");
    pass("me", data.user.username);
  });

  await runCheck("generation saves history row", async () => {
    const response = await request("/api/picture", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        channel: "fast",
        mode: "text-to-image",
        n: 1,
        prompt: "一张干净的手机海报，白色背景，主体清晰，适合保存到历史。",
        ratio: "9:16",
        resolution: "2k",
        seed: 123456
      })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.images?.[0]?.path, "missing generated image path");
    assert(data.historyItem?.id, "missing history item");
    assert(data.historyItem.images?.[0]?.url?.startsWith("/api/picture/output/"), "history should use public picture output URL");
    pass("generation history", data.historyItem.id);
  });

  await runCheck("history returns saved item for same user", async () => {
    const response = await request("/api/picture/history", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.items?.length === 1, `expected 1 history item, got ${data.items?.length ?? 0}`);
    assert(data.items[0].prompt.includes("手机海报"), "saved prompt mismatch");
    pass("same user history", `${data.items.length} item`);
  });

  await runCheck("login returns a fresh session", async () => {
    const response = await request("/api/picture/auth/login", {
      method: "POST",
      body: JSON.stringify({ password, username })
    });
    const data = await readJson(response);
    assert(response.ok, `expected 2xx, got ${response.status}; ${data.error ?? ""}`);
    assert(data.accessToken, "missing accessToken");
    assert(data.user?.username === username, "username mismatch");
    pass("login", data.user.username);
  });

  await runCheck("another user cannot read first user's history", async () => {
    const otherUsername = `${username}_b`;
    const register = await request("/api/picture/auth/register", {
      method: "POST",
      body: JSON.stringify({ password, username: otherUsername })
    });
    const registerData = await readJson(register);
    assert(register.ok, `expected 2xx, got ${register.status}; ${registerData.error ?? ""}`);
    const history = await request("/api/picture/history", {
      headers: { Authorization: `Bearer ${registerData.accessToken}` }
    });
    const historyData = await readJson(history);
    assert(history.ok, `expected 2xx, got ${history.status}; ${historyData.error ?? ""}`);
    assert(Array.isArray(historyData.items) && historyData.items.length === 0, "another user should have empty history");
    pass("history isolation", "second user sees 0 items");
  });
});

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`Picture auth/history smoke failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Picture auth/history smoke passed: ${checks.length}/${checks.length} checks passed.`);
