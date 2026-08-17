# Ngrok Dev Redirect Wiring for BoldSign (Web + Mobile Dev)

This ExecPlan is a living document. Sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current.

## Purpose / Big Picture

BoldSign signing sessions fail in local development when redirect URLs point to localhost/private-network addresses. After this change, launching the web app in dev should automatically create a public ngrok URL and use it for BoldSign redirect URLs. Mobile dev flows must also benefit when they call the same local backend routes.

## Progress

- [x] (2026-02-20 18:05Z) Located redirect URL source in web signing flows (`window.location.origin`) and backend sign route forwarding behavior.
- [x] (2026-02-20 18:13Z) Added a web dev launcher that starts ngrok alongside Next.js and injects the tunnel URL into runtime env.
- [x] (2026-02-20 18:13Z) Added backend redirect URL resolution that falls back from localhost/private URLs to ngrok URL.
- [x] (2026-02-20 18:14Z) Updated web signing callers to prefer configured public redirect env.
- [x] (2026-02-20 18:15Z) Ran targeted route/tests and confirmed behavior.

## Surprises & Discoveries

- Observation: Mobile KMP signing requests do not currently send `redirectUrl`, so backend-level fallback is required for mobile parity.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` request body for `/api/events/{eventId}/sign`.

## Decision Log

- Decision: Implement redirect fallback in backend sign route (not only web client).
  Rationale: Covers both web and mobile dev paths and guards against accidental localhost redirects even when client payloads are missing/unsafe.
  Date/Author: 2026-02-20 / Codex.

## Outcomes & Retrospective

Completed.

- `mvp-site` dev entrypoint (`npm run dev`) now launches through `scripts/dev-with-ngrok.mjs`, which attempts to create an ngrok tunnel for the current dev port and exports:
  - `BOLDSIGN_DEV_REDIRECT_BASE_URL`
  - `NEXT_PUBLIC_BOLDSIGN_DEV_REDIRECT_BASE_URL`
- Backend sign-link route now resolves redirect URLs with safety fallback:
  - local/private redirect URLs are replaced with the ngrok/public fallback when configured.
  - missing redirect URLs use the fallback (mobile-compatible).
- Web sign-link callers now prefer `NEXT_PUBLIC_BOLDSIGN_DEV_REDIRECT_BASE_URL` over `window.location.origin`.

Validation:

- `npx eslint src/app/api/events/[eventId]/sign/route.ts src/app/discover/components/EventDetailSheet.tsx src/app/profile/page.tsx src/lib/signRedirect.ts src/lib/signRedirectClient.ts src/app/api/events/__tests__/eventSignRoute.test.ts scripts/dev-with-ngrok.mjs` (pass; baseline-browser-mapping warning only).
- `npm test -- src/app/api/events/__tests__/eventSignRoute.test.ts` (pass).
