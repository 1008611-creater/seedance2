# Image2 Admin Candidate

## Scope

`/admin/image2-cases/candidate` is a work-focused local candidate for Image2 case-library operations. It reads only the build-time catalog index at `public/data/image2-case-library.index.json`. It does not fetch Supabase, call existing admin APIs, write local JSON, or modify an external service.

The current `/admin/image2-cases` operations hub remains unchanged. This avoids silently changing the existing deployment entrypoint while the role-based admin contract is incomplete.

## Local Access Gate

The candidate is unavailable by default and is forcibly blocked in production. A reviewer needs a non-production process with:

```text
IMAGE2_ADMIN_PREVIEW=local-dry-run
```

For a local `next start` production-artifact review only, `.env.local` may also set `IMAGE2_ADMIN_PREVIEW_BUILD_TEST=true`. This branch is still rejected whenever `VERCEL=1`, so it cannot enable the candidate on Vercel.

This is a preview gate, not an administrator authorization system. No `ADMIN_TOKEN`, account session, cookie, service-role key, or card code is read by this UI.

The candidate route uses request-time rendering so the preview gate is evaluated by the serving environment rather than being embedded into a locally generated static page.

## Connected And Unconnected Data

- Connected: the public case index provides case counts, categories, tags, prompt previews, source registry mapping, score/tier, and optional original-source URLs.
- Unconnected: user profiles, memberships, license codes, redemption history, wallet balances, transactions, and server audit records.
- Local-only: candidate review registration is stored in browser memory and disappears after a refresh.

## Production Contract Before Integration

1. Verify Supabase sessions server-side and require `profiles.role = 'admin'` on every `/api/admin/image2/*` route.
2. Add narrow aggregate/read endpoints for overview, users/members, wallet/redemptions, and review records. Never send a service-role key or plaintext card code to the browser.
3. Make writes explicit actions with server-side validation and append-only audit records. Do not reuse the candidate's browser-memory review action as a production write.
4. Add end-to-end coverage for non-admin rejection, admin read scopes, pagination, audit creation, and error redaction.
