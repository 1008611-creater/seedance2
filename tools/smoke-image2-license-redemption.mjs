import crypto from "node:crypto";
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

const envFile = resolve(process.cwd(), args.get("env-file") ?? ".env.local");
const fileEnv = parseEnvFile(envFile);
const getEnv = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();

const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const baseUrl = (args.get("base-url") ?? getEnv("IMAGE2_SMOKE_BASE_URL") ?? "http://localhost:3012").replace(/\/+$/, "");
const keepData = args.get("keep-data") === "true";

const required = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey
};

for (const [name, value] of Object.entries(required)) {
  if (!value) throw new Error(`Missing ${name}. Configure it in ${envFile} or process env.`);
}

const isSecretApiKey = serviceKey.startsWith("sb_secret_");
const adminHeaders = {
  apikey: serviceKey,
  ...(isSecretApiKey ? {} : { Authorization: `Bearer ${serviceKey}` }),
  "Content-Type": "application/json",
  "User-Agent": "image2-license-smoke/1.0"
};
const publicHeaders = {
  apikey: anonKey,
  "Content-Type": "application/json"
};

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `image2-license-smoke-${suffix}@lsb0713.online`;
const password = `Image2LicenseSmoke${Date.now()}!`;
const code = `IMAGE2-SMOKE-${suffix}`;
const codeHash = crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

let createdUserId = "";
let createdLicenseId = "";

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
  return data;
}

async function deleteUser(userId) {
  if (!userId) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: adminHeaders
  });
  return response.ok;
}

async function deleteLicense(licenseId) {
  if (!licenseId) return false;

  const response = await fetch(`${supabaseUrl}/rest/v1/license_codes?id=eq.${encodeURIComponent(licenseId)}`, {
    method: "DELETE",
    headers: adminHeaders
  });
  return response.ok;
}

try {
  const pageResponse = await fetch(`${baseUrl}/image2-cases`, {
    headers: { "User-Agent": "image2-license-smoke/1.0" }
  });
  if (!pageResponse.ok) throw new Error(`Image2 cases page is not reachable: HTTP ${pageResponse.status}.`);
  console.log("[ok] Image2 cases page reachable");

  const createdUser = await requestJson(
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

  createdUserId = createdUser.id ?? createdUser.user?.id ?? "";
  if (!createdUserId) throw new Error("Smoke user creation did not return a user id.");
  console.log("[ok] created confirmed smoke user");

  const insertedLicenses = await requestJson(
    `${supabaseUrl}/rest/v1/license_codes?select=id`,
    {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        code_hash: codeHash,
        plan: "weekly_free",
        max_redemptions: 1,
        expires_at: "2026-12-31T15:59:59Z"
      })
    },
    "Could not insert hashed smoke license"
  );

  createdLicenseId = insertedLicenses[0]?.id ?? "";
  if (!createdLicenseId) throw new Error("Smoke license insert did not return a license id.");
  console.log("[ok] inserted hashed smoke license");

  const login = await requestJson(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: publicHeaders,
      body: JSON.stringify({ email, password })
    },
    "Could not login smoke user"
  );

  const accessToken = login.access_token;
  if (!accessToken) throw new Error("Smoke login did not return an access token.");
  console.log("[ok] logged in smoke user");

  const redeemResult = await requestJson(
    `${baseUrl}/api/image2/redeem`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "image2-license-smoke/1.0"
      },
      body: JSON.stringify({ code })
    },
    "Could not redeem smoke license"
  );

  if (!redeemResult.membership?.active) {
    throw new Error("Smoke redemption succeeded but membership was not active.");
  }
  console.log(`[ok] redeemed smoke license (${redeemResult.redemption?.plan ?? "unknown plan"})`);

  const duplicateResponse = await fetch(`${baseUrl}/api/image2/redeem`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "image2-license-smoke/1.0"
    },
    body: JSON.stringify({ code })
  });
  const duplicateData = await readJson(duplicateResponse);
  const duplicateMessage = errorMessage(duplicateData, "");

  if (duplicateResponse.ok || !duplicateMessage.includes("已经兑换")) {
    throw new Error(`Expected duplicate redemption rejection, got HTTP ${duplicateResponse.status}: ${duplicateMessage}`);
  }
  console.log("[ok] duplicate redemption rejected");

  console.log("Image2 license redemption smoke passed.");
} finally {
  if (!keepData) {
    const userCleanupOk = await deleteUser(createdUserId).catch(() => false);
    if (createdUserId && !userCleanupOk) console.warn("[warn] smoke user cleanup failed");
    if (createdUserId && userCleanupOk) console.log("[ok] cleaned up smoke user");

    const licenseCleanupOk = await deleteLicense(createdLicenseId).catch(() => false);
    if (createdLicenseId && !licenseCleanupOk) console.warn("[warn] smoke license cleanup failed");
    if (createdLicenseId && licenseCleanupOk) console.log("[ok] cleaned up smoke license");
  }
}
