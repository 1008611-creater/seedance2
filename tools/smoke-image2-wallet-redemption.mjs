import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
      process.env[key] ||= value;
    }
  } catch {
    // Optional in CI where env vars are injected directly.
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.IMAGE2_SMOKE_BASE_URL ?? "http://127.0.0.1:3020";

if (!supabaseUrl || !anonKey || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const publicClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

const marker = Date.now();
const email = `image2-wallet-smoke-${marker}@example.com`;
const password = `Smoke-${crypto.randomBytes(8).toString("hex")}-A1`;
const code = `SMOKE-WALLET-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
let userId = null;
let licenseId = null;

async function cleanup() {
  if (userId) {
    await service.from("image2_wallet_redemptions").delete().eq("user_id", userId);
    await service.from("image2_wallet_transactions").delete().eq("user_id", userId);
    await service.from("image2_wallets").delete().eq("user_id", userId);
    await service.from("license_redemptions").delete().eq("user_id", userId);
  }
  if (licenseId) {
    await service.from("license_codes").delete().eq("id", licenseId);
  } else {
    await service.from("license_codes").delete().eq("code_hash", hashCode(code));
  }
  if (userId) {
    await service.auth.admin.deleteUser(userId);
  }
}

try {
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  const inserted = await service
    .from("license_codes")
    .insert({
      code_hash: hashCode(code),
      plan: "image2_credits_10",
      max_redemptions: 1,
      metadata: { batchId: "smoke", credits: 10, priceCny: "0" }
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  licenseId = inserted.data.id;

  const signedIn = await publicClient.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const accessToken = signedIn.data.session?.access_token;
  if (!accessToken) throw new Error("Smoke user did not receive an access token.");

  const redeem = await fetch(`${baseUrl}/api/image2/redeem`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ code })
  });
  const redeemPayload = await redeem.json().catch(() => ({}));
  if (!redeem.ok) throw new Error(`Redeem failed ${redeem.status}: ${JSON.stringify(redeemPayload)}`);

  const balance = await fetch(`${baseUrl}/api/image2/balance`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const balancePayload = await balance.json().catch(() => ({}));
  if (!balance.ok) throw new Error(`Balance read failed ${balance.status}: ${JSON.stringify(balancePayload)}`);

  const walletBalance = Number(balancePayload?.wallet?.balance ?? -1);
  if (walletBalance < 10) {
    throw new Error(`Expected wallet balance >= 10, received ${walletBalance}.`);
  }

  console.log(JSON.stringify({ ok: true, redeemedCredits: 10, walletBalance }, null, 2));
} finally {
  await cleanup();
}
