import crypto from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const count = Number(args.get("count") ?? 10);
const prefix = String(args.get("prefix") ?? "IMAGE2-WEEK").trim().toUpperCase();
const plan = args.get("plan") ?? "weekly_free";
const maxRedemptions = Number(args.get("max-redemptions") ?? 1);
const expiresAt = args.get("expires-at") ?? "";
const outPath = resolve(process.cwd(), args.get("out") ?? ".license-codes.local.txt");
const sqlPath = resolve(process.cwd(), args.get("sql-out") ?? ".license-codes.local.sql");

if (!Number.isInteger(count) || count < 1 || count > 1000) {
  throw new Error("--count must be an integer between 1 and 1000.");
}

if (!/^[A-Z0-9][A-Z0-9-]{1,40}$/.test(prefix)) {
  throw new Error("--prefix must use only A-Z, 0-9, and hyphens, and be 2-41 characters long.");
}

if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
  throw new Error("--max-redemptions must be a positive integer.");
}

function randomChunk() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ensureParent(filePath) {
  const parent = dirname(filePath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}

const codes = new Set();
while (codes.size < count) {
  codes.add(`${prefix}-${randomChunk()}-${randomChunk()}`);
}

const sortedCodes = [...codes].sort();
const expiresValue = expiresAt ? `${quote(expiresAt)}::timestamptz` : "null";
const sql = [
  "-- Insert hashed Image2 license codes. Plaintext codes are intentionally omitted.",
  "-- Keep the matching plaintext .txt file local and do not commit it.",
  "insert into public.license_codes (code_hash, plan, max_redemptions, expires_at)",
  "values",
  sortedCodes
    .map((code, index) => {
      const tail = index === sortedCodes.length - 1 ? "" : ",";
      return `  (${quote(hashCode(code))}, ${quote(plan)}, ${maxRedemptions}, ${expiresValue})${tail}`;
    })
    .join("\n"),
  "on conflict (code_hash) do nothing;",
  ""
].join("\n");

ensureParent(outPath);
ensureParent(sqlPath);
writeFileSync(outPath, `${sortedCodes.join("\n")}\n`, "utf8");
writeFileSync(sqlPath, sql, "utf8");

console.log(`Generated ${sortedCodes.length} Image2 license codes.`);
console.log(`Plaintext codes: ${outPath}`);
console.log(`Hashed insert SQL: ${sqlPath}`);
console.log("Do not paste plaintext codes into Supabase tables. Run only the generated SQL file.");
