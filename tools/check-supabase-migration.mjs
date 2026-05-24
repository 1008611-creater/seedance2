import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(process.cwd(), "supabase", "migrations", "202605230001_image2_accounts_assets.sql");
const sql = readFileSync(migrationPath, "utf8");

const requiredTables = [
  "profiles",
  "image2_asset_snapshots",
  "image2_asset_events",
  "image2_prompt_variants",
  "license_codes",
  "license_redemptions",
  "entitlements",
  "daily_usage",
  "generations"
];

const requiredSnippets = [
  "create or replace function public.redeem_license_code",
  "p_code_hash text",
  "code_hash text not null unique",
  "hash_algorithm text not null",
  "comment on table public.license_codes is 'Stores license code hashes only.",
  "grant execute on function public.redeem_license_code(text, text, text) to authenticated",
  "snapshot_version text not null default 'image2-assets-v1'",
  "jsonb_typeof(snapshot) = 'object'"
];

const errors = [];

for (const table of requiredTables) {
  const createTable = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i");
  const enableRls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");

  if (!createTable.test(sql)) {
    errors.push(`Missing table: ${table}`);
  }

  if (!enableRls.test(sql)) {
    errors.push(`Missing RLS enablement: ${table}`);
  }
}

for (const snippet of requiredSnippets) {
  if (!sql.includes(snippet)) {
    errors.push(`Missing required SQL snippet: ${snippet}`);
  }
}

const forbiddenPatterns = [
  /plain(?:text)?_?code/i,
  /license_codes[\s\S]*\bcode\s+text\b/i,
  /create\s+policy\s+license_codes_select/i
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(sql)) {
    errors.push(`Forbidden license-code pattern found: ${pattern}`);
  }
}

if (errors.length > 0) {
  console.error("Supabase migration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Supabase migration check passed for ${requiredTables.length} tables.`);
