# Image2 Commercialization Independent Review

## Review verdict

**Approved for local product/security candidate review; not approved as a production release claim.** The requested public product slice and P0 containment operate end to end in a local production build. Release remains gated by session/admin authorization migration and real production environment verification.

## Correct operating path reviewed

The public path should load a truthful case-led homepage, route creators into the real case library, preserve image/title/source alignment, expose account recovery without blocking discovery, and apply the same verified usage policy regardless of request host. Legacy/internal operations should be unreachable by default in production before request parsing or provider execution. Verification should use an exact production build, browser/API regression tests, dependency audit, metadata readback, and visual evidence.

The implementation follows that path. It does not stop at a design mock or plan: the production build was started locally and exercised through Playwright and HTTP readback.

## Findings

### Passed

- Homepage primary action reaches `/image2-cases`; curated cards link to the corresponding real case IDs.
- Curated image files visibly match their case titles; failed images degrade to a neutral fallback rather than unrelated content.
- Account modal is keyboard-addressable and includes password visibility control; password recovery regression remains green.
- 768, 390, and 320 pixel viewports have no material horizontal overflow; reduced-motion users receive final content without animation dependency.
- Forwarded host spoofing cannot select a quota-free provider branch.
- Guarded legacy/internal endpoints return intentional production `404` responses before normal work.
- Assets/Gacha production fallback paths fail closed.
- Security headers, metadata, framework patch level, typecheck, build, and production dependency audit are verified locally.

### Remaining release blockers

- **Authorization:** migrate browser-readable refresh credentials to HttpOnly sessions and replace shared admin-token access with role-bound operator authorization.
- **Provider callback:** implement signature, timestamp window, replay defense, and task-state validation before enabling the legacy callback path.
- **Production evidence:** verify Vercel environment presence, edge behavior, Supabase RLS, database migrations, and live domain headers without exposing values.
- **Commercial operations:** connect analytics/event taxonomy, monitoring/alerting, payment provider, entitlement reconciliation, and privacy/terms surfaces before paid launch.

### Non-blocking local warning

- Next.js reports one Turbopack NFT warning because `lib/store.ts` builds a dynamic `.data` path through `process.cwd()`. The build succeeds and guarded production APIs remain contained. This should be narrowed in a later legacy-store cleanup instead of applying an unverified ignore comment during release hardening.

## Scope control

No deployment, production database change, RLS change, user mutation, entitlement/code mutation, secret readout, or environment-variable change was performed.

## Follow-up review: role-bound admin and wallet RPC hardening

The correct protected path is now: bearer session -> Supabase Auth user
verification -> service-side `profiles.role` read -> `admin` decision -> admin
handler. A caller-controlled `x-admin-id` is no longer used as the audit actor
for case-change undo operations. The shared `ADMIN_TOKEN` compatibility path is
disabled by default in production and requires an explicit break-glass flag.

The Security Advisor migration candidate changes function configuration and
ACLs only. It does not contain `insert`, `update`, `delete`, `truncate`, or
`drop` statements. Static contract tests cover both wallet mutation signatures,
all five reported mutable search paths, and the service-role-only grants.

Local review evidence:

- typecheck and production build passed;
- five role/migration tests passed;
- four production security tests passed;
- all six admin route groups returned 401 for anonymous and bogus shared-token
  requests;
- production dependency audit remained at zero known vulnerabilities.

After explicit owner approval, the SQL was executed against production and its
ACL/search-path effects were read back from PostgreSQL. Supabase Security
Advisor dropped from 10 warnings to 1, with 0 errors. The remaining warning is
leaked-password protection being disabled. A real operator role has not been
assigned, and the admin UI has not yet migrated to an HttpOnly session. Those
remain release gates rather than being reported as complete.

## Follow-up review: production administrator profile contract

The missing `public.profiles` boundary was implemented as a narrow migration,
not by replaying the broader historical accounts/assets migration. The correct
path is now present in production: confirmed Auth user -> backfilled profile ->
server-managed `admin` role -> service-role profile lookup by the local admin
authorization helper.

Readback proved 8 Auth users / 8 profiles / 0 missing profiles, exactly one
administrator, enabled RLS, two own-row policies, no authenticated privilege to
update `role`, both lifecycle triggers, and fixed function search paths. The
focused migration and authorization suite passed 7 tests before production
execution. Security Advisor remained at 0 errors and 1 pre-existing warning
after a fresh linter run.

The production database contract and administrator assignment are complete.
Deployment and the HttpOnly admin-session UI remain separate release gates.

## Follow-up review: local HttpOnly administrator session

The local application now completes the browser-side portion of the role-bound
path: admin OTP verification remains server-side, the role is rechecked against
`public.profiles`, access and refresh credentials are emitted only as HttpOnly
cookies, expired access can be refreshed through a same-origin endpoint, and
admin APIs accept the cookie without exposing it to React or local storage.

State-changing cookie-authenticated routes include explicit CSRF validation.
The Image2 change-log console no longer asks the operator to paste a shared
secret. Focused authorization/session/migration tests pass 13/13, TypeScript
passes, and the Next.js production build includes both session endpoints. A
real browser check verified the signed-out gate and dedicated administrator
login screen; no OTP was sent and no production login was performed.

The implementation is a local release candidate. Production deployment,
production environment preflight, and a real post-deploy administrator login
remain unverified and must not be inferred from the local evidence.
