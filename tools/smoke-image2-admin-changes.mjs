import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const root = process.cwd();
const port = Number(args.get("port") ?? process.env.IMAGE2_ADMIN_SMOKE_PORT ?? 3062);
const baseUrl = (args.get("base-url") ?? process.env.IMAGE2_SMOKE_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/+$/, "");
const adminToken = args.get("admin-token") ?? process.env.ADMIN_TOKEN ?? "image2-admin-smoke-token";
const storeFile = resolve(root, args.get("store-file") ?? `.tmp/image2-admin-changes-${Date.now()}.json`);
const reuseServer = args.get("reuse-server") === "true" || Boolean(process.env.IMAGE2_SMOKE_BASE_URL);

let server;

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/image2/assets?userId=health`);
      if (response.status < 500) return;
    } catch {
      // Keep waiting until Next is listening.
    }
    await wait(500);
  }
  throw new Error(`Server did not become ready at ${baseUrl}`);
}

async function startServer() {
  if (reuseServer) return;
  if (!existsSync(resolve(root, ".next", "BUILD_ID"))) {
    throw new Error("Missing .next/BUILD_ID. Run npm run build before smoke:image2-admin-changes, or pass --base-url to reuse a running server.");
  }

  await mkdir(dirname(storeFile), { recursive: true });
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npx next start -H 127.0.0.1 -p ${port}`]
      : ["next", "start", "-H", "127.0.0.1", "-p", String(port)];
  server = spawn(command, commandArgs, {
    cwd: root,
    env: {
      ...process.env,
      ADMIN_TOKEN: adminToken,
      IMAGE2_ASSET_SYNC_BACKEND: "local",
      SEEDANCE_STORE_FILE: storeFile
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  await waitForServer();
}

async function stopServer() {
  if (server) {
    server.kill("SIGTERM");
    await wait(700);
    if (!server.killed) server.kill("SIGKILL");
  }
  if (!reuseServer && existsSync(storeFile)) rmSync(storeFile, { force: true });
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

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const data = await readJson(response);
  return { data, response };
}

function snapshot(label, favoriteCaseKeys) {
  const now = new Date().toISOString();
  return {
    version: "image2-assets-v1",
    favoriteCaseKeys,
    activeCollectionId: "smoke-collection",
    collections: [
      {
        id: "smoke-collection",
        name: `Admin smoke ${label}`,
        caseKeys: favoriteCaseKeys,
        createdAt: now,
        updatedAt: now
      }
    ],
    notes: {
      [favoriteCaseKeys[0] ?? "empty"]: {
        caseKey: favoriteCaseKeys[0] ?? "empty",
        note: `snapshot ${label}`,
        updatedAt: now
      }
    },
    promptDrafts: {},
    promptReuseHistory: [],
    updatedAt: now
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  await startServer();

  const unauthorized = await requestJson("/api/admin/image2-cases/changes");
  assert(unauthorized.response.status === 401, `Expected unauthorized GET to be 401, got ${unauthorized.response.status}`);
  console.log("[ok] unauthorized admin GET returns 401");

  const userId = `image2-admin-smoke-${Date.now()}`;
  const firstSnapshot = snapshot("before", ["case-before"]);
  const secondSnapshot = snapshot("after", ["case-after", "case-extra"]);

  const firstSave = await requestJson("/api/image2/assets", {
    method: "POST",
    body: JSON.stringify({ userId, source: "smoke-admin-changes", reason: "smoke before", snapshot: firstSnapshot })
  });
  assert(firstSave.response.ok, `First asset POST failed: ${JSON.stringify(firstSave.data)}`);
  console.log("[ok] created before asset snapshot");

  const secondSave = await requestJson("/api/image2/assets", {
    method: "POST",
    body: JSON.stringify({ userId, source: "smoke-admin-changes", reason: "smoke after", snapshot: secondSnapshot })
  });
  assert(secondSave.response.ok, `Second asset POST failed: ${JSON.stringify(secondSave.data)}`);
  console.log("[ok] created after asset snapshot");

  const list = await requestJson("/api/admin/image2-cases/changes?limit=20", {
    headers: { "x-admin-token": adminToken }
  });
  assert(list.response.ok, `Admin changes GET failed: ${JSON.stringify(list.data)}`);
  const target = list.data.changes?.find?.((item) => item.userId === userId && item.reason === "smoke after");
  assert(target?.id, "Could not find the second asset change record.");
  console.log("[ok] admin list includes asset change record");

  const undo = await requestJson("/api/admin/image2-cases/changes", {
    method: "POST",
    headers: { "x-admin-token": adminToken },
    body: JSON.stringify({ changeId: target.id })
  });
  assert(undo.response.ok, `Admin undo failed: ${JSON.stringify(undo.data)}`);
  console.log("[ok] admin undo succeeded");

  const restored = await requestJson(`/api/image2/assets?userId=${encodeURIComponent(userId)}`);
  assert(restored.response.ok, `Asset read after undo failed: ${JSON.stringify(restored.data)}`);
  assert(
    JSON.stringify(restored.data.snapshot?.favoriteCaseKeys ?? []) === JSON.stringify(firstSnapshot.favoriteCaseKeys),
    `Undo did not restore before snapshot favorites: ${JSON.stringify(restored.data.snapshot?.favoriteCaseKeys)}`
  );
  assert(restored.data.snapshot?.notes?.["case-before"]?.note === "snapshot before", "Undo did not restore before snapshot note.");
  console.log("[ok] undo restored before snapshot");

  const repeatedUndo = await requestJson("/api/admin/image2-cases/changes", {
    method: "POST",
    headers: { "x-admin-token": adminToken },
    body: JSON.stringify({ changeId: target.id })
  });
  assert(!repeatedUndo.response.ok, "Repeated undo unexpectedly succeeded.");
  console.log(`[ok] repeated undo fails with HTTP ${repeatedUndo.response.status}`);

  if (!reuseServer) {
    const raw = JSON.parse(await readFile(storeFile, "utf8"));
    const changeCount = raw.image2AssetChanges?.filter?.((item) => item.userId === userId).length ?? 0;
    assert(changeCount >= 3, `Expected at least 3 change records in store, found ${changeCount}.`);
    await writeFile(storeFile, JSON.stringify(raw, null, 2), "utf8");
  }

  console.log("Image2 admin changes smoke passed.");
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
  });
