import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const plan = args.get("plan") ?? "weekly_free";
const maxRedemptions = Number(args.get("max-redemptions") ?? 1);
const expiresAt = args.get("expires-at") ?? "";
const inputFile = args.get("file") ?? "";

if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
  throw new Error("--max-redemptions must be a positive integer.");
}

const input = inputFile ? readFileSync(inputFile, "utf8") : readFileSync(0, "utf8");
const codes = [...new Set(input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];

if (!codes.length) {
  throw new Error("No license codes found. Pipe newline-separated codes via stdin or pass --file=<local-untracked-file>.");
}

const hashCode = (code) => crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

console.log("-- Insert hashed Image2 license codes. Plaintext codes are intentionally omitted.");
console.log("-- Review before running in Supabase SQL Editor.");
console.log("insert into public.license_codes (code_hash, plan, max_redemptions, expires_at)");
console.log("values");
console.log(
  codes
    .map((code, index) => {
      const tail = index === codes.length - 1 ? "" : ",";
      const expiresValue = expiresAt ? `${quote(expiresAt)}::timestamptz` : "null";
      return `  (${quote(hashCode(code))}, ${quote(plan)}, ${maxRedemptions}, ${expiresValue})${tail}`;
    })
    .join("\n")
);
console.log("on conflict (code_hash) do nothing;");
