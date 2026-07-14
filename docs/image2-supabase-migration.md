# Image2 Supabase Migration

## Purpose

This package prepares `/image2-cases` for real account-backed sync without breaking the current local-first workflow. The current `/api/image2/assets` route can keep using the local JSON store while Supabase Auth, Postgres, and Vercel environment variables are configured.

## Files

- `supabase/migrations/202605230001_image2_accounts_assets.sql`
  - Creates account profiles, Image2 asset snapshots, asset events, Prompt Workbench variants, license codes, redemption audit, entitlements, usage counters, and generation jobs.
- `supabase/migrations/202605230003_image2_license_redemption_minimal.sql`
  - Minimal license-code membership slice for the live Image2 site: license code hashes, redemption audit, entitlements, and an optional `redeem_license_code` RPC. Use this when the full migration is too large for a first rollout.
- `supabase/migrations/202605240001_image2_license_rpc_refresh.sql`
  - Optional RPC refresh patch for projects where the tables exist but PostgREST has not picked up `redeem_license_code`. The production API no longer depends on this RPC.
- `supabase/migrations/202605250001_image2_workbench_supabase.sql`
  - Adds the shared Image2 workbench library: `image2_workbench_assets`, `image2_workbench_feedback`, and the public `image2-workbench-media` Storage bucket.
- `supabase/migrations/202606030001_image2_gacha_runs.sql`
  - Adds account-backed Image2 case-library gacha runs and reusable style recipes: `image2_gacha_runs` and `image2_gacha_recipes`.
- `tools/check-supabase-migration.mjs`
  - Static guard that checks required tables, RLS enablement, hashed-code boundaries, and the redeem RPC.
- `tools/check-image2-license-migration.mjs`
  - Static guard for the minimal Image2 license redemption migration.
- `tools/check-image2-workbench-migration.mjs`
  - Static guard for the shared workbench migration.
- `tools/check-image2-gacha-migration.mjs`
  - Static guard for the account-backed Image2 gacha migration, including RLS and user-owned row boundaries.
- `tools/migrate-image2-workbench-to-supabase.mjs`
  - Uploads the local action-transfer material matrix, generated results, and feedback JSON into the shared Supabase workbench tables.
- `tools/smoke-image2-workbench-supabase.mjs`
  - Live smoke test for the shared workbench bucket/tables. It writes a tiny temporary image, asset row, and feedback row, reads them back, then cleans them up.
- `tools/generate-image2-license-batch.mjs`
  - Generates a local plaintext card batch and a matching Supabase insert SQL file containing only `code_hash` values.
- `tools/generate-image2-balance-packs.mjs`
  - Generates the Chain Xiaowu/链动小屋 manual listing package for 10 / 50 / 100 Image2 balance cards, plus hashed Supabase insert SQL.
- `tools/check-image2-wallet-migration.mjs`
  - Static guard for the Image2 wallet balance tables, wallet transactions, card-code credit RPC, and service-role-only write boundary.
- `tools/smoke-image2-license-redemption.mjs`
  - Creates a temporary confirmed user and hashed license code, verifies `/api/image2/redeem`, verifies duplicate redemption rejection, then cleans test data.
- `tools/smoke-image2-wallet-redemption.mjs`
  - Creates a temporary confirmed user and a temporary 10-image balance card, verifies `/api/image2/redeem` credits the wallet, verifies `/api/image2/balance`, then cleans test data.
- `tools/smoke-image2-gacha-supabase.mjs`
  - Creates a temporary confirmed user, verifies `/api/image2-gacha/runs`, card rating, and recipe saving, then cleans test data. It prefers dedicated Supabase gacha tables and falls back to `image2_asset_snapshots.snapshot.gachaState` while the formal gacha migration is pending. It does not trigger real image generation.
- `tools/health-image2-gacha.mjs`
  - Admin-token health check for the deployed gacha backend. It verifies Vercel env flags and Supabase table readiness before a real user hits the draw flow.
- `.env.example`
  - Adds Supabase placeholders and `IMAGE2_ASSET_SYNC_BACKEND`.

## Data Boundary

- Static Image2 case content stays in build-time generated files under `public/data` and detail JSON.
- User dynamic data moves to Supabase after login:
  - favorites
  - collections/project folders
  - case notes
  - Prompt Workbench drafts and variants
  - recent prompt reuse events
  - case-library gacha runs and saved recipes
- The first cloud-sync table is `image2_asset_snapshots`, which stores the current `image2-assets-v1` JSON contract. This keeps the existing local merge logic reusable.
- `image2_asset_events` and `image2_prompt_variants` provide normalized hooks for analytics and future higher-value Workbench features.
- The team Image2 workbench is a separate shared workspace, not a per-user favorite store:
  - `image2_workbench_assets` stores人物、服装、场景、动作、结果图。
  - `image2_workbench_feedback` stores the post-generation ratings and reason tags.
  - `image2-workbench-media` stores the actual uploaded/generated images with public read URLs.
  - Server routes use `SUPABASE_SERVICE_ROLE_KEY`; browser clients only receive public image URLs and API JSON.

## Auth And RLS

- `profiles.id` references `auth.users(id)`.
- `handle_new_user()` creates a profile when Supabase Auth creates a user.
- Users can read/write their own Image2 asset snapshot and prompt variants.
- Users can read their own entitlements, usage, redemption audit, and generation jobs.
- `license_codes` has no ordinary user read policy. Admin/service flows manage card creation and disablement.
- Ordinary users cannot promote themselves to `admin`; profile updates that affect role should stay behind server/admin code.
- `/image2-cases` now includes a lightweight email/password Auth REST client. It only uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the browser. In the newer Supabase dashboard, this public browser key is labeled as the publishable key.
- `/api/image2/assets` switches to Supabase only when `IMAGE2_ASSET_SYNC_BACKEND=supabase`. In that mode it validates the browser Bearer token through Supabase Auth and uses the server-only secret/service role key to upsert `image2_asset_snapshots`.
- `/api/image2-gacha/*` switches to Supabase only when `IMAGE2_GACHA_BACKEND=supabase`. In that mode it validates the browser Bearer token through Supabase Auth and stores only that user's runs, card ratings, favorites, and saved recipes.
- `/auth/callback` handles Supabase email verification and password recovery links. The page stores the verified browser session in the same `image2-account-session:v1` localStorage contract used by `/image2-cases`.

## License Redemption

- Card plaintext must never be stored.
- `/api/image2/redeem` normalizes and hashes the submitted card on the server, then uses the server-only Supabase service key to read `license_codes`, update redemption state, record audit in `license_redemptions`, and create an `entitlements` row on success. This avoids exposing card tables to the browser and keeps plaintext cards out of the database.
- `redeem_license_code` is still included as an optional database-side RPC for future hardening, but the live route does not require it because Supabase SQL Editor can incorrectly inject RLS statements into PL/pgSQL function bodies when using the dashboard helper.
- Supported card states are `active`, `used`, `expired`, and `disabled`.
- `/api/image2/entitlements` reads the current authenticated user's entitlement rows and returns the active one for the `/image2-cases` membership panel.
- The first Image2 membership rollout uses `weekly_free`: 7 days, 2 daily uses, 720p, 15 seconds. Advanced flags are present for later Prompt Workbench/export/member-case gating.
- The current paid rollout adds Image2 account balance cards: 10 images for ¥2.99, 50 images for ¥12.99, and 100 images for ¥24.99. The UI keeps two free images first, then spends one paid balance per successful generation. Failed generations refund the reserved balance.
- Old `weekly_free` cards remain supported by `/api/image2/redeem` as a legacy path, but the primary UI now presents image balance instead of weekly membership.

## Vercel Environment Variables

Set real values only in Vercel or local `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY= # sb_publishable_... or legacy anon JWT
SUPABASE_SERVICE_ROLE_KEY=     # sb_secret_... or legacy service_role JWT

# Production defaults to role-bound Supabase admin sessions. Only enable this
# temporarily for an audited break-glass operation; keep it empty normally.
IMAGE2_ENABLE_ADMIN_TOKEN_BREAK_GLASS=
IMAGE2_ASSET_SYNC_BACKEND=supabase
IMAGE2_GACHA_BACKEND=supabase
IMAGE2_GACHA_PACK_DRAW_COUNT=2
IMAGE2_WORKBENCH_STORAGE_BACKEND=supabase
DAIHUO_OUTPUT_ROOT=D:/codex-work/daihuo/output
```

Keep `IMAGE2_ASSET_SYNC_BACKEND=local` until the Supabase project has the migration applied and the auth UI/API routes are wired.
Keep `IMAGE2_GACHA_BACKEND=local` until `202606030001_image2_gacha_runs.sql` is applied and the gacha smoke test passes.
Keep `IMAGE2_WORKBENCH_STORAGE_BACKEND=local` until `202605250001_image2_workbench_supabase.sql` is applied and the local material library has been migrated.

## Supabase Auth URL Settings

In Supabase Dashboard, add these Redirect URLs before asking real users to verify email or reset passwords:

```text
https://image2.lsb0713.online/auth/callback
http://localhost:3012/auth/callback
```

If a different preview domain is used, add its `/auth/callback` URL as well. Supabase's built-in email provider is rate-limited, so password reset and signup confirmation tests should be sparse; automated tests mock `/auth/v1/recover` and do not send real emails.

## Migration Order

1. Create a Supabase project and enable email/password Auth.
2. Apply `supabase/migrations/202605230001_image2_accounts_assets.sql`.
3. Put the Supabase URL, anon key, and service role key into Vercel environment variables.

## Security Advisor hardening (2026-07-15)

Apply `supabase/migrations/202607150001_image2_security_advisor_hardening.sql`
only after reviewing it in the Supabase SQL editor. It is an idempotent
privilege/search-path migration and does not update or delete user, wallet,
entitlement, redemption, case, or generation rows.

The migration:

- fixes the explicit `search_path` for the five helper functions reported by
  Supabase Security Advisor;
- revokes `PUBLIC`, `anon`, and `authenticated` execution of
  `image2_apply_wallet_delta` and `image2_redeem_balance_code`;
- grants those two wallet-mutation RPCs only to `service_role`;
- asks PostgREST to reload its schema cache.

After applying it, rerun Supabase Security Advisor. The two wallet functions
must no longer be reported as executable by public or signed-in clients.

Admin APIs now accept a verified Supabase bearer session only when
`profiles.role = 'admin'`. The shared `ADMIN_TOKEN` path remains available in
local development, but production requires the explicit
`IMAGE2_ENABLE_ADMIN_TOKEN_BREAK_GLASS=1` switch. Do not enable that switch for
normal operation.
4. Set `IMAGE2_ASSET_SYNC_BACKEND=supabase` after the migration is applied.
5. Test `/image2-cases` login, `同步到云端`, and `从云端合并` with a test account.
6. Verify password reset and email verification callback pages with allowed Redirect URLs.
7. Replace the current local card redeem route with the hashed-card Supabase table flow. The RPC can be added later as a database-side hardening pass.

## Workbench Shared Library Migration

Apply the shared workbench migration in Supabase SQL Editor:

```powershell
npm run check:image2-workbench-migration
```

Then run `supabase/migrations/202605250001_image2_workbench_supabase.sql` in Supabase SQL Editor.

After the SQL is applied, verify the live bucket and tables:

```powershell
npm run smoke:image2-workbench
```

Preview what will be migrated from the local素材母版:

```powershell
npm run migrate:image2-workbench-supabase -- --dry-run=true
```

Upload the local matrix assets, generated result library, and feedback records:

```powershell
npm run migrate:image2-workbench-supabase
```

After the script succeeds, set this in Vercel and local `.env.local` when you want the website to use the shared cloud workbench:

```text
IMAGE2_WORKBENCH_STORAGE_BACKEND=supabase
```

The workbench route still falls back to local files or built-in cloud seed images if Supabase is not ready, so deployment can remain live while the database is being prepared.

## Gacha Run Migration

Apply the Image2 case-library gacha migration before enabling production gacha writes. First run the static guard:

```powershell
npm run check:image2-gacha-migration
```

Preferred path when PostgreSQL client tools are available:

```powershell
$env:SUPABASE_DB_URL="postgresql://..."
npm run migrate:image2-gacha-supabase -- --dry-run=true
npm run migrate:image2-gacha-supabase
```

The migration script reads `.env.local` by default and also accepts an explicit env file:

```powershell
npm run migrate:image2-gacha-supabase -- --env-file=deploy/image2/production.env --dry-run=true
npm run migrate:image2-gacha-supabase -- --env-file=deploy/image2/production.env
```

If `SUPABASE_DB_URL` or `psql` is not available on the machine, run `supabase/migrations/202606030001_image2_gacha_runs.sql` directly in Supabase SQL Editor.

Current production can run in a temporary fallback mode when `image2_asset_snapshots` is ready but `image2_gacha_runs` / `image2_gacha_recipes` are missing. In that mode:

- user source images are still restricted to the account's favorites/collections;
- runs, card ratings, favorites, and recipes are stored in `image2_asset_snapshots.snapshot.gachaState`;
- `npm run health:image2-gacha` prints `storage: asset-snapshot-fallback`;
- `npm run smoke:image2-gacha` can pass without spending image quota;
- this is acceptable for light testing, but it is not the final database shape for large-scale production.

The formal completion condition is:

```text
npm run health:image2-gacha
# expected mode after migration:
# [mode] storage: dedicated-gacha-tables
```

Before spending time on a full smoke test, run the admin-only health check. It does not create users and does not draw images:

```powershell
$env:IMAGE2_SMOKE_BASE_URL="https://image2.lsb0713.online"
npm run health:image2-gacha
```

The health check requires `ADMIN_TOKEN` locally or `--admin-token=...`. It checks Supabase keys, `IMAGE2_ASSET_SYNC_BACKEND`, `IMAGE2_GACHA_BACKEND`, pack draw count, `image2_asset_snapshots`, `image2_gacha_runs`, `image2_gacha_recipes`, `image2_wallets`, and `image2_wallet_transactions`. It also prints the current storage mode:

- `dedicated-gacha-tables`: formal gacha tables are ready.
- `asset-snapshot-fallback`: the live flow can be tested through account asset snapshots, but the formal gacha migration still needs to be applied.
- `unavailable`: critical backend dependencies are missing.

After the SQL is applied and the deployed app has `IMAGE2_GACHA_BACKEND=supabase`, verify the cloud-backed gacha API without spending image quota:

```powershell
$env:IMAGE2_SMOKE_BASE_URL="https://image2.lsb0713.online"
npm run smoke:image2-gacha
```

The smoke test creates a temporary confirmed Supabase Auth user, creates one gacha run through `/api/image2-gacha/runs`, verifies the record belongs to that user, patches a card rating/favorite state, marks the smoke card done directly in storage, saves a recipe through `/api/image2-gacha/recipes`, and deletes the temporary user and gacha rows. In `dedicated-gacha-tables` mode it verifies `image2_gacha_runs` / `image2_gacha_recipes`; in `asset-snapshot-fallback` mode it verifies `image2_asset_snapshots.snapshot.gachaState`. It does not call `/draw`, so it does not consume free quota or paid balance.

Current production expectation for the test stage:

```text
IMAGE2_GACHA_BACKEND=supabase
IMAGE2_GACHA_PACK_DRAW_COUNT=2
```

This keeps 九抽 as 9 visible card slots while only drawing 2 real images until the flow is stable.

For the smaller live membership slice, apply this after `202605230002_image2_asset_sync_minimal.sql`:

```powershell
npm run check:image2-license-migration
```

Then run `supabase/migrations/202605230003_image2_license_redemption_minimal.sql` in the Supabase SQL editor. Insert real card codes by hashing them first with `sha256(trim().toUpperCase())`; do not paste plaintext card codes into SQL tables or committed files.

To generate a fresh batch of cards plus insert SQL without exposing plaintext codes to the database, run:

```powershell
npm run generate:image2-license-codes -- --count=20 --prefix=IMAGE2-WEEK --max-redemptions=1 --expires-at=2026-12-31T15:59:59Z
```

This writes `.license-codes.local.txt` for the plaintext cards you distribute and `.license-codes.local.sql` for Supabase. Run only the SQL file in Supabase SQL Editor.

If you already have a plaintext card list, put local card codes in an untracked file such as `.license-codes.local.txt`, then run:

```powershell
node .\tools\hash-image2-license-codes.mjs --file=.license-codes.local.txt --max-redemptions=1 --expires-at=2026-12-31T15:59:59Z
```

The script prints SQL with `code_hash` values only. Review that SQL, then run it in Supabase SQL Editor after the minimal migration has been applied. The `.license-codes*.txt` and `.license-codes*.sql` patterns are git-ignored so operational batches stay local.

## Verification

Run:

```powershell
npm run check:supabase-migration
npm run check:image2-license-migration
npm run check:image2-wallet-migration
npm run check:image2-workbench-migration
npm run check:image2-gacha-migration
npm run typecheck
npm run build
$env:IMAGE2_SMOKE_BASE_URL="https://image2.lsb0713.online"
npm run health:image2-gacha
```

This static verification does not apply migrations to a live Supabase project. A real project smoke test is still required before switching `IMAGE2_ASSET_SYNC_BACKEND` or `IMAGE2_GACHA_BACKEND` to `supabase`.

After the live Supabase project and Vercel environment variables are configured, run the account-backed asset smoke test:

```powershell
$env:IMAGE2_SMOKE_BASE_URL="https://image2.lsb0713.online"
npm run smoke:image2-supabase
npm run smoke:image2-license
npm run smoke:image2-gacha
```

The smoke test creates a temporary confirmed Supabase Auth user, logs in, uploads an `image2-assets-v1` snapshot, reads it back through `/api/image2/assets`, verifies the API ignores spoofed `userId` values, and deletes the temporary user. It does not print API keys, access tokens, or the generated password.

The license smoke test creates a temporary confirmed Supabase Auth user, inserts a temporary hashed license code, redeems it through `/api/image2/redeem`, verifies duplicate redemption is rejected, and cleans the temporary user and license row.

After applying `202605260001_image2_wallet_balance.sql`, verify the wallet-backed balance flow:

```powershell
$env:IMAGE2_SMOKE_BASE_URL="http://127.0.0.1:3020"
npm run smoke:image2-wallet
```

The wallet smoke test uses a temporary 10-image card, confirms the account balance increases, and deletes the temporary user, wallet rows, and license row.
