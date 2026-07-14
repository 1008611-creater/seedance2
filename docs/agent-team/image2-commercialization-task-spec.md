# Image2 Commercialization Program Task Spec

## Program route

- **Website route:** Existing Next.js App Router repository.
- **Source truth:** `D:\codex-work\seedance2`.
- **Business position:** Image2 is a creator prompt-reuse library and controlled visual-production workspace, not a generic AI image landing page.
- **Primary user action:** Browse a case -> understand its reusable prompt structure -> save/adapt it -> continue to a controlled generation workflow.
- **Current gate:** Phase 0/3 complete enough to begin P0 security and platform foundation work. Visual redesign is deferred until the P0 product boundary is stable.

## Confirmed product decisions

- `REQ-001`: Public users can browse, search, inspect source attribution, and copy basic prompts without being forced through a signup wall.
- `REQ-002`: Signed-in users can sync personal favorites, collections, notes, and prompt-reuse history.
- `REQ-003`: Membership gates advanced prompt workbench capabilities, member cases, bulk export, and generation credits; it must not block core case discovery.
- `REQ-004`: The product has four server-enforced roles: visitor, user, member, and operator. UI visibility is never the sole permission control.
- `REQ-005`: Static case content and dynamic user/commerce data remain separate: build-time case summaries/details versus Supabase-backed authenticated state.
- `REQ-006`: The operator console is a work tool for case quality, source provenance, moderation, membership, code/credit operations, and audit records. It is not a public dashboard or marketing page.
- `REQ-007`: Commercial claims, pricing, testimonials, conversion metrics, and provider success rates must be sourced from real data. Missing evidence is shown as unavailable internally, not invented publicly.

## P0 security rules

- `RULE-AUTH-001`: Legacy Seedance routes that accept user IDs from body/query/header are unavailable in production until migrated to verified identity.
- `RULE-AUTH-002`: Provider-backed image/music generation requires a verified user and an atomic server-side entitlement or wallet reservation.
- `RULE-AUTH-003`: Host and forwarded-host headers are not authorization, product-tier, or quota boundaries.
- `RULE-AUTH-004`: Internal automation, Jina, and scout operations do not remain publicly callable in production.
- `RULE-AUTH-005`: Provider callbacks authenticate raw payloads with a dedicated signing secret, timestamp window, replay defense, and known-task/state validation before mutation.
- `RULE-DATA-001`: Asset and Gacha fallback modes fail closed in production; no request header/body may identify a user.
- `RULE-DATA-002`: Auth refresh tokens move toward an HttpOnly server session boundary; until migration is complete, no new browser-readable credential persistence is introduced.
- `RULE-OPS-001`: Admin permissions migrate from a shared browser token toward role-bound Supabase sessions. The existing token gate may remain only as a local/break-glass compatibility path until role migration is complete.

## Information architecture

| Surface | Primary job | Dominant action | Access |
| --- | --- | --- | --- |
| `/` | Explain the actual creator workflow with real case media | Open case library | Public |
| `/image2-cases` | Find, compare, save, and reuse visual cases | Inspect / copy / save | Public + user enhancements |
| `/image2-cases/gacha` | Create controlled case-derived variations | Start a variation run | Authenticated member path |
| `/workbench` | Adapt prompt structures and manage production inputs | Generate / export draft | Authenticated, entitlement-aware |
| `/login` and account modal | Register, sign in, recover password, manage account | Authenticate | Public |
| `/admin/*` | Operate content, users, membership, and audits | Complete reviewed operation | Operator only |

## Implementation sequence

1. `TASK-001`: Add a production-only API exposure guard for legacy and internal-only endpoints; keep local developer tooling explicit and usable only outside production.
2. `TASK-002`: Remove forwarded-host authorization branching from Image2 generation and require the same server-side usage reservation policy for every provider route.
3. `TASK-003`: Add bounded shared request validation and rate-control interfaces for generation/auth/redemption endpoints, with a local safe fallback and production fail-closed behavior.
4. `TASK-004`: Add a signed provider-callback contract and production refusal when its signing secret is absent.
5. `TASK-005`: Fail closed for non-Supabase asset/Gacha modes in production; remove request-controlled identity fallback paths.
6. `TASK-006`: Upgrade Next.js to the patched release and add targeted regression tests for the new guards.
7. `TASK-007`: Establish the visual experience contract, then redesign the public creator path and operations UI using existing product imagery and real controls.
8. `TASK-008`: Complete role-bound admin migration, HttpOnly session migration, analytics/event taxonomy, SEO metadata, accessibility/performance review, and controlled release preparation.

## Non-goals for the first implementation slice

- No payment-provider integration, production card-code mutation, pricing claim, or automated billing.
- No production Vercel/Supabase/RLS/environment change or deployment.
- No database migration that cannot be verified locally without the service owner.
- No public visual rewrite before P0 route boundaries are stable.
- No removal of legacy routes in local development where existing tests/tools may still depend on them; production behavior is contained first.

## Acceptance criteria

- `AC-001`: In production mode, every legacy/internal-only route returns an intentional `404`/`410` before parsing a body or invoking a provider/process.
- `AC-002`: Image2/Picture provider selection no longer depends on request host headers, and no public provider route can skip entitlement/wallet policy.
- `AC-003`: Unsigned, stale, replayed, or unknown provider callbacks do not mutate task or quota state.
- `AC-004`: Production configuration without the required Supabase asset/Gacha backend rejects requests rather than accepting a client-supplied user identity.
- `AC-005`: The patched framework dependency is locked and all existing type/build/test checks relevant to changed paths pass.
- `AC-006`: A desktop/mobile visual contract and browser screenshot evidence exist before public UI redesign is called complete.
- `AC-007`: The launch checklist names every non-verified production dependency rather than claiming release readiness.

## Required evidence

- Request-level tests for unauthenticated, authenticated, wrong-user, production-guard, callback-signature, replay, host-spoof, and fallback-backend scenarios.
- `npm run typecheck`, exact-source production build, targeted Playwright/API tests, and post-coding review.
- Desktop and mobile screenshots once the public surface is redesigned.
- A pre-release environment checklist that checks variable presence only and never emits values.
