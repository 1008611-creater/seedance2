import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "202605250001_image2_workbench_supabase.sql");
const sql = readFileSync(migrationPath, "utf8");

const requiredSnippets = [
  "image2-workbench-media",
  "create table if not exists public.image2_workbench_assets",
  "create table if not exists public.image2_workbench_feedback",
  "kind in ('person', 'clothing', 'scene', 'motion', 'result')",
  "rating in ('usable', 'needs-fix', 'reject')",
  "alter table public.image2_workbench_assets enable row level security",
  "alter table public.image2_workbench_feedback enable row level security",
  "on storage.objects",
  "workspace_id",
  "storage_object_path"
];

const missing = requiredSnippets.filter((snippet) => !sql.includes(snippet));

if (missing.length) {
  console.error("Image2 workbench Supabase migration is missing expected SQL:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Image2 workbench Supabase migration static check passed.");
