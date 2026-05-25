import crypto from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);

const root = resolve(process.cwd(), String(args.get("out-dir") ?? "artifacts/liandong-image2-card-packs"));
const batchId = String(args.get("batch") ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 13));
const expiresAt = String(args.get("expires-at") ?? "");
const packs = [
  { count: Number(args.get("count10") ?? 20), credits: 10, plan: "image2_credits_10", prefix: "IMG2-10", price: "2.99" },
  { count: Number(args.get("count50") ?? 10), credits: 50, plan: "image2_credits_50", prefix: "IMG2-50", price: "12.99" },
  { count: Number(args.get("count100") ?? 10), credits: 100, plan: "image2_credits_100", prefix: "IMG2-100", price: "24.99" }
];

for (const pack of packs) {
  if (!Number.isInteger(pack.count) || pack.count < 0 || pack.count > 1000) {
    throw new Error(`Invalid count for ${pack.plan}. Use 0-1000.`);
  }
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

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const batchDir = join(root, batchId);
mkdirSync(batchDir, { recursive: true });

const rows = [];
for (const pack of packs) {
  const codes = new Set();
  while (codes.size < pack.count) {
    codes.add(`${pack.prefix}-${randomChunk()}-${randomChunk()}`);
  }

  for (const code of [...codes].sort()) {
    rows.push({ ...pack, code });
  }
}

const csvText = [
  ["package", "credits", "price_cny", "plan", "code"].map(csv).join(","),
  ...rows.map((row) => [row.credits, row.credits, row.price, row.plan, row.code].map(csv).join(","))
].join("\n");

const expiresValue = expiresAt ? `${quote(expiresAt)}::timestamptz` : "null";
const sqlValues = rows
  .map((row, index) => {
    const metadata = JSON.stringify({
      batchId,
      channel: "liandong-xiaowu",
      credits: row.credits,
      priceCny: row.price
    });
    const tail = index === rows.length - 1 ? "" : ",";
    return `  (${quote(hashCode(row.code))}, ${quote(row.plan)}, 1, ${expiresValue}, ${quote(metadata)}::jsonb)${tail}`;
  })
  .join("\n");

const sqlText = [
  "-- Image2 balance-pack card codes. Plaintext codes are intentionally omitted.",
  "-- Run this SQL in Supabase after applying supabase/migrations/202605260001_image2_wallet_balance.sql.",
  "insert into public.license_codes (code_hash, plan, max_redemptions, expires_at, metadata)",
  "values",
  sqlValues || "  -- no codes generated",
  rows.length ? "on conflict (code_hash) do nothing;" : "",
  ""
].join("\n");

const listingText = `# Image2 额度包链动小屋上架包

批次：${batchId}

## 商品档位

| 档位 | 售价 | 交付 |
| --- | ---: | --- |
| Image2 10 张图额度包 | ¥2.99 | 1 个卡密，兑换后到账 10 张 |
| Image2 50 张图额度包 | ¥12.99 | 1 个卡密，兑换后到账 50 张 |
| Image2 100 张图额度包 | ¥24.99 | 1 个卡密，兑换后到账 100 张 |

## 标题

- Image2 生图额度 10 张｜案例库同款图生成卡密
- Image2 生图额度 50 张｜适合批量拆案例和出首帧
- Image2 生图额度 100 张｜团队批量作图额度包

## 卖点

- 登录 Image2 案例库后输入卡密，图片余额实时到账。
- 每个访问环境默认有 2 张免费体验图，免费用完后自动扣账户余额。
- 适合拆解爆款图、复刻提示词、生成商品图和视频首帧参考图。
- 卡密一经兑换即绑定当前账号，请先确认登录邮箱。

## 兑换说明

1. 打开 image2.lsb0713.online/image2-cases。
2. 点击登录，使用邮箱账号登录或注册。
3. 在图片余额区域输入卡密并点击兑换。
4. 余额到账后继续点击生成同款；免费额度优先消耗，免费用完后扣图片余额。

## 交付文件

- plaintext-codes.csv：给链动小屋逐单发货使用，包含明文卡密。
- supabase-insert.sql：给 Supabase 入库使用，只包含哈希，不包含明文卡密。
`;

writeFileSync(join(batchDir, "plaintext-codes.csv"), `${csvText}\n`, "utf8");
writeFileSync(join(batchDir, "supabase-insert.sql"), sqlText, "utf8");
writeFileSync(join(batchDir, "listing.md"), listingText, "utf8");

console.log(`Generated ${rows.length} Image2 balance-pack codes in ${batchDir}`);
