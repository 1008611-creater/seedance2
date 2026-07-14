import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "202606030001_image2_gacha_runs.sql");
const sql = readFileSync(migrationPath, "utf8");

const requiredTables = ["image2_gacha_runs", "image2_gacha_recipes"];
const requiredSnippets = [
  "create table if not exists public.image2_gacha_runs",
  "create table if not exists public.image2_gacha_recipes",
  "user_id uuid not null references auth.users(id) on delete cascade",
  "mode text not null check (mode in ('single', 'pack'))",
  "status text not null default 'draft' check (status in ('draft', 'drawing', 'partial', 'done', 'failed'))",
  "source_case jsonb not null default '{}'::jsonb",
  "params jsonb not null default '{}'::jsonb",
  "cards jsonb not null default '[]'::jsonb",
  "constraint image2_gacha_runs_draw_slots_check check (draw_count <= target_slots)",
  "references public.image2_gacha_runs(run_id) on delete cascade",
  "create index if not exists image2_gacha_runs_user_updated_idx",
  "create index if not exists image2_gacha_runs_user_source_idx",
  "create index if not exists image2_gacha_recipes_user_created_idx"
];

const errors = [];

for (const table of requiredTables) {
  const createTable = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i");
  const enableRls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
  const selectOwnPolicy = new RegExp(`create\\s+policy\\s+${table}_select_own\\b`, "i");
  const insertOwnPolicy = new RegExp(`create\\s+policy\\s+${table}_insert_own\\b`, "i");

  if (!createTable.test(sql)) errors.push(`Missing table: ${table}`);
  if (!enableRls.test(sql)) errors.push(`Missing RLS enablement: ${table}`);
  if (!selectOwnPolicy.test(sql)) errors.push(`Missing select-own RLS policy: ${table}`);
  if (!insertOwnPolicy.test(sql)) errors.push(`Missing insert-own RLS policy: ${table}`);
}

for (const snippet of requiredSnippets) {
  if (!sql.includes(snippet)) errors.push(`Missing required SQL snippet: ${snippet}`);
}

const forbiddenPatterns = [
  /public\.image2_gacha_runs[\s\S]*for\s+select[\s\S]*using\s*\(\s*true\s*\)/i,
  /public\.image2_gacha_recipes[\s\S]*for\s+select[\s\S]*using\s*\(\s*true\s*\)/i,
  /create\s+policy[\s\S]*to\s+anon/i,
  /secret|token|password|apikey/i
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(sql)) errors.push(`Forbidden gacha migration pattern found: ${pattern}`);
}

if (errors.length) {
  console.error("Image2 gacha migration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Image2 gacha migration check passed for ${requiredTables.length} tables.`);
