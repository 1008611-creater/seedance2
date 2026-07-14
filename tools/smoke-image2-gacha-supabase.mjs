import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const root = process.cwd();
const envFile = resolve(root, args.get("env-file") ?? ".env.local");
const keepUser = args.get("keep-user") === "true";

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
const publishableKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const secretKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const baseUrl = (args.get("base-url") ?? getEnv("IMAGE2_SMOKE_BASE_URL") ?? getEnv("APP_URL") ?? "http://127.0.0.1:3046")
  .replace(/\/+$/, "");

const required = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: secretKey
};

for (const [name, value] of Object.entries(required)) {
  if (!value) throw new Error(`Missing ${name}. Configure it in ${envFile} or process env.`);
}

const service = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 240) };
  }
}

async function requestJson(url, init, fallback) {
  const response = await fetch(url, init);
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${fallback}: HTTP ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function assertGachaStorageReady() {
  const checks = [
    ["image2_asset_snapshots", service.from("image2_asset_snapshots").select("user_id").limit(1)]
  ];

  for (const [table, query] of checks) {
    const result = await query;
    if (result.error) {
      throw new Error(
        `Missing or unreadable Supabase table ${table}. Apply supabase/migrations/202605230002_image2_asset_sync_minimal.sql before running this smoke test. ${result.error.message}`
      );
    }
  }

  const runs = await service.from("image2_gacha_runs").select("run_id").limit(1);
  const recipes = await service.from("image2_gacha_recipes").select("recipe_id").limit(1);
  const dedicatedTablesReady = !runs.error && !recipes.error;
  if (dedicatedTablesReady) {
    return "dedicated-tables";
  }

  console.log(
    `[warn] dedicated gacha tables are not reachable; using image2_asset_snapshots.gachaState fallback. ${runs.error?.message || recipes.error?.message || ""}`
  );
  return "asset-snapshot-fallback";
}

const marker = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const email = `image2-gacha-smoke-${marker}@lsb0713.online`;
const password = `Image2GachaSmoke${crypto.randomBytes(8).toString("hex")}!`;
let userId = "";
let runId = "";
let storageMode = "unknown";

async function cleanup() {
  if (userId) {
    if (storageMode === "dedicated-tables") {
      await service.from("image2_gacha_recipes").delete().eq("user_id", userId);
      await service.from("image2_gacha_runs").delete().eq("user_id", userId);
    }
    await service.from("image2_asset_snapshots").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
}

try {
  storageMode = await assertGachaStorageReady();
  console.log(`[ok] verified gacha storage mode: ${storageMode}`);

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (created.error) throw created.error;
  userId = created.data.user?.id ?? "";
  if (!userId) throw new Error("Smoke user creation did not return a user id.");
  console.log("[ok] created confirmed smoke user");

  const signedIn = await publicClient.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const accessToken = signedIn.data.session?.access_token;
  if (!accessToken) throw new Error("Smoke user did not receive an access token.");
  console.log("[ok] logged in smoke user");

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "image2-gacha-smoke/1.0"
  };

  const sourceCaseKey = `smoke-gacha-case-${marker}`;
  const assetSnapshot = {
    activeCollectionId: "smoke-gacha-collection",
    collections: [
      {
        caseKeys: [sourceCaseKey],
        createdAt: new Date().toISOString(),
        id: "smoke-gacha-collection",
        name: "抽卡烟测收藏夹",
        updatedAt: new Date().toISOString()
      }
    ],
    favoriteCaseKeys: [sourceCaseKey],
    notes: {},
    promptDrafts: {},
    promptReuseHistory: [],
    updatedAt: new Date().toISOString(),
    version: "image2-assets-v1"
  };
  const assetUpsert = await service.from("image2_asset_snapshots").upsert(
    {
      merged_from_local_at: assetSnapshot.updatedAt,
      snapshot: assetSnapshot,
      snapshot_version: assetSnapshot.version,
      updated_at: assetSnapshot.updatedAt,
      user_id: userId
    },
    { onConflict: "user_id" }
  );
  if (assetUpsert.error) throw assetUpsert.error;
  console.log("[ok] prepared favorite source snapshot");

  const createPayload = await requestJson(
    `${baseUrl}/api/image2-gacha/runs`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        mode: "single",
        params: {
          composition: "居中海报构图",
          contentDirection: "烟测：保留收藏图构图机制",
          lighting: "柔和棚拍光",
          randomStrength: 12,
          realismStrength: 70,
          referenceFit: 80,
          size: "1024x1024",
          styleStrength: 64,
          texture: "干净商业质感"
        },
        sourceCase: {
          caseCode: "SMOKE-GACHA",
          categoryLabel: "烟测",
          key: sourceCaseKey,
          promptPreview: "Smoke case prompt preview",
          promptStructure: {
            composition: "居中海报构图",
            lighting: "柔和棚拍光",
            materials: "干净商业质感",
            style: "案例库烟测风格",
            subject: "烟测主体",
            text: "无文字"
          },
          reuseProfile: {
            note: "只用于验证云端抽卡记录，不触发真实作图。"
          },
          title: "云端抽卡烟测案例",
          valueScore: 91
        },
        userGoal: "验证抽卡 run 能写入当前登录账号。"
      })
    },
    "Could not create gacha run"
  );

  runId = createPayload.run?.runId ?? "";
  const cardId = createPayload.run?.cards?.[0]?.cardId ?? "";
  if (!runId || !cardId) throw new Error("Gacha run response did not include runId and cardId.");
  console.log("[ok] created gacha run through API");

  const readStoredRun = async () => {
    if (storageMode === "dedicated-tables") {
      const stored = await service
        .from("image2_gacha_runs")
        .select("run_id,user_id,source_case_key,cards")
        .eq("run_id", runId)
        .eq("user_id", userId)
        .single();
      if (stored.error) {
        throw new Error(`Run was not found in Supabase. Is IMAGE2_GACHA_BACKEND=supabase enabled on ${baseUrl}? ${stored.error.message}`);
      }
      if (stored.data.source_case_key !== sourceCaseKey) throw new Error("Stored source_case_key did not match the smoke case.");
      return {
        cards: Array.isArray(stored.data.cards) ? stored.data.cards : createPayload.run.cards,
        run: stored.data
      };
    }

    const stored = await service
      .from("image2_asset_snapshots")
      .select("snapshot")
      .eq("user_id", userId)
      .single();
    if (stored.error) throw stored.error;
    const runs = Array.isArray(stored.data.snapshot?.gachaState?.runs) ? stored.data.snapshot.gachaState.runs : [];
    const run = runs.find((item) => item.runId === runId);
    if (!run) throw new Error("Run was not found in image2_asset_snapshots.gachaState fallback.");
    if (run.sourceCase?.key !== sourceCaseKey) throw new Error("Fallback run sourceCase.key did not match the smoke case.");
    return {
      cards: Array.isArray(run.cards) ? run.cards : createPayload.run.cards,
      run
    };
  };

  const storedRun = await readStoredRun();
  console.log("[ok] verified run is user-scoped in Supabase storage");

  const latestPayload = await requestJson(
    `${baseUrl}/api/image2-gacha/runs?latest=1&sourceCaseKey=${encodeURIComponent(sourceCaseKey)}`,
    { headers: authHeaders },
    "Could not read latest gacha run"
  );
  if (latestPayload.run?.runId !== runId) throw new Error("Latest gacha run did not match the created run.");
  console.log("[ok] read latest run through API");

  const patched = await requestJson(
    `${baseUrl}/api/image2-gacha/cards/${encodeURIComponent(cardId)}`,
    {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ favorite: true, rating: "SR" })
    },
    "Could not patch gacha card"
  );
  const patchedCard = patched.card ?? patched.run?.cards?.find?.((item) => item.cardId === cardId);
  if (!patchedCard?.favorite || patchedCard.rating !== "SR") throw new Error("Card patch did not persist favorite/rating.");
  console.log("[ok] patched card rating and favorite state");

  const cards = storedRun.cards;
  const doneCards = cards.map((card) =>
    card.cardId === cardId
      ? {
          ...card,
          favorite: true,
          image: {
            name: "smoke.png",
            path: "smoke/image2-gacha-smoke.png",
            url: "/api/image2/output/smoke/image2-gacha-smoke.png"
          },
          rarity: "SR",
          rating: "SR",
          status: "done"
        }
      : card
  );
  if (storageMode === "dedicated-tables") {
    const updateDone = await service
      .from("image2_gacha_runs")
      .update({ cards: doneCards, status: "done" })
      .eq("run_id", runId)
      .eq("user_id", userId);
    if (updateDone.error) throw updateDone.error;
  } else {
    const stored = await service
      .from("image2_asset_snapshots")
      .select("snapshot")
      .eq("user_id", userId)
      .single();
    if (stored.error) throw stored.error;
    const snapshot = stored.data.snapshot;
    const runs = Array.isArray(snapshot.gachaState?.runs) ? snapshot.gachaState.runs : [];
    const updatedAt = new Date().toISOString();
    const nextRuns = runs.map((run) => (run.runId === runId ? { ...run, cards: doneCards, status: "done", updatedAt } : run));
    const updateSnapshot = await service
      .from("image2_asset_snapshots")
      .update({
        snapshot: {
          ...snapshot,
          gachaState: {
            ...(snapshot.gachaState ?? {}),
            runs: nextRuns,
            updatedAt,
            version: 1
          },
          updatedAt
        },
        updated_at: updatedAt
      })
      .eq("user_id", userId);
    if (updateSnapshot.error) throw updateSnapshot.error;
  }

  const recipePayload = await requestJson(
    `${baseUrl}/api/image2-gacha/recipes`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ cardId, runId })
    },
    "Could not save gacha recipe"
  );
  if (!recipePayload.recipe?.recipeId) throw new Error("Recipe response did not include recipeId.");
  console.log("[ok] saved gacha recipe through API");

  if (storageMode === "asset-snapshot-fallback") {
    const stored = await service
      .from("image2_asset_snapshots")
      .select("snapshot")
      .eq("user_id", userId)
      .single();
    if (stored.error) throw stored.error;
    const recipes = Array.isArray(stored.data.snapshot?.gachaState?.recipes) ? stored.data.snapshot.gachaState.recipes : [];
    if (!recipes.some((item) => item.recipeId === recipePayload.recipe.recipeId)) {
      throw new Error("Recipe was not found in image2_asset_snapshots.gachaState fallback.");
    }
    console.log("[ok] verified recipe in fallback gachaState");
  }

  if (!keepUser) {
    await cleanup();
    console.log("[ok] cleaned up smoke user and gacha rows");
  }

  console.log(JSON.stringify({ ok: true, runId, recipeId: recipePayload.recipe.recipeId, storageMode }, null, 2));
} catch (error) {
  if (userId && !keepUser) {
    await cleanup().catch(() => {});
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
