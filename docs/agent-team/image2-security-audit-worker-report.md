# Image2 / Seedance2 Security Audit Worker Report

## Executability review

- Requirements clear: Yes. The task is a source and local-runtime audit, not a remediation task.
- Audit plan reasonable: Yes. The repository exposes a Next.js App Router service with Supabase, provider, and optional local-automation boundaries.
- Acceptance criteria executable: Yes, except that final production exposure ratings remain conditional because the service owner did not answer the requested deployment-context questions.
- Additional requirement: None. Unanswered deployment facts are recorded as assumptions rather than invented.

## Audit summary

- Enumerated all 48 `app/api/**/route.ts` handlers and classified the observable auth model.
- Traced the legacy Seedance store, Image2 membership/wallet, Picture Studio, Gacha fallback, workbench, provider callbacks, proxy, and administrative boundaries.
- Reviewed Docker/Vercel configuration, tracked environment-file exposure, client token persistence, browser headers, unsafe HTML sinks, and dependency advisories.
- Ran read-only local requests against `http://127.0.0.1:3012`; no production URL, production database, user data, or secrets were accessed or modified.

## Evidence collected

- `npm run typecheck`: passed.
- `npm audit --omit=dev --json`: reports one high-severity direct `next` dependency and a moderate `postcss` dependency. The available remediation is `next@16.2.10`.
- Read-only request proof:
  - `GET /api/image2` returned provider `image2`.
  - The same request with `x-forwarded-host: picture.lsb0713.online` returned provider `picture`.
  - `GET /api/image2/balance` with no bearer token returned `401`.
  - `GET /api/image2-gacha/runs` with no bearer token returned `200` under the local fallback configuration.
- Static scans found no direct `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write` sink under `app/`, `components/`, and `lib/`.

## Files changed

- `docs/agent-team/image2-security-audit-task-spec.md`
- `docs/agent-team/image2-security-audit-worker-report.md`
- `docs/security/image2-security-best-practices-report.md`
- `docs/security/seedance2-threat-model.md`

## Uncovered and conditional items

- No live Vercel headers, WAF, reverse-proxy configuration, Supabase RLS state, Vercel environment values, or provider account settings were inspected.
- Docker/local-automation risk is critical only if the service can be reached beyond an isolated localhost deployment.
- Legacy route exposure and provider-cost exposure must be confirmed against the live routing and enabled credentials.

## Handoff

The independent review is recorded in `docs/agent-team/image2-security-audit-review-report.md`. No remediation was implemented in this audit task.
