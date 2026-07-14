# Image2 / Seedance2 Security Audit Task Spec

## Background and goal

The Image2 case library, Picture Studio, and legacy Seedance workflow share one Next.js repository and are reachable through Vercel and optional Docker/self-hosted deployment. This is an XL-risk audit because it covers authentication, membership, provider spending, admin tooling, and Supabase-backed user data.

The goal is to create an evidence-based security baseline and threat model before changing runtime behavior. The audit must distinguish confirmed source-code findings from deployment-dependent risks.

## Scope

- `app/api/**`, `app/**/page.tsx`, `proxy.ts`, and `next.config.mjs` runtime entry points.
- Authentication, authorization, session/token handling, card redemption, wallet/quota, user assets, Gacha, Picture Studio, and admin routes.
- Provider callbacks, outbound fetches, image proxying, local automation, and process execution.
- Supabase migrations and server-side storage adapters relevant to tenant isolation.
- Docker/Vercel deployment configuration, dependency versions, and secret-exposure guardrails.
- Client XSS sinks and browser security headers.

## Non-goals

- Do not deploy, change Vercel, modify Supabase data/RLS/users/cards/wallets, rotate secrets, or read/export secret values.
- Do not change runtime code during the audit phase; remediation requires a separate approved task.
- Do not claim infrastructure controls that are not present in the repository or confirmed by the service owner.
- Do not treat local development tools as production evidence unless their public deployment path is established.

## Business rules

- `RULE-BIZ-001`: Public browsing may remain available, but credit-consuming generation, user data mutation, and internal operations must have explicit server-side authorization.
- `RULE-BIZ-002`: A user identity received in a request body, query, or arbitrary header is not an authorization proof.
- `RULE-BIZ-003`: Provider callbacks must be authenticated and replay-resistant before changing job state or wallet/quota state.

## Permission rules

- `RULE-AUTH-001`: Every protected action must derive the actor from a verified server-side session or a dedicated service-to-service authentication scheme.
- `RULE-AUTH-002`: Admin actions must be protected by server-side role authorization; a UI-only guard or hidden link is insufficient.
- `RULE-AUTH-003`: Trust decisions must not be based on client-controlled host, forwarded-host, IP, or user identity headers.

## Data rules

- `RULE-DATA-001`: Secrets, card codes, refresh tokens, and service credentials must not be logged, committed, or returned to browser JavaScript unnecessarily.
- `RULE-DATA-002`: Supabase-backed tenant data must default fail-closed in production when the required storage/auth backend is unavailable.
- `RULE-DATA-003`: Proxy/download routes must constrain target hosts, redirects, type, size, and time before returning remote content from the application origin.

## Implementation tasks

- `TASK-001`: Inventory all request-facing routes and classify their intended exposure and actual auth control.
- `TASK-002`: Trace identity, authorization, quota, redemption, and provider callback flows to identify cross-user, privilege, and financial/credit abuse paths.
- `TASK-003`: Review outbound requests, subprocess execution, file/output serving, proxying, headers, and client token storage.
- `TASK-004`: Review deployment and dependency posture without reading sensitive environment values.
- `TASK-005`: Produce a security best-practices report and repository-grounded threat model after the required context check-in.

## Acceptance criteria

- `AC-001`: All `app/api/**/route.ts` handlers appear in a route exposure ledger with an evidence-based auth classification.
- `AC-002`: Each confirmed critical/high issue includes exact source evidence, impact, exploit preconditions, remediation, and uncertainty notes.
- `AC-003`: The report separates production runtime, optional self-hosted runtime, and local/development tooling.
- `AC-004`: The threat model covers primary trust boundaries, assets, attacker model, 5 to 10 abuse paths, and a Mermaid data-flow diagram.
- `AC-005`: The final report records the service-owner answers or explicit unresolved assumptions that affect prioritization.
- `AC-006`: No production system, secret, or user data is changed or disclosed during the audit.

## Pending confirmation

The final severity of local automation exposure, legacy API exposure, and provider-cost abuse depends on the live deployment topology, whether legacy routes still serve real traffic, and which provider credentials are enabled on internet-facing domains.
