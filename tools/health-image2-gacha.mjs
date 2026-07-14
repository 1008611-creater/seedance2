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

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 240) };
  }
}

const fileEnv = parseEnvFile(envFile);
const getEnv = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();
const baseUrl = (args.get("base-url") || getEnv("IMAGE2_SMOKE_BASE_URL") || getEnv("APP_URL") || "http://127.0.0.1:3012").replace(/\/+$/, "");
const adminToken = args.get("admin-token") || getEnv("IMAGE2_HEALTH_ADMIN_TOKEN") || getEnv("ADMIN_TOKEN");

if (!adminToken) {
  console.error(`Missing ADMIN_TOKEN. Set it in ${envFile}, process env, or pass --admin-token=...`);
  process.exitCode = 1;
} else {
  const response = await fetch(`${baseUrl}/api/admin/image2-gacha/health`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "User-Agent": "image2-gacha-health/1.0"
    }
  });
  const data = await readJson(response);

  console.log(data.summary ?? `Image2 gacha health: HTTP ${response.status}`);
  if (data.config?.storageMode) {
    console.log(`[mode] storage: ${data.config.storageMode}`);
  }
  if (data.nextRequiredAction) {
    console.log(`[next] ${data.nextRequiredAction}`);
  }
  if (Array.isArray(data.checks)) {
    for (const check of data.checks) {
      const mark = check.ok ? "[ok]" : check.level === "warning" ? "[warn]" : "[fail]";
      console.log(`${mark} ${check.label}: ${check.message}`);
      if (!check.ok && check.action) console.log(`      next: ${check.action}`);
    }
  } else if (data.error) {
    console.log(`[fail] ${data.error}`);
  }

  if (!response.ok || !data.ready) {
    process.exitCode = 1;
  }
}
