import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "202606040002_unified_auth_profiles.sql");
const sql = readFileSync(migrationPath, "utf8");
const sqlWithoutComments = sql
  .replace(/--.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const lowerSql = sqlWithoutComments.toLowerCase();

const requiredSnippets = [
  "create extension if not exists pgcrypto",
  "create table if not exists public.user_profiles",
  "user_id uuid primary key references auth.users(id) on delete cascade",
  "email text",
  "phone text",
  "last_login_at timestamptz",
  "login_count integer not null default 0",
  "create table if not exists public.auth_events",
  "event_type text not null check",
  "identifier_hash text",
  "ip_hash text",
  "user_agent text",
  "alter table public.user_profiles enable row level security",
  "alter table public.auth_events enable row level security",
  "create policy user_profiles_select_own",
  "create policy user_profiles_insert_own",
  "create policy user_profiles_update_own",
  "create policy auth_events_select_own",
  "comment on table public.user_profiles",
  "comment on table public.auth_events"
];

const requiredPatterns = [
  [/jsonb_typeof\(metadata\)\s*=\s*'object'/i, "Missing metadata object shape check."],
  [/for\s+select\s+to\s+authenticated[\s\S]*using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i, "Missing select-own RLS policy."],
  [/for\s+insert\s+to\s+authenticated[\s\S]*with\s+check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i, "Missing insert-own RLS policy."],
  [/for\s+update\s+to\s+authenticated[\s\S]*using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)[\s\S]*with\s+check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i, "Missing update-own RLS policy."]
];

const forbiddenPatterns = [
  [/otp_code|verification_code|plain_?code|access_token|refresh_token|cookie/i, "Migration must not store OTP codes, tokens, or cookies."],
  [/create\s+policy[\s\S]*\bto\s+anon\b/i, "Unified auth policies must not grant anon access."],
  [/disable\s+row\s+level\s+security/i, "Unified auth migration must not disable RLS."],
  [/ip_address|request_ip/i, "Auth events must store IP hash, not plaintext IP address."]
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
  console.error("Unified auth migration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Unified auth migration check passed for user_profiles and auth_events.");
