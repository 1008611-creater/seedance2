import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "202606040001_image2_asset_change_logs.sql");
const sql = readFileSync(migrationPath, "utf8");
const lowerSql = sql.toLowerCase();

const requiredSnippets = [
  "create extension if not exists pgcrypto",
  "create table if not exists public.image2_asset_change_logs",
  "change_id text not null unique",
  "user_id uuid not null references auth.users(id) on delete cascade",
  "action text not null check (action in ('asset_snapshot_save', 'admin_undo_asset_snapshot'))",
  "actor jsonb not null default",
  "before_snapshot jsonb not null default '{}'::jsonb",
  "after_snapshot jsonb not null default '{}'::jsonb",
  "summary jsonb not null default '{}'::jsonb",
  "undone_at timestamptz",
  "undone_by text",
  "undo_change_id text",
  "create index if not exists image2_asset_change_logs_created_idx",
  "create index if not exists image2_asset_change_logs_user_created_idx",
  "create index if not exists image2_asset_change_logs_undo_idx",
  "alter table public.image2_asset_change_logs enable row level security",
  "create policy image2_asset_change_logs_select_own",
  "create policy image2_asset_change_logs_insert_own",
  "comment on table public.image2_asset_change_logs"
];

const requiredPatterns = [
  [/jsonb_typeof\(actor\)\s*=\s*'object'/i, "Missing actor object shape check."],
  [/jsonb_typeof\(before_snapshot\)\s*=\s*'object'/i, "Missing before_snapshot object shape check."],
  [/jsonb_typeof\(after_snapshot\)\s*=\s*'object'/i, "Missing after_snapshot object shape check."],
  [/jsonb_typeof\(summary\)\s*=\s*'object'/i, "Missing summary object shape check."],
  [/for\s+select\s+to\s+authenticated[\s\S]*using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i, "Missing authenticated select-own policy."],
  [/for\s+insert\s+to\s+authenticated[\s\S]*with\s+check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i, "Missing authenticated insert-own policy."]
];

const forbiddenPatterns = [
  [/create\s+policy[\s\S]*\bto\s+anon\b/i, "Change-log policies must not grant anon access."],
  [/disable\s+row\s+level\s+security/i, "Change-log migration must not disable RLS."],
  [/before_snapshot\s+jsonb[\s\S]*default\s+null/i, "before_snapshot must default to an object."],
  [/after_snapshot\s+jsonb[\s\S]*default\s+null/i, "after_snapshot must default to an object."]
];

const errors = [];

for (const snippet of requiredSnippets) {
  if (!lowerSql.includes(snippet.toLowerCase())) {
    errors.push(`Missing required SQL snippet: ${snippet}`);
  }
}

for (const [pattern, message] of requiredPatterns) {
  if (!pattern.test(sql)) errors.push(message);
}

for (const [pattern, message] of forbiddenPatterns) {
  if (pattern.test(sql)) errors.push(message);
}

if (errors.length) {
  console.error("Image2 asset change-log migration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Image2 asset change-log migration check passed.");
