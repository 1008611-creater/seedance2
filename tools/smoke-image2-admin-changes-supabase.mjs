import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const envFile = resolve(root, args.get("env-file") ?? ".env.local");
const keepUser = args.get("keep-user") === "true";
const probeOnly = args.get("probe-only") === "true";

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
const getEnv = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();

const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const publishableKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const secretKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const adminToken = args.get("admin-token") ?? getEnv("ADMIN_TOKEN");
const baseUrl = (args.get("base-url") ?? getEnv("IMAGE2_SMOKE_BASE_URL") ?? "https://image2.lsb0713.online").replace(
  /\/+$/,
  ""
);

const required = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: secretKey,
  ADMIN_TOKEN: adminToken
};

for (const [name, value] of Object.entries(required)) {
  if (!value) throw new Error(`Missing ${name}. Configure it in ${envFile}, process env, or pass the matching CLI option.`);
}

const service = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 240) };
  }
}

function messageFrom(value) {
  return String(value?.error_description ?? value?.message ?? value?.error ?? value?.msg ?? "");
}

async function requestJson(url, init, fallback) {
  const response = await fetch(url, init);
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${fallback}: HTTP ${response.status} ${messageFrom(data)}`.trim());
  }
  return { data, response };
}

function migrationHint(table, error) {
  return `Missing or unreadable Supabase table ${table}. Apply supabase/migrations/202606040001_image2_asset_change_logs.sql before production smoke. ${error?.message ?? ""}`.trim();
}

async function assertStorageReady() {
  const snapshots = await service.from("image2_asset_snapshots").select("user_id").limit(1);
  if (snapshots.error) {
    throw new Error(
      `Missing or unreadable Supabase table image2_asset_snapshots. Apply the Image2 asset sync migration first. ${snapshots.error.message}`
    );
  }

  const changes = await service.from("image2_asset_change_logs").select("change_id").limit(1);
  if (changes.error) throw new Error(migrationHint("image2_asset_change_logs", changes.error));

  console.log("[ok] verified Supabase asset snapshot and change-log tables");
}

function snapshot(label, favoriteCaseKeys, marker) {
  const now = new Date().toISOString();
  const firstKey = favoriteCaseKeys[0] ?? "empty";
  return {
    version: "image2-assets-v1",
    favoriteCaseKeys,
    activeCollectionId: `smoke-admin-changes-${label}`,
    collections: [
      {
        id: `smoke-admin-changes-${label}`,
        name: `Admin changes smoke ${label} ${marker}`,
        caseKeys: favoriteCaseKeys,
        createdAt: now,
        updatedAt: now
      }
    ],
    notes: {
      [firstKey]: {
        caseKey: firstKey,
        note: `snapshot ${label} ${marker}`,
        updatedAt: now
      }
    },
    promptDrafts: {
      [firstKey]: {
        caseTitle: `Smoke ${label}`,
        fields: {
          subject: `smoke subject ${label}`,
          style: "case-library smoke",
          composition: "centered",
          lighting: "soft",
          materials: "clean",
          text: "none"
        },
        note: `draft ${label} ${marker}`,
        prompt: `Smoke prompt ${label} ${marker}`,
        updatedAt: now
      }
    },
    promptReuseHistory: [],
    updatedAt: now
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup(userId) {
  if (!userId) return;

  const cleanupErrors = [];
  const deletes = [
    ["image2_asset_change_logs", service.from("image2_asset_change_logs").delete().eq("user_id", userId)],
    ["image2_asset_events", service.from("image2_asset_events").delete().eq("user_id", userId)],
    ["image2_asset_snapshots", service.from("image2_asset_snapshots").delete().eq("user_id", userId)]
  ];

  for (const [label, operation] of deletes) {
    const result = await operation;
    if (result.error) cleanupErrors.push(`${label}: ${result.error.message}`);
  }

  const deleted = await service.auth.admin.deleteUser(userId);
  if (deleted.error) cleanupErrors.push(`auth.users: ${deleted.error.message}`);

  if (cleanupErrors.length) {
    throw new Error(`Smoke passed, but cleanup had errors: ${cleanupErrors.join("; ")}`);
  }
}

let userId = "";

try {
  await assertStorageReady();
  if (probeOnly) {
    console.log("Image2 admin change-log Supabase probe passed.");
    process.exit(0);
  }

  const unauthorized = await fetch(`${baseUrl}/api/admin/image2-cases/changes`);
  assert(unauthorized.status === 401, `Expected unauthorized admin changes GET to be 401, got ${unauthorized.status}.`);
  console.log("[ok] unauthorized admin changes GET returns 401");

  const marker = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const email = `image2-admin-changes-smoke-${marker}@lsb0713.online`;
  const password = `Image2AdminChangesSmoke${crypto.randomBytes(8).toString("hex")}!`;

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (created.error) throw created.error;
  userId = created.data.user?.id ?? "";
  if (!userId) throw new Error("Smoke user creation did not return a user id.");
  console.log("[ok] created confirmed smoke user");

  const signedIn = await publicClient.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const accessToken = signedIn.data.session?.access_token;
  if (!accessToken) throw new Error("Smoke user did not receive an access token.");
  console.log("[ok] logged in smoke user");

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "image2-admin-changes-smoke/1.0"
  };

  const adminHeaders = {
    "x-admin-token": adminToken,
    "Content-Type": "application/json",
    "User-Agent": "image2-admin-changes-smoke/1.0"
  };

  const beforeSnapshot = snapshot("before", [`smoke-before-${marker}`], marker);
  const afterSnapshot = snapshot("after", [`smoke-after-${marker}`, `smoke-extra-${marker}`], marker);

  const beforeSave = await requestJson(
    `${baseUrl}/api/image2/assets`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        reason: `smoke before ${marker}`,
        source: "smoke-admin-changes-supabase",
        snapshot: beforeSnapshot
      })
    },
    "Could not save before asset snapshot"
  );
  assert(beforeSave.data.storageMode === "supabase-postgres", `Expected Supabase storageMode, got ${beforeSave.data.storageMode ?? "missing"}.`);
  assert(!beforeSave.data.changeLogWarning, `Unexpected change-log warning on before save: ${beforeSave.data.changeLogWarning}`);
  console.log("[ok] saved before asset snapshot");

  const afterSave = await requestJson(
    `${baseUrl}/api/image2/assets`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        reason: `smoke after ${marker}`,
        source: "smoke-admin-changes-supabase",
        snapshot: afterSnapshot
      })
    },
    "Could not save after asset snapshot"
  );
  assert(afterSave.data.storageMode === "supabase-postgres", `Expected Supabase storageMode, got ${afterSave.data.storageMode ?? "missing"}.`);
  assert(!afterSave.data.changeLogWarning, `Unexpected change-log warning on after save: ${afterSave.data.changeLogWarning}`);
  console.log("[ok] saved after asset snapshot and change-log record");

  const list = await requestJson(
    `${baseUrl}/api/admin/image2-cases/changes?limit=100`,
    {
      headers: adminHeaders
    },
    "Could not list admin asset changes"
  );
  assert(list.data.storageMode === "supabase-postgres", `Expected Supabase admin storageMode, got ${list.data.storageMode ?? "missing"}.`);
  const target = list.data.changes?.find?.((item) => item.userId === userId && item.reason === `smoke after ${marker}`);
  assert(target?.id, "Could not find the smoke after change in admin change list.");
  console.log("[ok] admin list includes smoke after change");

  const undo = await requestJson(
    `${baseUrl}/api/admin/image2-cases/changes`,
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ changeId: target.id })
    },
    "Could not undo admin asset change"
  );
  assert(undo.data.storageMode === "supabase-postgres", `Expected Supabase undo storageMode, got ${undo.data.storageMode ?? "missing"}.`);
  assert(undo.data.change?.undoneAt, "Undo response did not mark the original change as undone.");
  assert(undo.data.undoChange?.id, "Undo response did not include the appended undo change.");
  console.log("[ok] admin undo succeeded");

  const restored = await requestJson(
    `${baseUrl}/api/image2/assets`,
    {
      headers: authHeaders
    },
    "Could not read restored asset snapshot"
  );
  assert(restored.data.storageMode === "supabase-postgres", `Expected Supabase read storageMode, got ${restored.data.storageMode ?? "missing"}.`);
  assert(
    JSON.stringify(restored.data.snapshot?.favoriteCaseKeys ?? []) === JSON.stringify(beforeSnapshot.favoriteCaseKeys),
    `Undo did not restore before favorites: ${JSON.stringify(restored.data.snapshot?.favoriteCaseKeys)}`
  );
  const beforeKey = beforeSnapshot.favoriteCaseKeys[0];
  assert(restored.data.snapshot?.notes?.[beforeKey]?.note === beforeSnapshot.notes[beforeKey].note, "Undo did not restore the before note.");
  assert(
    restored.data.snapshot?.promptDrafts?.[beforeKey]?.prompt === beforeSnapshot.promptDrafts[beforeKey].prompt,
    "Undo did not restore the before prompt draft."
  );
  console.log("[ok] undo restored before snapshot");

  const repeatedUndo = await fetch(`${baseUrl}/api/admin/image2-cases/changes`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ changeId: target.id })
  });
  assert(!repeatedUndo.ok, "Repeated undo unexpectedly succeeded.");
  console.log(`[ok] repeated undo fails with HTTP ${repeatedUndo.status}`);

  if (!keepUser) {
    await cleanup(userId);
    userId = "";
    console.log("[ok] cleaned up smoke user and data");
  }

  console.log("Image2 admin changes Supabase smoke passed.");
} catch (error) {
  if (userId && !keepUser) {
    await cleanup(userId)
      .then(() => console.log("[ok] cleaned up smoke user after failure"))
      .catch((cleanupError) =>
        console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError)
      );
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
