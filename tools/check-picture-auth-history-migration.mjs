import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "202606040003_picture_accounts_history.sql");
const sql = readFileSync(migrationPath, "utf8");
const sqlWithoutComments = sql
  .replace(/--.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const lowerSql = sqlWithoutComments.toLowerCase();

const requiredSnippets = [
  "create table if not exists public.picture_accounts",
  "user_id uuid primary key references auth.users(id) on delete cascade",
  "username text not null unique",
  "create table if not exists public.picture_generation_runs",
  "prompt text not null",
  "images jsonb not null default '[]'::jsonb",
  "alter table public.picture_accounts enable row level security",
  "alter table public.picture_generation_runs enable row level security",
  "create policy picture_accounts_select_own",
  "create policy picture_generation_runs_select_own",
  "create policy picture_generation_runs_insert_own",
  "comment on table public.picture_accounts",
  "comment on table public.picture_generation_runs"
];

const requiredPatterns = [
  [/username\s*~\s*'\^\[a-z0-9_\]\{3,24\}\$'/i, "Missing username shape check."],
  [/jsonb_typeof\(images\)\s*=\s*'array'/i, "Missing images array shape check."],
  [/jsonb_typeof\(metadata\)\s*=\s*'object'/i, "Missing metadata object shape check."],
  [/for\s+select\s+to\s+authenticated[\s\S]*using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i, "Missing select-own RLS policy."],
  [/for\s+insert\s+to\s+authenticated[\s\S]*with\s+check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i, "Missing insert-own RLS policy."]
];

const forbiddenPatterns = [
  [/password_hash|plain_?password|access_token|refresh_token|cookie/i, "Migration must not store passwords, tokens, or cookies."],
  [/create\s+policy[\s\S]*\bto\s+anon\b/i, "Picture auth policies must not grant anon access."],
  [/disable\s+row\s+level\s+security/i, "Picture auth migration must not disable RLS."]
];

const errors = [];

for (const snippet of requiredSnippets) {
  if (!lowerSql.includes(snippet.toLowerCase())) {
    errors.push(`Missing required SQL snippet: ${snippet}`);
  }
}

for (const [pattern, message] of requiredPatterns) {
  if (!pattern.test(sqlWithoutComments)) errors.push(message);
}

for (const [pattern, message] of forbiddenPatterns) {
  if (pattern.test(sqlWithoutComments)) errors.push(message);
}

if (errors.length) {
  console.error("Picture auth/history migration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Picture auth/history migration check passed.");
