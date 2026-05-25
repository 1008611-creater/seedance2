import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(process.cwd(), "supabase", "migrations", "202605260001_image2_wallet_balance.sql");
const sql = readFileSync(migrationPath, "utf8");

const requiredTables = ["image2_wallets", "image2_wallet_transactions", "image2_wallet_redemptions"];
const requiredSnippets = [
  "create or replace function public.image2_credit_amount_for_plan",
  "create or replace function public.image2_apply_wallet_delta",
  "create or replace function public.image2_redeem_balance_code",
  "when 'image2_credits_10' then 10",
  "when 'image2_credits_50' then 50",
  "when 'image2_credits_100' then 100",
  "grant execute on function public.image2_apply_wallet_delta(uuid, integer, text, text, uuid, jsonb) to service_role",
  "grant execute on function public.image2_redeem_balance_code(uuid, text, text, text) to service_role",
  "unique (license_code_id, user_id)"
];

const errors = [];

for (const table of requiredTables) {
  const createTable = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i");
  const enableRls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
  const ownPolicy = new RegExp(`create\\s+policy\\s+${table}_select_own\\b`, "i");

  if (!createTable.test(sql)) errors.push(`Missing table: ${table}`);
  if (!enableRls.test(sql)) errors.push(`Missing RLS enablement: ${table}`);
  if (!ownPolicy.test(sql)) errors.push(`Missing select-own RLS policy: ${table}`);
}

for (const snippet of requiredSnippets) {
  if (!sql.includes(snippet)) errors.push(`Missing required SQL snippet: ${snippet}`);
}

const forbiddenPatterns = [
  /plain(?:text)?_?code/i,
  /image2_wallets[\s\S]*create\s+policy[\s\S]*for\s+(insert|update|delete)\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.image2_apply_wallet_delta\(uuid,\s*integer,\s*text,\s*text,\s*uuid,\s*jsonb\)\s+to\s+authenticated/i,
  /grant\s+execute\s+on\s+function\s+public\.image2_redeem_balance_code\(uuid,\s*text,\s*text,\s*text\)\s+to\s+authenticated/i
];

for (const pattern of forbiddenPatterns) {
  if (pattern.test(sql)) errors.push(`Forbidden wallet migration pattern found: ${pattern}`);
}

if (errors.length) {
  console.error("Image2 wallet migration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Image2 wallet migration check passed for ${requiredTables.length} tables.`);
