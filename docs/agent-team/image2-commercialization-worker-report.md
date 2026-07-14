# Image2 Commercialization Worker Report

## Outcome

This local implementation slice converted the public root into a product-led Image2 creator entry, contained the highest-risk legacy/internal production routes, removed host-header quota branching, upgraded the vulnerable framework dependency, and added focused regression coverage. No production deployment or production Supabase/Vercel mutation was performed.

## Implemented work

- Added `lib/runtime-access.ts` and production-default route hiding for legacy Seedance and internal operation APIs.
- Removed forwarded-host/provider quota branching from `/api/image2`; every Image2 request now uses the same server-side usage reservation path.
- Made Image2 assets and Gacha fail closed in production when their Supabase backend is unavailable.
- Added browser security headers and safe compatibility defaults.
- Locked Next.js to `16.2.10` and PostCSS to `8.5.10`; the production dependency audit reports zero vulnerabilities.
- Rebuilt the public homepage as a dark creator workspace with a single primary case-discovery action, curated real case media, bilingual copy, account modal, password visibility control, and reduced-motion support.
- Added canonical, Open Graph, Twitter, keywords, and robots metadata for the homepage and case library.
- Removed the hard-coded team email fallback from workbench access.
- Added production security and commercial homepage Playwright suites, including desktop/mobile overflow, reduced motion, image integrity, account modal, password visibility, forwarded-host resistance, internal-route hiding, backend fail-closed behavior, and security headers.

## Verification evidence

- `npm run typecheck`: passed.
- `npm run build`: passed; 1,193 case summaries/details were regenerated. One pre-existing Turbopack dynamic path tracing warning remains in the `lib/store.ts` legacy generations path.
- `npm audit --omit=dev --json`: zero production vulnerabilities.
- Commercial homepage + production security: 9/9 passed.
- Existing authentication UI + case assets: 5/5 passed after stabilizing the large case-data load timeout.
- Local production HTML: homepage and `/image2-cases` each expose title, canonical, Open Graph title, and Twitter card metadata.
- Visual evidence: `output/playwright/commercial-final-home-1440.png`, `commercial-final-home-768.png`, `commercial-final-home-390.png`, and `commercial-final-home-320.png`.

## Boundaries not completed in this slice

- Supabase refresh credentials have not yet been migrated to an HttpOnly server-session boundary.
- Shared `ADMIN_TOKEN` compatibility access has not yet been replaced by role-bound operator sessions.
- Legacy Seedance callbacks are disabled by default in production; a signed timestamp/replay-safe callback contract is still required before re-enabling them.
- Analytics, alerting, payment-provider integration, and production release preflight are not connected.
- Production Vercel behavior and production Supabase RLS were not mutated or verified.

## Follow-up local security slice (2026-07-15)

- Added role-bound server authorization for all current `/api/admin/**` routes:
  Supabase validates the bearer session, then the server reads
  `profiles.role` through its service-role boundary and requires `admin`.
- Production now disables the shared `ADMIN_TOKEN` path by default. Local
  development retains it; production break-glass use requires the explicit
  `IMAGE2_ENABLE_ADMIN_TOKEN_BREAK_GLASS` flag.
- Added and, after explicit owner approval, applied the idempotent
  `supabase/migrations/202607150001_image2_security_advisor_hardening.sql`
  to the production Supabase project.
- Local verification: five focused authorization/migration tests passed; all
  six admin route groups returned 401 for no auth and a bogus shared token in a
  local production build; the existing commercial security suite remained
  green.

Production readback after the approved migration:

- Supabase SQL Editor completed successfully and returned the `pg_notify` row.
- `anon` and `authenticated` cannot execute either wallet mutation RPC.
- `service_role` can execute both wallet mutation RPCs.
- all five reported functions expose `search_path=pg_catalog, public`.
- Supabase Security Advisor changed from 10 warnings to 1 warning and still
  reports 0 errors. The only remaining warning is leaked-password protection,
  which was not changed in this migration.
