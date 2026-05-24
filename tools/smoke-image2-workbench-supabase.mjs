import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const envFile = path.resolve(process.cwd(), args.get("env-file") ?? ".env.local");
const workspaceId = args.get("workspace-id") ?? "image2-workbench-main";
const bucket = args.get("bucket") ?? "image2-workbench-media";
const keepRows = args.get("keep-rows") === "true";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
        if (!match) return null;
        return [match[1].trim(), match[2].trim().replace(/^["']|["']$/g, "")];
      })
      .filter(Boolean)
  );
}

const fileEnv = parseEnvFile(envFile);
const getEnv = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();
const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(`Missing Supabase URL or service role key. Configure ${envFile} or process env.`);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

const id = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const objectPath = `workbench/smoke/manual/${id}.png`;
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

async function cleanup() {
  if (keepRows) return;
  await client.from("image2_workbench_feedback").delete().eq("id", `${id}-feedback`);
  await client.from("image2_workbench_assets").delete().eq("id", id);
  await client.storage.from(bucket).remove([objectPath]);
}

try {
  const bucketInfo = await client.storage.getBucket(bucket);
  if (bucketInfo.error) {
    throw new Error(`Storage bucket not ready: ${bucketInfo.error.message}`);
  }
  console.log("[ok] storage bucket exists");

  const upload = await client.storage.from(bucket).upload(objectPath, tinyPng, {
    cacheControl: "60",
    contentType: "image/png",
    upsert: true
  });
  if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);
  console.log("[ok] uploaded smoke image");

  const publicUrl = client.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
  const now = new Date().toISOString();
  const asset = await client.from("image2_workbench_assets").upsert(
    {
      id,
      workspace_id: workspaceId,
      kind: "result",
      group_label: "结果",
      title: "Smoke workbench asset",
      subtitle: "Supabase smoke",
      note: "Temporary smoke-test row.",
      source_path: publicUrl,
      preview_path: publicUrl,
      tags: ["smoke"],
      prompt_hint: "Smoke test asset.",
      origin: "generated",
      stage: "outfit",
      prompt: "Smoke test prompt.",
      storage_bucket: bucket,
      storage_object_path: objectPath,
      mime_type: "image/png",
      metadata: { smoke: true },
      created_at: now,
      updated_at: now
    },
    { onConflict: "id" }
  );
  if (asset.error) throw new Error(`Asset upsert failed: ${asset.error.message}`);
  console.log("[ok] upserted smoke asset");

  const feedback = await client.from("image2_workbench_feedback").insert({
    id: `${id}-feedback`,
    workspace_id: workspaceId,
    asset_id: id,
    stage: "outfit",
    rating: "usable",
    reasons: ["其他"],
    note: "Smoke feedback.",
    prompt: "Smoke test prompt.",
    reference_ids: [id],
    metadata: { smoke: true },
    created_at: now
  });
  if (feedback.error) throw new Error(`Feedback insert failed: ${feedback.error.message}`);
  console.log("[ok] inserted smoke feedback");

  const readBack = await client
    .from("image2_workbench_assets")
    .select("id,preview_path")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  if (readBack.error) throw new Error(`Asset readback failed: ${readBack.error.message}`);
  if (readBack.data?.preview_path !== publicUrl) throw new Error("Asset readback public URL mismatch.");
  console.log("[ok] read back smoke asset");

  await cleanup();
  console.log("[ok] cleaned up smoke rows");
  console.log("Image2 workbench Supabase smoke passed.");
} catch (error) {
  await cleanup().catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
