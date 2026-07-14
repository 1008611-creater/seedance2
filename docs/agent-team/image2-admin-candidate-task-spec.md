# Image2 Admin Candidate Task Spec

## Background And Goal

- REQ-001: Add a professional local candidate console for Image2 case-library operations without replacing the existing `/admin/image2-cases` operations hub.
- REQ-002: The candidate must read the actual build-time case index and clearly separate connected static catalog data from unavailable account, membership, license-code, wallet, and audit data.
- REQ-003: The candidate must not call Supabase, existing `/api/admin/*` endpoints, image proxy endpoints, or any write endpoint.
- REQ-004: The candidate must be unavailable by default and forcibly unavailable on Vercel.

## Scope

- TASK-001: Add an isolated route at `/admin/image2-cases/candidate`.
- TASK-002: Add a server-only static catalog adapter and a browser-only operations console.
- TASK-003: Add catalog, taxonomy, review, and audit-contract views with local-memory-only review actions.
- TASK-004: Add focused browser coverage and local verification evidence.

## Non-Goals

- NON-001: Do not deploy or replace the current production admin entrypoint.
- NON-002: Do not read or modify production Supabase, RLS, users, memberships, wallets, license codes, Vercel variables, or administrator credentials.
- NON-003: Do not treat browser `ADMIN_TOKEN` input as a production authorization system.

## Rules

- RULE-AUTH-001: A local reviewer must explicitly set `IMAGE2_ADMIN_PREVIEW=local-dry-run`; `VERCEL=1` must still block the page.
- RULE-DATA-001: Case source URLs live in lazy detail data, so their absence from the lite index is never classified as a bad link.
- RULE-DATA-002: Review actions remain browser-memory-only and must say that they do not write the case library or Supabase.

## Acceptance Criteria

- AC-001: The existing `/admin/image2-cases` hub remains unchanged and the candidate is reachable only on its new child route.
- AC-002: The candidate reads actual catalog counts and supports case search, inspection, source filtering, and local review registration.
- AC-003: User/membership and license/wallet views state the unconnected read-only contract without displaying fabricated records.
- AC-004: Candidate tests show no forbidden API requests; desktop and mobile have no blocking layout error.
- AC-005: `npm run typecheck` and `npm run build` pass except documented pre-existing warnings.
