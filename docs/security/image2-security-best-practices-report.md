# Image2 / Seedance2 Security Best-Practices Report

- **Audit date:** 2026-07-14
- **Repository:** `D:\codex-work\seedance2`
- **Scope:** Next.js runtime, API routes, auth/session handling, Supabase adapters and migrations, provider integrations, Docker/Vercel configuration, and browser-facing security controls.
**Out of scope:** Live Vercel configuration, external WAF/reverse proxy, production Supabase data/RLS verification, provider accounts, and secret values.

## Executive summary

The repository combines a public case library with legacy Seedance flows, Image2 generation, membership/wallet state, Picture Studio, internal automation, and a static-token admin surface. The highest risks are broken server-side authorization on legacy APIs, unauthenticated provider and automation handlers, a client-controlled host-based quota bypass, and a known-vulnerable Next.js version. These issues can enable cross-user state manipulation, provider-credit abuse, job/wallet integrity loss, or exposure of a local automation host when the corresponding routes are publicly reachable.

The report uses conservative assumptions because the requested deployment facts were not supplied: every route is treated as internet reachable unless source code enforces a boundary. Findings whose exploitability depends on Docker/self-hosted exposure or configured provider credentials are labeled **conditional**.

## Evidence and method

- Inspected all 48 `app/api/**/route.ts` handlers, security-relevant `lib/**` modules, `proxy.ts`, `next.config.mjs`, `Dockerfile`, `docker-compose.image2.yml`, Vercel ignore/configuration, migrations, and client auth components.
- Verified no tracked `.env`, `.env.local`, `.env.production`, or `deploy/image2/production.env` file. Only `.env.example` is tracked; `.dockerignore` and `.vercelignore` exclude real environment files.
- Ran `npm run typecheck` successfully and `npm audit --omit=dev --json`.
- Performed only non-mutating local requests against `127.0.0.1:3012`; no production endpoint was queried.
- No direct `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write` sink was found in application code. This reduces one common XSS class but does not replace CSP, output encoding review, or token hardening.

## Risk scale

| Severity | Meaning in this application |
| --- | --- |
| Critical | A remote unauthenticated caller can control another user's data, consume billable generation capacity at scale, or bypass a core tenant/identity boundary. Examples: legacy `userId` trust; public credit-consuming job creation. |
| High | A remote caller can alter job/wallet state, invoke configured providers, execute internal automation, or exploit a known high-severity framework advisory. Examples: unsigned provider callback; trusted forwarded-host quota bypass; vulnerable Next.js release. |
| Medium | A realistic attacker can cause focused abuse, steal browser-readable sessions after a separate XSS/extension compromise, or exploit missing browser/rate-limit controls. Examples: public Jina/scout endpoints; absent baseline headers; redirect-unbounded proxy. |
| Low | Requires unusual prerequisites or is primarily hardening. Examples: root Docker runtime in an otherwise localhost-only container. |

## Confirmed findings

### SEC-001: Critical - Legacy public APIs trust caller-supplied user identities

**Locations:**

- `app/api/claim/route.ts:8-16`
- `app/api/redeem/route.ts:8-17`
- `app/api/account/route.ts:8-19`
- `app/api/dashboard/route.ts:7-15`
- `app/api/generations/route.ts:18-122`
- `lib/store.ts:143-162`

**Evidence:** The legacy handlers take `body.userId`, `?userId=`, or `x-seedance-user` and pass it directly to mutable store operations. `ensureUser` creates a user record for an arbitrary non-empty ID. No verified Supabase session, ownership check, or role check occurs before claim, redeem, account update, dashboard read, quota consumption, or provider task creation.

**Impact:** Any remote caller can impersonate a known ID or create unlimited synthetic identities. Depending on active legacy traffic and provider configuration, this enables trial/card-code abuse, cross-user profile/dashboard access, quota manipulation, and provider-backed generation requests.

**Recommended remediation:** Retire these routes from public production traffic or return `410` in production. For any retained function, derive identity exclusively through a verified server-side session, enforce resource ownership, and add rate limits. Do not migrate the body/header `userId` convention into new endpoints.

**Detection:** Alert on legacy endpoint use, synthetic/rapidly changing user IDs, repeated claim/redeem attempts, and provider task creation without a corresponding verified account ID.

### SEC-002: High - Seedance provider callback accepts unauthenticated state-changing payloads

**Location:** `app/api/provider/seedance/callback/route.ts:9-40`.

**Evidence:** The handler accepts arbitrary JSON, derives a task ID from attacker-controlled fields, updates generation status and media URLs, and refunds quota for failed/expired states. It has no HMAC/signature, timestamp window, nonce/replay defense, provider IP validation, or provider-side task verification.

**Impact:** A caller able to obtain or guess a provider task ID can mark jobs complete/failed, inject media links, or trigger quota refunds.

**Recommended remediation:** Require a provider-specific HMAC signature over raw body plus timestamp, reject stale/replayed events, and verify a recognized task ID before mutation. Store webhook event IDs and make status transitions idempotent. Use a dedicated webhook secret rather than a browser-accessible value.

**Detection:** Record signature failures, unknown task IDs, duplicate event IDs, invalid state transitions, and refund frequency by provider task.

### SEC-003: High - Client-controlled forwarded host selects a quota-bypass provider path

**Location:** `app/api/image2/route.ts:15-20, 62-78`.

**Evidence:** The route derives host from `x-forwarded-host` before `host`, then skips `reserveImage2GenerationUsage` when the value equals `picture.lsb0713.online`.

**Read-only proof:** Against local source runtime, `GET /api/image2` returned `{ provider: "image2", configured: true }`; the same request with `x-forwarded-host: picture.lsb0713.online` returned `{ provider: "picture", configured: true }`.

**Impact:** If the edge forwards a caller-controlled forwarded-host header, a remote caller can select the Picture branch and skip Image2 wallet/quota reservation before configured provider use.

**Recommended remediation:** Never use `Host` or `X-Forwarded-Host` as an authorization/quota boundary. Split product paths or select behavior from a deployment-controlled configuration. Require server-verified identity and an explicit entitlement/quota policy for every provider invocation, including Picture.

**Detection:** Log canonical deployment host separately from received host headers; alert whenever forwarded-host differs from the trusted platform host or a route selects an unexpected provider.

### SEC-004: High - Public provider-backed image and music endpoints lack identity, quota, and request bounds

**Locations:**

- `app/api/doubao2api/images/route.ts:7-28`
- `app/api/music/generations/route.ts:7-30`

**Evidence:** Both public POST handlers parse JSON and call provider functionality with no verified user, entitlement, quota reservation, rate limit, request byte cap, prompt-length cap, or concurrency control.

**Impact:** When upstream credentials are configured on a reachable deployment, any caller can consume provider budget and use the service for arbitrary content generation or denial-of-wallet pressure.

**Recommended remediation:** Require a verified user session and an atomic server-side quota/credit reservation. Add strict runtime schemas, explicit maximum body/prompt/reference-data sizes, a per-user/IP burst limiter, and a global concurrency cap. Disable the endpoints when the authenticated product is not enabled.

**Detection:** Track provider calls by authenticated user, source network, endpoint, prompt byte size, latency, failure class, and total cost; alert on anonymous calls and abnormal bursts.

### SEC-005: High, conditional - Unauthenticated local automation endpoint can invoke desktop/browser automation

**Location:** `app/api/local-automation/route.ts:75-163`.

**Evidence:** The POST handler accepts caller-selected action data, invokes Python through `execFile`, and supports `click-selector` and `fill-selector`. It has no server-side auth. The execution path runs with `windowsHide: false`.

**Impact:** If a local or self-hosted instance is reachable by anyone outside the trusted operator machine, a remote caller can drive browser automation against the machine's active sessions and exposed desktop/browser context.

**Existing mitigation:** `.vercelignore` excludes `automation/`, reducing the expected Vercel deployment path.

**Recommended remediation:** Remove this endpoint from web deployment artifacts. Keep automation on localhost-only IPC or a separate operator tool, compiled out for production. If an HTTP bridge is unavoidable, require mutual authentication, a fixed action allowlist, network isolation, and an explicit operator approval step.

**Detection:** Log and alert on every invocation, action type, caller identity, and target selector. The desired production metric is zero public requests.

### SEC-006: High - Installed Next.js version is covered by multiple security advisories

**Evidence:** `npm ls next postcss --omit=dev` resolved `next@16.2.4` and `postcss@8.4.31`. `npm audit --omit=dev --json` reports a high-severity direct `next` vulnerability set and a moderate transitive `postcss` issue, with `next@16.2.10` available as the remediation.

**Impact:** Known framework issues include denial of service, proxy/middleware bypasses, SSRF WebSocket upgrade behavior, and cache poisoning ranges. Their exact exploitability depends on deployed features, but unpatched public framework code is an unnecessary platform risk.

**Recommended remediation:** Upgrade and lock `next` to at least `16.2.10`, regenerate the lockfile, build the exact production source, and run authenticated/unauthenticated route regressions. Revalidate proxy behavior because the application uses `proxy.ts` for host-dependent redirects.

### SEC-007: High, conditional - Non-Supabase asset and Gacha fallbacks do not enforce user isolation

**Locations:**

- `app/api/image2/assets/route.ts:46-55, 237-280`
- `lib/image2-gacha-auth.ts:5-12`
- `lib/image2-gacha-store.ts:707-887`
- `app/api/image2-gacha/runs/route.ts:223-280`

**Evidence:** Asset fallback identity is accepted from body/query/custom headers when `IMAGE2_ASSET_SYNC_BACKEND` is not `supabase`. Gacha context returns `{}` whenever its Supabase backend flag is disabled, so route handlers continue without a verified user. A read-only local unauthenticated `GET /api/image2-gacha/runs` returned `200` in this fallback mode.

**Existing mitigation:** `docker-compose.image2.yml` sets both `IMAGE2_ASSET_SYNC_BACKEND=supabase` and `IMAGE2_GACHA_BACKEND=supabase`.

**Impact:** Any accidentally misconfigured public deployment can expose cross-user assets, shared Gacha records, or writes controlled by request headers/body identity values.

**Recommended remediation:** Fail closed in production unless the required Supabase backend and identity verification are active. Make local-only fallback explicit with `NODE_ENV !== "production"`; remove HTTP user-ID header/body fallbacks entirely.

### SEC-008: Medium - Public internal operations endpoints enable outbound/record abuse

**Locations:**

- `app/api/local-automation/jina/route.ts:100-207`
- `app/api/daihuo-scout/leads/route.ts:30-52`

**Evidence:** The Jina handler can execute a local reader/search helper or call the remote service with configured credentials using a caller-provided external URL. The scout-leads route permits public read/replace behavior. Neither has an observable server-side authorization control.

**Impact:** Attackers can consume Jina quota, make server-side outbound requests to arbitrary URLs, obtain or overwrite internal scout data, and create operational noise.

**Recommended remediation:** Remove from public runtime or protect with verified admin/session authorization and rate limits. For a retained reader, allowlist public target hosts, resolve and block private/reserved addresses, use time/size limits, and store operations data behind ownership/role checks.

### SEC-009: Medium - Access and refresh tokens are persisted in browser-readable storage

**Locations:**

- `components/unified-login-panel.tsx:193-200`
- `components/picture-studio.tsx:162-177`
- `components/image2-public-home.tsx:73-95`
- `app/api/auth/otp/verify/route.ts`
- `lib/picture-auth.ts`

**Evidence:** Client components persist Supabase access/refresh token material and API responses expose the token pair to browser JavaScript.

**Impact:** Any same-origin XSS, compromised extension, malicious third-party script, or shared-device browser compromise can steal both access and long-lived refresh credentials.

**Recommended remediation:** Move to a secure HttpOnly cookie session using Supabase SSR/server helpers; avoid returning refresh tokens to application JavaScript. Pair this change with CSP, session rotation/revocation, and a migration plan for current local storage sessions.

### SEC-010: Medium - No baseline browser security headers or app-level CSRF/rate-limit mechanism

**Locations:** `next.config.mjs:4-36`, `app/layout.tsx`, and route inventory.

**Evidence:** `next.config.mjs` configures cache headers only. No application-level CSP, `frame-ancestors`/clickjacking defense, Referrer Policy, Permissions Policy, CORS policy, CSRF token/origin middleware, or generic rate limiter was found. The only explicit `X-Content-Type-Options: nosniff` is on the image proxy response.

**Impact:** Browser token storage has less defense in depth, UI can be embedded unless an external platform sets headers, and public auth/provider/card operations can be brute-forced or abused more easily.

**Recommended remediation:** Introduce a tested header baseline in `next.config.mjs`, starting with a report-only CSP if needed, `X-Content-Type-Options`, clickjacking protection, `Referrer-Policy`, and minimal `Permissions-Policy`. Add per-route origin/CSRF controls only to cookie-auth state-changing handlers. Add a shared rate-limit abstraction using a trusted proxy source, not caller-provided forwarded-IP values.

### SEC-011: Medium - Image proxy does not constrain redirects, streaming size, timeout, or SVG response handling

**Location:** `app/api/image2/proxy/route.ts:13-99`.

**Evidence:** Initial URL host allowlisting is present, but `fetch` follows redirects by default and the redirected destination is not revalidated. The handler has no abort timeout, reads the full response through `arrayBuffer()` before the final byte limit, accepts `image/svg+xml`, and serves it same-origin inline.

**Impact:** A permitted upstream may redirect the server to an unapproved destination, hold connections, exhaust memory with large/chunked responses, or serve active SVG content from the site origin.

**Recommended remediation:** Use `redirect: "manual"`, revalidate each redirect destination, impose `AbortSignal.timeout`, enforce a streamed byte cap, and restrict proxy output to raster image types. If SVG support is needed, serve as attachment or sanitize it outside the application origin.

### SEC-012: Medium - Auth flows have uneven anti-abuse controls

**Locations:**

- `app/api/auth/otp/send/route.ts`
- `app/api/auth/otp/verify/route.ts`
- `app/api/picture/auth/register/route.ts`
- `app/api/picture/auth/login/route.ts`

**Evidence:** Unified OTP send checks Turnstile through `lib/turnstile.ts`, which is a positive control. No app-level identifier/IP rate limit was found. Picture registration and login lack an equivalent challenge and rate limit.

**Impact:** Attackers can create account/OTP delivery pressure, enumerate error behavior, and attempt password credentials at high volume until upstream controls intervene.

**Recommended remediation:** Apply measured identifier/IP/device rate limits to signup, password login, OTP send, OTP verify, card redemption, and provider calls. Keep Turnstile as a supplemental signal, not the sole rate-defense. Normalize visible errors and record failures without storing credential material.

### SEC-013: Medium - Admin authorization uses a single browser-supplied static secret rather than a role-bound session

**Locations:** `lib/admin-auth.ts:3-14`, `app/api/admin/**/route.ts`.

**Evidence:** Admin handlers call `requireAdmin`, which compares a configured `ADMIN_TOKEN` against a token supplied by the client. This is an actual server-side gate and is stronger than a hidden UI, but it has no individual accountability, rotation/session lifecycle, or least-privilege roles.

**Impact:** Anyone with the shared token has the same administrative capabilities. A browser/token leak cannot be attributed or selectively revoked without rotating access for all operators.

**Recommended remediation:** Replace shared-token admin access with verified Supabase sessions and a server-side admin role claim/table, with distinct permissions for content moderation, user support, code/wallet operations, and operations audit. Retain a break-glass procedure outside browser storage.

## Positive controls observed

- Server-side Supabase service-role usage remains in server modules in the reviewed source; no tracked real environment file was found.
- `.gitignore`, `.dockerignore`, and `.vercelignore` exclude environment files and `deploy/image2/production.env`.
- Production Docker configuration sets Supabase backends for Image2 assets and Gacha.
- Image2 wallet, membership, redemption, Picture history, and team workbench routes use bearer-token verification through `getSupabaseUser` or an equivalent helper in their normal production paths.
- Image2 output and Picture output handlers normalize path segments and only serve known media extensions.
- Workbench write handlers require verified bearer access and apply file type/size checks.
- Image2 card-code migrations store hashes rather than plaintext code values and use an RPC model for redemption.

## Route exposure ledger

`Protected` means an observable server-side gate exists. It does not mean the entire authorization model is risk-free.

| Route handler | Classification | Evidence / note |
| --- | --- | --- |
| `/api/account` | Public, unsafe legacy | Body `userId` controls account update. |
| `/api/admin/image2-cases/changes` | Protected, role-bound bearer/HttpOnly session | `requireAdmin`; cookie-authenticated POST also requires same-origin CSRF proof. |
| `/api/admin/image2-gacha/health` | Protected, role-bound bearer/HttpOnly session | `requireAdmin`. |
| `/api/admin/jobs` | Protected, role-bound bearer/HttpOnly session | `requireAdmin`; cookie-authenticated POST also requires same-origin CSRF proof. |
| `/api/admin/picture` | Protected, role-bound bearer/HttpOnly session | `requireAdmin`. |
| `/api/admin/picture/output` | Protected, role-bound bearer/HttpOnly session | `requireAdmin`. |
| `/api/admin/users` | Protected, role-bound bearer/HttpOnly session | `requireAdmin`. |
| `/api/auth/otp/send` | Public auth entry | Turnstile present; no observed rate limiter. |
| `/api/auth/otp/verify` | Public auth entry | No observed rate limiter. |
| `/api/claim` | Public, unsafe legacy | Body `userId` controls trial claim. |
| `/api/daihuo-scout/leads` | Public internal operation | Read/replace behavior lacks visible auth. |
| `/api/dashboard` | Public, unsafe legacy | Query/header user identity. |
| `/api/doubao2api/images` | Public provider invocation | No identity/quota gate. |
| `/api/generations` | Public, unsafe legacy | Query/body user identity; can call provider. |
| `/api/image2-gacha/cards/[cardId]` | Conditional protected | Gacha context is authenticated only when Supabase backend flag is active. |
| `/api/image2-gacha/config` | Public read-only | Returns public mode configuration. |
| `/api/image2-gacha/jobs/[jobId]` | Conditional protected | Same Gacha context dependency. |
| `/api/image2-gacha/recipes` | Conditional protected | Same Gacha context dependency. |
| `/api/image2-gacha/runs/[runId]/draw` | Conditional protected | Same Gacha context dependency. |
| `/api/image2-gacha/runs/[runId]` | Conditional protected | Same Gacha context dependency. |
| `/api/image2-gacha/runs` | Conditional protected | Local unauthenticated GET returned `200`. |
| `/api/image2-workbench` | Public read fallback / team data protected | Unauthenticated/unauthorized requests get public model; team data requires bearer plus allowlist. |
| `/api/image2-workbench/assets` | Team protected | `requireImage2WorkbenchTeamMember`; upload bounds present. |
| `/api/image2-workbench/feedback` | Team protected | Workbench access helper. |
| `/api/image2-workbench/file` | Team protected | Workbench access helper. |
| `/api/image2-workbench/generate` | Team protected | Workbench access helper. |
| `/api/image2/assets` | Conditional protected | Supabase bearer in normal mode; header/body identity fallback otherwise. |
| `/api/image2/balance` | Bearer protected | `getSupabaseUser`; local no-token GET returned `401`. |
| `/api/image2/entitlements` | Bearer protected | `getSupabaseUser`. |
| `/api/image2/output/[...path]` | Public output serving | Path traversal and extension controls present; visibility is public by design. |
| `/api/image2/proxy` | Public remote image proxy | Initial host allowlist; redirect/streaming gaps remain. |
| `/api/image2/quota` | Public free-quota status | Client-key/anonymous quota design; not a user identity boundary. |
| `/api/image2/redeem` | Bearer protected | `getSupabaseUser` before redemption. |
| `/api/image2` | Public provider routing | Host-controlled branch and conditional wallet reservation. |
| `/api/image2/stream` | Wallet/bearer protected in normal path | `reserveImage2GenerationUsage`; verify fallback behavior during remediation. |
| `/api/local-automation/jina` | Public internal operation | Outbound Jina/local helper access without visible auth. |
| `/api/local-automation` | Public internal operation | Calls local automation process without visible auth. |
| `/api/music/generations` | Public provider invocation | No identity/quota gate. |
| `/api/picture/auth/login` | Public auth entry | No observed rate limit; forwarded-host use. |
| `/api/picture/auth/logout` | Session-bound | Picture auth helper handles token/session. |
| `/api/picture/auth/me` | Session-bound | Picture auth helper handles token/session. |
| `/api/picture/auth/register` | Public auth entry | No observed rate limit; forwarded-host use. |
| `/api/picture/history` | Bearer protected | `requirePictureUser`. |
| `/api/picture/output/[...path]` | Public output serving | Path-normalized media output. |
| `/api/picture` | Bearer protected | `requirePictureUser` before generation. |
| `/api/provider/doubao2api/status` | Public provider status lookup | No visible caller auth; scope/cost depends on upstream implementation. |
| `/api/provider/seedance/callback` | Public unsigned webhook | Mutates generation and quota state. |
| `/api/redeem` | Public, unsafe legacy | Body `userId` controls card redemption. |

## Remediation order

1. **Contain public abuse paths:** Disable or protect legacy Seedance routes, public provider generators, local automation, Jina, and scout APIs in production. Add a temporary production allowlist/`410` guard before a larger rewrite.
2. **Repair trust boundaries:** Replace caller-controlled user IDs and host headers with verified identity and explicit product routes; add signed/replay-safe provider webhooks.
3. **Fail closed:** Make Image2 assets/Gacha storage require Supabase/auth in production and remove non-authenticated fallback identity sources.
4. **Patch the platform:** Upgrade Next.js to `16.2.10` or newer, lock dependencies, build, and regression-test proxy/auth routes.
5. **Harden sessions and admin:** Move refresh tokens into HttpOnly sessions; replace shared `ADMIN_TOKEN` with role-bound administrative sessions.
6. **Add abuse and browser baselines:** rate limits, request schemas/bounds, security headers, proxy redirect/timeout/streaming controls, and structured security telemetry.

## Verification required after remediation

- Unauthenticated and mismatched-user requests to every protected route return `401`/`403` with no data mutation.
- User A cannot read or mutate User B assets, Gacha runs, history, memberships, cards, wallet, or generations.
- Every provider invocation has a recorded authenticated actor and atomic debit/reservation.
- Invalid, stale, replayed, and incorrectly signed webhook events cannot change any job or quota.
- Production deployment fails or disables privileged features when required Supabase backend flags/configuration are absent.
- Security header checks pass on production and local HTTP remains functional without forced `Secure` cookies.
- Image proxy tests cover redirect to unapproved host, chunked oversized body, timeout, non-image response, and SVG handling.

## Production follow-up: minimal administrator profiles contract

With explicit owner approval, `202607150002_image2_admin_profiles_minimal.sql`
was applied to the production Supabase project. The migration creates only the
`public.profiles` authorization contract and its two lifecycle triggers; it does
not create or mutate wallet, license, entitlement, case, prompt, or generation
tables.

Production readback verified:

- all 8 existing Auth users have matching profile rows and there are no missing
  profiles;
- the confirmed owner account is the single `admin` profile;
- RLS is enabled with own-profile `SELECT` and own-profile display-name
  `UPDATE` policies;
- `anon` has no profile-table read privilege;
- `authenticated` can update `display_name` but has neither table-level update
  privilege nor column-level update privilege on `role`;
- `service_role` can read and manage roles for the server authorization path;
- both profile functions use `search_path=pg_catalog, public`;
- the new-user and updated-at triggers both exist;
- a fresh Security Advisor run remains at 0 errors and 1 warning. The remaining
  warning is leaked-password protection being disabled and was not changed in
  this migration.

This closes the missing database role contract. The browser-session work below
is a local candidate and has not been deployed with the admin application.

## Local follow-up: HttpOnly administrator session

The local release candidate now supports an admin-specific OTP intent that
verifies the Supabase user and `profiles.role` server-side before setting access
and refresh credentials as `HttpOnly`, `SameSite=Strict` cookies. The admin
response does not return either credential to browser JavaScript. Access-token
expiry is handled through a dedicated same-origin refresh endpoint that rotates
both cookies and repeats the administrator-role check.

Cookie-authenticated state-changing admin routes require an exact same-origin
request plus the `x-image2-admin-csrf` marker. Explicit bearer and local
break-glass requests remain compatible without a cookie-CSRF requirement. The
admin page now gates its content on the server-verified session, redirects to a
dedicated administrator login intent, removes manual `ADMIN_TOKEN` entry from
the Image2 change-log UI, and supports local cookie clearing plus best-effort
Supabase session revocation on logout.

This work is verified locally only. It has not been pushed or deployed, so the
production website does not yet expose this new session flow.
