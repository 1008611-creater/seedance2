import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
const migrationPath = resolve(root, args.get("file") ?? "supabase/migrations/202606030001_image2_gacha_runs.sql");
const dryRun = args.get("dry-run") === "true";

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

function assertMigrationLooksRight(sql) {
  const required = [
    "create table if not exists public.image2_gacha_runs",
    "create table if not exists public.image2_gacha_recipes",
    "alter table public.image2_gacha_runs enable row level security",
    "alter table public.image2_gacha_recipes enable row level security"
  ];
  const missing = required.filter((snippet) => !sql.toLowerCase().includes(snippet));
  if (missing.length) {
    throw new Error(`Migration file does not look like the Image2 gacha migration. Missing: ${missing.join(", ")}`);
  }
}

function psqlCommand() {
  const command = process.platform === "win32" ? "psql.exe" : "psql";
  const probe = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    throw new Error("psql is not available on this machine. Install PostgreSQL client tools, or run the SQL in Supabase SQL Editor.");
  }
  return command;
}

function parseDatabaseUrl(value) {
  if (!value) throw new Error(`Missing SUPABASE_DB_URL. Add it to ${envFile}, process env, or run the SQL in Supabase SQL Editor.`);
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("SUPABASE_DB_URL must be a postgres:// or postgresql:// connection string.");
  }

  return {
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "") || "postgres"),
    host: url.hostname,
    password: decodeURIComponent(url.password),
    port: url.port || "5432",
    sslMode: url.searchParams.get("sslmode") || "require",
    user: decodeURIComponent(url.username)
  };
}

const fileEnv = parseEnvFile(envFile);
const dbUrl = (process.env.SUPABASE_DB_URL ?? fileEnv.SUPABASE_DB_URL ?? "").trim();

try {
  const sql = readFileSync(migrationPath, "utf8");
  assertMigrationLooksRight(sql);

  const db = parseDatabaseUrl(dbUrl);
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          database: db.database,
          host: db.host,
          migrationPath,
          sslMode: db.sslMode,
          user: db.user
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const command = psqlCommand();
  const result = spawnSync(command, ["-v", "ON_ERROR_STOP=1", "-f", migrationPath], {
    env: {
      ...process.env,
      PGDATABASE: db.database,
      PGHOST: db.host,
      PGPASSWORD: db.password,
      PGPORT: db.port,
      PGSSLMODE: db.sslMode,
      PGUSER: db.user
    },
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql exited with status ${result.status}.`);
  }

  console.log("Image2 gacha Supabase migration applied.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
