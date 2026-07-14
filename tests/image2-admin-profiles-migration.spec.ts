import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const migrationPath = "supabase/migrations/202607150002_image2_admin_profiles_minimal.sql";

test("minimal admin profile migration is fail-closed and blocks browser role mutation", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

  expect(sql).toContain("references auth.users(id) on delete cascade");
  expect(sql).toContain("constraint profiles_role_check check (role in ('user', 'admin'))");
  expect(sql).toContain("alter table public.profiles enable row level security");
  expect(sql).toContain("using (id = (select auth.uid()))");
  expect(sql).toContain("revoke all on table public.profiles from public, anon, authenticated");
  expect(sql).toContain("grant update (display_name) on table public.profiles to authenticated");
  expect(sql).not.toContain("grant update (role)");
  expect(sql).not.toContain("grant all on table public.profiles to authenticated");
  expect(sql).toContain("email_confirmed_at is not null");
  expect(sql).toContain("into strict owner_user_id");
  expect(sql).toContain("if admin_count <> 1");
  expect(sql).toContain("set search_path = pg_catalog, public");
});

test("minimal migration does not pull in unrelated account or wallet tables", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

  for (const unrelatedTable of [
    "image2_asset_snapshots",
    "image2_prompt_variants",
    "license_codes",
    "entitlements",
    "daily_usage",
    "generations",
    "image2_wallets"
  ]) {
    expect(sql).not.toContain(`create table if not exists public.${unrelatedTable}`);
  }
});
