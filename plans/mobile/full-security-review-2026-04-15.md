# Full Security Review: `mvp-site` and `mvp-app`

Date: 2026-04-15
Reviewer: Codex
Scope: source code, dependency risk, Docker/release config, manifests, in-repo CI/workflow material, and third-party integration configuration visible from code

## Executive Summary

This review found one cross-repo compromise path that should be treated as the top remediation item: mobile bearer tokens are stored in recoverable client storage while the backend session model is effectively non-revocable. In the current design, token theft from a device backup, local file extraction, or log exposure can turn into continued API access because logout only clears the cookie and `/api/auth/me` will refresh an otherwise valid bearer token.

The other high-value issues are mostly trust-boundary failures rather than isolated bugs: sensitive HTTP and user data are logged on iOS in all builds, request-origin generation trusts forwarded host headers when canonical origin configuration is absent, and the backend keeps a development-only path that can process unverified Stripe webhook payloads outside production. Separately, `mvp-site` has meaningful dependency risk in production packages and `mvp-app` still carries platform hardening gaps (`allowBackup`, HTTP app links, client config exposure that must rely on provider-side restrictions).

## Remediation Update (2026-04-15)

Implemented in this pass:

- `F-001`: mobile token storage moved to Android encrypted preferences and iOS Keychain-backed settings; backend session versioning now revokes stale bearer tokens on logout and password change
- `F-002`: iOS/shared HTTP logging is now debug-only and raw Google userinfo / Places payload logging was removed
- `F-003`: non-local origin resolution now requires configured canonical base URLs and only permits loopback header-derived origins locally; regression tests were added
- `F-005`: `next`, `@next/mdx`, Prisma packages, `nodemailer`, and AWS S3 SDK were upgraded; transitive runtime advisories were reduced to `0` critical / `0` high in `npm audit --omit=dev`
- `F-006`: Android backup is disabled, production `http://` app links were removed, and token-bearing iOS DataStore material was moved out of `Documents`

Explicitly deferred in this pass:

- `F-004`: left unchanged per user instruction

## Scope and Method

The review covered:

- `mvp-site` as the API and data-contract source of truth
- `mvp-app` as the mobile client and local data holder
- code-visible auth, billing, file, document, notification, and persistence flows
- dependency inventory and repo-safe scans

The review did **not** assume cloud-console, production, or secret-manager access. That remains a follow-up pass.

### Commands and checks executed

- `npm audit --json`
- `npm audit --omit=dev --json`
- `./gradlew :composeApp:androidDependencies`
- regex-based secret/material scan across both repos
- targeted auth-route test execution:
  - `npm test -- --runTestsByPath src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/google/mobile/__tests__/googleMobileRoute.test.ts src/app/api/auth/apple/mobile/__tests__/appleMobileRoute.test.ts`

Tooling not available in the workspace during this pass:

- `gitleaks`
- `trufflehog`
- `semgrep`

## Threat Model and Asset Inventory

### Assets

| Asset | Repo | Why it matters | Primary trust boundary |
| --- | --- | --- | --- |
| Session and auth tokens | both | account takeover, admin escalation, durable replay | mobile storage <-> backend auth |
| User/org/team/event records | both | PII, integrity of league/event operations | object-level authorization |
| Stripe billing, refunds, connect onboarding | `mvp-site` + `mvp-app` | direct money movement and payout integrity | client <-> backend <-> Stripe |
| Uploads and stored files | `mvp-site` | privacy, malware payloads, object authorization | browser/mobile <-> storage/API |
| Signed documents and BoldSign callbacks | `mvp-site` | sensitive documents and signature state | backend <-> BoldSign |
| Push tokens and mobile notification state | `mvp-app` | account correlation, device targeting | mobile OS <-> Firebase/backend |
| Local Room/DataStore persistence | `mvp-app` | token/PII at rest and backup exposure | device filesystem/backup |
| OAuth and deep-link handoff | both | token leakage, open redirect, app takeover | browser/system auth <-> app/API |

### High-risk flows reviewed first

1. Email/password, Google mobile, and Apple mobile login/session flows
2. Session refresh, logout, and admin authorization paths
3. Stripe payment, refund, host onboarding, and webhook flows
4. Upload, preview, and download paths
5. Signed-document access and webhook/callback handling
6. Mobile token persistence, transport logging, deep links, and manifest hardening

## Baseline Inventory

### Stack and integration map

`mvp-site`

- Next.js `16.1.6`
- Prisma `7.3.x`
- Postgres via Docker
- Stripe `20.x`
- `firebase-admin`
- BoldSign
- S3/DigitalOcean Spaces style object storage
- Nodemailer

`mvp-app`

- Kotlin Multiplatform / Compose Multiplatform
- Ktor `3.4.2`
- Room
- DataStore
- Stripe Android `23.3.0` and iOS PaymentSheet
- Firebase Messaging
- Google Maps / Places / Google Sign-In
- Napier logging

### Attack-surface index

`mvp-site`

- API route handlers: `159`
- Admin API route handlers: `17`
- Billing route handlers: `19`
- Document route handlers: `6`
- File route handlers: `3`

`mvp-app`

- Android deep-link/app-link entry points in manifest for both `https://` and `http://` on `bracket-iq.com`
- iOS URL/open activity handling in `iosApp/iosApp/iOSApp.swift`
- Stripe PaymentSheet native integrations on both platforms
- bearer-token attachment in shared Ktor client
- DataStore and Room-backed local persistence

### Repo-safe scan results

#### Dependency risk

`mvp-site` production audit (`npm audit --omit=dev --json`) returned:

- `34` production advisories total
- `2` critical
- `14` high
- `10` moderate
- `8` low

Direct or materially relevant results:

- `next` high severity advisories affecting the installed `^16.1.6` range
- `prisma` high severity advisories
- `nodemailer` moderate severity advisory
- critical transitive risk through `@aws-sdk/xml-builder` / `fast-xml-parser`

`mvp-app` did not have an SCA scanner installed in the workspace. Dependency inventory was collected via Gradle, but CVE triage for the Android/iOS dependency graph remains a follow-up item.

#### Secret and config scan

Regex scan did **not** find committed server private keys or live Stripe secrets in app code. It did find:

- expected test-only Stripe keys in backend tests
- Firebase client configuration material in mobile app assets, including an iOS Google API key in `iosApp/GoogleService-Info.plist`

The Firebase/Google client keys are not automatically a secret leak, but they must rely on provider-side platform, bundle-ID, SHA, and API restrictions.

## Findings Register

### F-001: Durable bearer-token compromise path across mobile storage and backend session design

- Severity: High
- Backlog: `P0`
- Exploitability: High with local device access, backup extraction, shared logs, or a prior token leak
- Impacted repos: both

#### Evidence

- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/AuthTokenStore.kt:18`
  - token persisted under the plain `auth_token` preference key
- `mvp-app/composeApp/src/iosMain/kotlin/com/razumly/mvp/di/DatastoreModule.ios.kt:18`
  - iOS DataStore file is created in `NSDocumentDirectory`
- `mvp-app/composeApp/src/androidMain/AndroidManifest.xml:11`
  - Android app backup remains enabled via `android:allowBackup="true"`
- `mvp-site/src/lib/authServer.ts:8`
  - JWT TTL is `7 days`
- `mvp-site/src/lib/authServer.ts:38`
  - `signSessionToken()` signs only the session payload
- `mvp-site/src/lib/authServer.ts:68`
  - backend accepts bearer tokens from the `Authorization` header
- `mvp-site/src/app/api/auth/me/route.ts:50`
  - valid session token is refreshed server-side
- `mvp-site/src/app/api/auth/me/route.ts:55`
  - refreshed token is returned in the JSON response body
- `mvp-site/src/app/api/auth/logout/route.ts:5`
  - logout clears the cookie but does not revoke server-side session state

#### Abuse case

1. Extract token from mobile preferences, backup, device filesystem, or logs.
2. Replay it against API routes over bearer auth.
3. Call `/api/auth/me` before expiry to obtain a fresh token.
4. Continue using API access even after user logout, because logout only clears the cookie holder.

#### Why this matters

This is the highest-confidence compromise chain in the codebase because it crosses both repos. The mobile app stores the token in recoverable storage, and the backend treats possession of the JWT as the full session state. There is no session record, no revocation list, no token versioning, and no logout invalidation.

#### Remediation

- move auth/session material to platform-protected storage:
  - Android: encrypted storage with backup exclusion
  - iOS: Keychain for tokens; if DataStore remains, move it out of `Documents` and mark no-backup
- disable or tightly scope Android backup/data extraction for token-bearing stores and local databases
- introduce server-side revocable session state:
  - `jti` or session ID in the JWT
  - server-side session table or token-version check
  - revoke on logout, password change, account disable, and high-risk auth events
- stop returning refreshed bearer tokens to clients that do not need them in response bodies
- reduce TTL and enforce rotation with revocation awareness

#### Retest

- extracting app backup or local files no longer yields a reusable bearer token
- a token captured before logout fails after logout
- a token captured before password change fails after password change
- `/api/auth/me` does not refresh revoked or superseded tokens

#### Status (2026-04-15)

- Fixed in code:
  - `mvp-app` now creates auth token storage through platform-protected implementations (`EncryptedSharedPreferences` on Android and `KeychainSettings` on iOS)
  - Android backup is disabled and iOS DataStore creation moved to `NSApplicationSupportDirectory`
  - `mvp-site` now carries `AuthUser.sessionVersion`; decoded session tokens include `sessionVersion`, and session checks reject stale versions
  - logout and password change now increment `sessionVersion`, so previously issued bearer tokens are no longer valid
- Verified by:
  - `./gradlew :composeApp:compileDebugKotlinAndroid :composeApp:compileKotlinIosSimulatorArm64`
  - `npm test -- --runTestsByPath src/lib/__tests__/permissions.test.ts src/app/api/auth/__tests__/authRoutes.test.ts src/server/__tests__/landingRedirect.test.ts src/server/__tests__/razumlyAdmin.test.ts`

### F-002: iOS release logging exposes auth, PII, location, and potentially payment data

- Severity: High
- Backlog: `P1`
- Exploitability: Medium
- Impacted repo: `mvp-app`

#### Evidence

- `mvp-app/composeApp/src/iosMain/kotlin/com/razumly/mvp/MvpApp.kt:12`
  - `Napier.base(DebugAntilog())` is initialized unconditionally on iOS
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/MvpHttpClientConfig.kt:34`
  - Ktor `Logging` plugin is always installed
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/MvpHttpClientConfig.kt:35`
  - logging level is `LogLevel.ALL`
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/MvpHttpClientConfig.kt:41`
  - only `Authorization` is redacted; bodies are not
- `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/MvpHttpClientConfig.kt:51`
  - response bodies are captured into `ApiException`
- `mvp-app/composeApp/src/iosMain/kotlin/com/razumly/mvp/userAuth/util/GetGoogleUserInfo.kt:33`
  - full Google userinfo response body is logged
- `mvp-app/composeApp/src/iosMain/kotlin/com/razumly/mvp/eventMap/MapComponent.ios.kt:163`
  - request bodies are logged
- `mvp-app/composeApp/src/iosMain/kotlin/com/razumly/mvp/eventMap/MapComponent.ios.kt:175`
  - response bodies are logged
- `mvp-site/src/app/api/auth/me/route.ts:55`
  - auth token is returned in the JSON body

#### Abuse case

1. Run a release-like iOS build on a device or capture system logs.
2. Exercise login, profile, payment, or places search flows.
3. Observe tokens, user profile data, request contents, and location search responses in logs.

#### Why this matters

Even if the transport channel is secure, logging makes secrets and PII available to anyone with device log access, MDM collection, crash/log tooling, or support diagnostics. Because the backend returns the refreshed auth token in JSON, the current mobile logging configuration materially increases the blast radius of token theft.

#### Remediation

- install verbose logging only in debug builds
- disable Ktor body logging in release builds
- redact or suppress tokens, client secrets, emails, profile payloads, and location response bodies
- remove one-off `Napier.d()` calls that print raw remote bodies
- treat `ApiException` body capture as debug-only or sanitize it before logging/telemetry

#### Retest

- release iOS build shows no bearer tokens, Stripe client secrets, profile bodies, or map/places payloads in logs

#### Status (2026-04-15)

- Fixed in code:
  - iOS `Napier` initialization is debug-only
  - shared Ktor logging is debug-only and reduced from `ALL` to `INFO`
  - `ApiException` no longer embeds response bodies in exception messages
  - raw Google userinfo and Google Places request/response body logs were removed
- Verified by:
  - `./gradlew :composeApp:compileKotlinIosSimulatorArm64`

### F-003: Request origin can be derived from untrusted forwarded host headers

- Severity: Medium
- Backlog: `P1`
- Exploitability: Medium
- Impacted repo: `mvp-site`

#### Evidence

- `mvp-site/src/lib/requestOrigin.ts:20`
  - helper falls back to request-derived origin
- `mvp-site/src/lib/requestOrigin.ts:29`
  - trusts `x-forwarded-proto`
- `mvp-site/src/lib/requestOrigin.ts:30`
  - trusts `x-forwarded-host` or `host`
- `mvp-site/src/app/api/auth/login/route.ts:62`
  - login flow sends initial verification email
- `mvp-site/src/app/api/auth/login/route.ts:65`
  - verification email uses `getRequestOrigin(req)`
- `mvp-site/src/app/api/auth/register/route.ts:374`
  - register flow also sends initial verification email
- `mvp-site/src/app/api/auth/register/route.ts:377`
  - register flow uses `getRequestOrigin(req)`

#### Abuse case

1. Send a request with a hostile `Host` or `X-Forwarded-Host` value in an environment where canonical public origin env vars are unset or misconfigured.
2. Trigger a verification email flow.
3. Cause the generated verification URL to point at an attacker-controlled origin or an unexpected domain.

#### Why this matters

This is not a cryptographic break, but it is a real trust-boundary issue. Verification and callback URLs should come from a canonical allow-listed origin, not request headers that may be influenced by a proxy chain or deployment misconfiguration.

#### Remediation

- require `PUBLIC_WEB_BASE_URL` or equivalent canonical origin in every non-local environment
- reject or ignore request-derived host/proto when canonical origin is configured
- if request-derived origin must exist locally, allow only a small local allow-list
- add tests that hostile host headers cannot influence generated verification links

#### Retest

- verification and callback links stay pinned to the configured public origin even when hostile host headers are supplied

#### Status (2026-04-15)

- Fixed in code:
  - `mvp-site/src/lib/requestOrigin.ts` now prefers configured canonical base URLs, allows request-derived origins only for loopback hosts, and throws for non-local environments without canonical origin config
  - Google start/callback routes now share the hardened helper instead of maintaining their own request-header origin fallback
- Verified by:
  - `npm test -- --runTestsByPath src/lib/__tests__/requestOrigin.test.ts`

### F-004: Development webhook bypass permits processing unverified Stripe events when enabled

- Severity: Medium
- Backlog: `P2`
- Exploitability: Medium in any shared non-production deployment that enables it
- Impacted repo: `mvp-site`

#### Evidence

- `mvp-site/src/app/api/billing/webhook/route.ts:873`
  - Stripe signature verification is attempted
- `mvp-site/src/app/api/billing/webhook/route.ts:885`
  - if `NODE_ENV !== 'production'` and `STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV === 'true'`, verification failure is bypassed
- `mvp-site/src/app/api/billing/webhook/route.ts:891`
  - code explicitly logs that it will continue with the unverified payload

#### Abuse case

1. Deploy a shared development or staging environment with `STRIPE_WEBHOOK_ALLOW_UNVERIFIED_DEV=true`.
2. POST a crafted event payload to the webhook endpoint without a valid signature.
3. Trigger billing-side effects based on an event the server never authenticated.

#### Why this matters

The code is correctly strict in production, but this bypass is dangerous if a staging or shared test environment has real data, real accounts, or integration trust from other systems. It is a common bridge from "dev convenience" into real integrity failures.

#### Remediation

- remove the bypass entirely, or restrict it to explicit localhost-only execution
- add a startup guard that fails boot if the bypass is enabled outside local development
- document a Stripe CLI forwarding workflow instead of bypassing signatures

#### Retest

- invalid Stripe signatures return `400` in every deployed environment

#### Status (2026-04-15)

- Deferred by user instruction for this remediation pass. No code change applied.

### F-005: Production dependency posture in `mvp-site` is behind current security fixes

- Severity: Medium
- Backlog: `P1`
- Exploitability: Variable by advisory
- Impacted repo: `mvp-site`

#### Evidence

- `npm audit --omit=dev --json` reported:
  - `34` production advisories
  - `2` critical
  - `14` high
- direct or near-direct packages affected include:
  - `next`
  - `prisma`
  - `nodemailer`
- critical transitive finding through `@aws-sdk/xml-builder` / `fast-xml-parser`

#### Why this matters

This is not one bug; it is an exposure multiplier. The highest-risk runtime code already sits on sensitive auth, billing, and webhook surfaces. Unpatched framework and ORM advisories increase the chance that a known issue becomes reachable through those same surfaces.

#### Remediation

- update `next` to a patched release that closes the current advisory set
- update `prisma` and related generated/runtime packages together
- update `nodemailer`
- resolve the transitive critical packages through parent-package upgrades or overrides
- add CI policy for `npm audit` triage or Dependabot/renovate gating

#### Retest

- production dependency audit contains no critical advisories and no accepted unresolved high advisories without explicit waiver

#### Status (2026-04-15)

- Fixed in code:
  - upgraded `next` / `@next/mdx` to `16.2.3`
  - upgraded `prisma`, `@prisma/client`, and `@prisma/adapter-pg` to `7.7.0`
  - upgraded `nodemailer` to `8.0.5`
  - upgraded `@aws-sdk/client-s3` to `3.1030.0`
  - added targeted `overrides` for vulnerable runtime transitives (`flatted`, `lodash`, `lodash-es`, `markdown-it`, `minimatch`, `node-forge`, `picomatch`)
- Verified by:
  - `npm audit --omit=dev --json` now reports `0` critical and `0` high production advisories

### F-006: Mobile platform hardening gaps increase recovery and downgrade exposure

- Severity: Low
- Backlog: `P2`
- Exploitability: Medium in combination with other issues
- Impacted repo: `mvp-app`

#### Evidence

- `mvp-app/composeApp/src/androidMain/AndroidManifest.xml:11`
  - `android:allowBackup="true"`
- `mvp-app/composeApp/src/androidMain/AndroidManifest.xml:59`
  - app link accepts `http://bracket-iq.com`
- `mvp-app/composeApp/src/androidMain/AndroidManifest.xml:73`
  - app link accepts `http://www.bracket-iq.com`
- `mvp-app/iosApp/GoogleService-Info.plist`
  - mobile Firebase/Google client config is materialized in app assets and must rely on provider-side restrictions

#### Why this matters

These are not standalone account-takeover bugs, but they make other failures easier to exploit. Backup exposure supports local token recovery, and HTTP app-link acceptance expands downgrade and interception surface compared with HTTPS-only universal/app links.

#### Remediation

- disable app backup or define explicit exclusion rules for token-bearing stores and databases
- remove `http://` deep-link schemes for production domains unless there is a specific, documented need
- verify Firebase/Google API restrictions by package/bundle/signing identity

#### Retest

- app no longer claims `http://` production links
- token-bearing stores are excluded from backup and restore

#### Status (2026-04-15)

- Fixed in code:
  - Android manifest now sets `android:allowBackup="false"`
  - production Android app links now claim only `https://bracket-iq.com` and `https://www.bracket-iq.com`
  - token-bearing iOS persistence moved away from backup-exposed `Documents`
- Follow-up still required outside repo scope:
  - verify Firebase / Google provider-side package, bundle, SHA, and API restrictions in console configuration

## Reviewed Areas With No Primary Finding Yet

These areas were reviewed and should stay in the regression set, but they did not rise to a primary finding in this pass:

- core user/org/event route authorization patterns reviewed in sampled routes were generally using `requireSession`, `assertUserAccess`, or organization/event membership checks
- signed-document file access in `mvp-site` includes authorization checks before issuing access
- Stripe billing/refund routes sampled in the event/team flows were using session and role checks rather than trusting client identity directly
- file preview/download routes appear intentionally public for image objects; if the product expectation is private media, this needs a separate product-security decision

## Remediation Backlog

### P0

1. Replace client token persistence with platform-protected storage and backup exclusions.
2. Introduce server-side session revocation and token versioning.
3. Make logout invalidate bearer-token replay, not only cookie state.

### P1

1. Remove sensitive release logging from iOS and shared Ktor client behavior.
2. Pin generated origins to configured canonical base URLs only.
3. Upgrade `next`, `prisma`, `nodemailer`, and the transitive critical package chain.

### P2

1. Remove or hard-fail the unverified Stripe webhook bypass outside localhost.
2. Remove `http://` production app links from Android.
3. Verify Firebase and Google API restrictions for shipped mobile config.
4. Tighten Docker/dev defaults so default Postgres credentials do not escape local-only use.

### P3

1. Add documented SCA and secret-scanning tooling for both repos.
2. Add release-hardening checks that fail builds if debug logging or backup-sensitive storage reappears.
3. Document which file/media objects are intentionally public and which are access-controlled.

## Retest Matrix

| Finding | Abuse case that must fail after remediation | Owner order |
| --- | --- | --- |
| F-001 | stolen token from backup/files/logs cannot authenticate; logout/password change invalidates prior token | backend first, then mobile |
| F-002 | release iOS build does not emit tokens, client secrets, userinfo bodies, or places payloads | mobile |
| F-003 | hostile `Host` / `X-Forwarded-Host` cannot influence verification or callback URLs | backend |
| F-004 | invalid Stripe webhook signature always returns `400` outside explicit localhost-only tooling | backend |
| F-005 | patched dependency set removes critical advisories and reduces accepted highs | backend |
| F-006 | app no longer claims HTTP production deep links and excludes token-bearing stores from backup | mobile |

## Dynamic Verification Notes

The highest-confidence findings in this report are backed directly by code paths and local repo checks. During this pass:

- targeted auth and helper regression tests passed
- `mvp-site` production dependency audit now reports `0` critical and `0` high advisories
- mobile dependency inventory was collected for `mvp-app`
- the token lifecycle, logging, origin generation, webhook bypass, and manifest/storage issues were all confirmed from source
- Android and iOS Kotlin compile checks passed after the storage/logging hardening changes

Not performed in this pass:

- live browser abuse against deployed environments
- cloud-console validation
- production key restriction validation in Google/Firebase consoles
- full mobile device runtime log capture with test credentials
- full backend production build verification; `npm run build` still fails on the pre-existing `src/lib/userService.ts:217` type error noted below

Those remain valid follow-up work, but they are not blockers for the remediation plan above because the core issues are already code-provable.

## Residual Risk and Next Pass

If the team fixes only one item first, it should be F-001 because it closes the only clear cross-repo account-compromise path found in this pass. After that, F-002 and F-003 should move next because they reduce token/PII leakage and hostile-link generation risk. F-004 and F-005 then tighten integrity and supply-chain posture around the highest-value backend surfaces.

The next review extension, once access is available, should cover:

- cloud and secret-manager configuration
- Stripe dashboard/webhook secret hygiene
- Firebase/Google key restrictions and OAuth redirect registrations
- storage bucket ACLs and CDN/object exposure
- production logging, telemetry, and retention configuration
