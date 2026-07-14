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

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exitCode = 1;
} else {
  const isSecretApiKey = serviceRoleKey.startsWith("sb_secret_");
  const headers = {
    apikey: serviceRoleKey,
    ...(isSecretApiKey ? {} : { Authorization: `Bearer ${serviceRoleKey}` }),
    "Content-Type": "application/json"
  };

  const dedicatedTables = [
    { name: "picture_accounts", select: "user_id" },
    { name: "picture_generation_runs", select: "id" }
  ];
  const results = await Promise.all(
    dedicatedTables.map(async (table) => {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table.name}?select=${table.select}&limit=1`, {
        headers,
        cache: "no-store"
      });
      const text = response.ok ? "" : await response.text();
      return {
        ok: response.ok,
        status: response.status,
        table: table.name,
        errorCode: text.match(/"code":"([^"]+)"/)?.[1] ?? ""
      };
    })
  );

  for (const result of results) {
    if (result.ok) {
      console.log(`[ok] ${result.table} reachable`);
    } else {
      console.error(`[fail] ${result.table} HTTP ${result.status}${result.errorCode ? ` ${result.errorCode}` : ""}`);
    }
  }

  const dedicatedFailed = results.filter((result) => !result.ok);
  if (!dedicatedFailed.length) {
    console.log("[mode] storage: dedicated-picture-tables");
    console.log("Picture auth/history health check passed.");
  } else {
    const fallbackChecks = await Promise.all(
      [
        { name: "user_profiles", select: "user_id,display_name,source_site,login_count,last_login_at" },
        { name: "image2_asset_snapshots", select: "user_id,snapshot_version,snapshot,updated_at" }
      ].map(async (table) => {
        const response = await fetch(`${supabaseUrl}/rest/v1/${table.name}?select=${table.select}&limit=1`, {
          headers,
          cache: "no-store"
        });
        const text = response.ok ? "" : await response.text();
        return {
          ok: response.ok,
          status: response.status,
          table: table.name,
          errorCode: text.match(/"code":"([^"]+)"/)?.[1] ?? ""
        };
      })
    );

    for (const result of fallbackChecks) {
      if (result.ok) {
        console.log(`[ok] fallback ${result.table} reachable`);
      } else {
        console.error(`[fail] fallback ${result.table} HTTP ${result.status}${result.errorCode ? ` ${result.errorCode}` : ""}`);
      }
    }

    if (fallbackChecks.every((result) => result.ok)) {
      console.log("[mode] storage: image2_asset_snapshots fallback");
      console.log("Picture auth/history health check passed with fallback storage. Apply the picture migration later for the formal table shape.");
    } else {
      console.error("Picture auth/history storage is not ready.");
      process.exitCode = 1;
    }
  }
}
