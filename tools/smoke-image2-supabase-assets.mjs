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

const root = process.cwd();
const envFile = resolve(root, args.get("env-file") ?? ".env.local");
const keepUser = args.get("keep-user") === "true";

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
const baseUrl = (args.get("base-url") ?? getEnv("IMAGE2_SMOKE_BASE_URL") ?? getEnv("APP_URL") ?? "http://localhost:3012")
  .replace(/\/+$/, "");

const required = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: secretKey
};

for (const [name, value] of Object.entries(required)) {
  if (!value) throw new Error(`Missing ${name}. Configure it in ${envFile} or process env.`);
}

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  "Content-Type": "application/json",
  "User-Agent": "image2-cases-smoke/1.0"
};

const publicHeaders = {
  apikey: publishableKey,
  "Content-Type": "application/json"
};

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 240) };
  }
}

function errorMessage(data, fallback) {
  return String(data.error_description ?? data.message ?? data.error ?? data.msg ?? fallback);
}

async function requestJson(url, init, fallback) {
  const response = await fetch(url, init);
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${fallback}: HTTP ${response.status} ${errorMessage(data, "")}`.trim());
  }
  return { response, data };
}

async function deleteUser(userId) {
  if (!userId) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: adminHeaders
  });
  return response.ok;
}

let createdUserId = "";
let cleanupOk = false;

try {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `image2-smoke-${suffix}@lsb0713.online`;
  const password = `Image2Smoke${Date.now()}!`;

  const create = await requestJson(
    `${supabaseUrl}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true
      })
    },
    "Could not create smoke user"
  );

  createdUserId = create.data.id ?? create.data.user?.id ?? "";
  if (!createdUserId) throw new Error("Smoke user creation did not return a user id.");
  console.log("[ok] created confirmed smoke user");

  const login = await requestJson(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: publicHeaders,
      body: JSON.stringify({ email, password })
    },
    "Could not login smoke user"
  );

  const accessToken = login.data.access_token;
  const authUserId = login.data.user?.id;
  if (!accessToken || !authUserId) throw new Error("Smoke login did not return an access token and user id.");
  console.log("[ok] logged in smoke user");

  const now = new Date().toISOString();
  const collectionName = `Smoke cloud sync ${suffix}`;
  const snapshot = {
    version: "image2-assets-v1",
    favoriteCaseKeys: ["smoke-case"],
    activeCollectionId: "smoke-collection",
    collections: [
      {
        id: "smoke-collection",
        name: collectionName,
        caseKeys: ["smoke-case"],
        createdAt: now,
        updatedAt: now
      }
    ],
    notes: {
      "smoke-case": {
        caseKey: "smoke-case",
        note: "Image2 Supabase smoke verification",
        updatedAt: now
      }
    },
    promptDrafts: {},
    promptReuseHistory: [],
    updatedAt: now
  };

  const assetHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  const post = await requestJson(
    `${baseUrl}/api/image2/assets`,
    {
      method: "POST",
      headers: assetHeaders,
      body: JSON.stringify({
        userId: "ignored-body-user-id",
        snapshot
      })
    },
    "Could not upload smoke asset snapshot"
  );

  if (post.data.storageMode !== "supabase-postgres") {
    throw new Error(`Expected supabase-postgres storageMode, got ${post.data.storageMode ?? "missing"}.`);
  }
  if (post.data.userId !== authUserId) {
    throw new Error("POST response userId did not match the authenticated Supabase user.");
  }
  console.log("[ok] uploaded cloud asset snapshot");

  const get = await requestJson(
    `${baseUrl}/api/image2/assets?userId=ignored-query-user-id`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    "Could not read smoke asset snapshot"
  );

  const hasCollection = Boolean(get.data.snapshot?.collections?.some?.((item) => item.name === collectionName));
  if (get.data.storageMode !== "supabase-postgres") {
    throw new Error(`Expected supabase-postgres storageMode on GET, got ${get.data.storageMode ?? "missing"}.`);
  }
  if (get.data.userId !== authUserId) {
    throw new Error("GET response userId did not match the authenticated Supabase user.");
  }
  if (!hasCollection) {
    throw new Error("GET response did not include the smoke collection.");
  }
  console.log("[ok] read back cloud asset snapshot");

  if (!keepUser) {
    cleanupOk = await deleteUser(createdUserId);
    if (!cleanupOk) throw new Error("Smoke passed, but test user cleanup failed.");
    console.log("[ok] cleaned up smoke user");
  }

  console.log("Image2 Supabase asset smoke passed.");
} catch (error) {
  if (createdUserId && !keepUser) {
    cleanupOk = await deleteUser(createdUserId).catch(() => false);
    if (cleanupOk) console.log("[ok] cleaned up smoke user after failure");
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
