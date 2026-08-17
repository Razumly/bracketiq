# Require OAuth Profile Completion Across Site And App

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`PLANS.md` lives at `/Users/elesesy/StudioProjects/mvp-app/PLANS.md` in this repository and this document must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, a person who creates or restores an account through Google Sign-In or Sign in with Apple cannot continue into BracketIQ until their required profile fields are complete. The required fields for this feature are first name, last name, and date of birth. The behavior must be visible in both codebases that share the account system: the website in `/Users/elesesy/StudioProjects/mvp-site` and the Kotlin Multiplatform app in `/Users/elesesy/StudioProjects/mvp-app`.

The observable result is simple. If an OAuth account is missing one of those fields, the first authenticated screen becomes a dedicated profile-completion form. If the user closes the browser tab or mobile app before submitting the form, the next startup performs the same check and sends them back to the completion form until the missing fields are saved.

## Progress

- [x] (2026-04-10 15:47Z) Audited the existing auth flows, startup routing, profile editors, and placeholder date-of-birth behavior in both repositories.
- [x] (2026-04-10 15:47Z) Chose a shared backend-driven gating design so the web and mobile clients do not diverge on what counts as “missing”.
- [x] (2026-04-10 18:35Z) Implemented the backend profile-completion helper, exposed auth/session flags, added profile-completion persistence metadata, and normalized future OAuth placeholder birthdays.
- [x] (2026-04-10 19:05Z) Added the website gate and a dedicated `/complete-profile` page that saves first name, last name, and date of birth.
- [x] (2026-04-10 19:42Z) Added the mobile repository state, completion screen, and root-navigation gate.
- [x] (2026-04-10 20:18Z) Ran focused tests/builds in both repositories and recorded outcomes here.

## Surprises & Discoveries

- Observation: the mobile app does not persist `dateOfBirth` inside `UserData`, so a startup gate cannot safely rely on the cached local profile alone.
  Evidence: `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/UserData.kt` contains name fields and privacy flags but no date-of-birth field.

- Observation: the server already has an “unknown DOB” concept, but OAuth account creation is not using it.
  Evidence: `/Users/elesesy/StudioProjects/mvp-site/src/server/userPrivacy.ts` treats `null`, invalid dates, and `Date(0)` as unknown, while `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/google/callback/route.ts`, `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/google/mobile/route.ts`, and `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/apple/mobile/route.ts` currently create OAuth profiles with `new Date('2000-01-01')`.

- Observation: treating `2000-01-01` as globally invalid would break legitimate users born on January 1, 2000.
  Evidence: the database schema requires a non-null `dateOfBirth`, so historical OAuth users can already have that stored value and there is no existing persisted “this DOB was auto-filled” marker.

- Observation: a root-layout client gate that calls `useSearchParams()` must be wrapped in `Suspense` under Next.js 16 or static prerendering fails on `/_not-found`.
  Evidence: `npm run build` in `/Users/elesesy/StudioProjects/mvp-site` failed with `useSearchParams() should be wrapped in a suspense boundary at page "/404"` until the gate and completion page were wrapped in suspense boundaries.

## Decision Log

- Decision: drive the gate from a backend auth/session flag named `requiresProfileCompletion` instead of relying on client-only heuristics.
  Rationale: the server can see both the profile fields and whether the account is Google-linked or Apple-linked, which is necessary to distinguish a legacy OAuth placeholder DOB from a legitimate birth date.
  Date/Author: 2026-04-10 / Codex

- Decision: keep the database schema non-null for `UserData.dateOfBirth` and normalize new unknown OAuth birthdays to `Date(0)` instead of changing the Prisma field to nullable.
  Rationale: this avoids a high-risk schema migration across many age-dependent paths while aligning new placeholder data with the server’s existing `isUnknownDateOfBirth` helper.
  Date/Author: 2026-04-10 / Codex

- Decision: add a dedicated completion screen on both clients instead of overloading the full profile settings page.
  Rationale: the user asked for a second page immediately after registration and again at startup; a narrow, mandatory form is simpler to gate and easier to explain than dropping the user into the full profile editor.
  Date/Author: 2026-04-10 / Codex

- Decision: persist `requiredProfileFieldsCompletedAt` on `UserData` and `googleSubject` on `AuthUser`.
  Rationale: the timestamp lets the server distinguish legacy OAuth records that still carry the old `2000-01-01` placeholder from genuinely completed profiles, while `googleSubject` makes Google and Apple accounts symmetrical for profile-completion checks.
  Date/Author: 2026-04-10 / Codex

- Decision: expose both `requiresProfileCompletion` and `missingProfileFields` in auth/session responses.
  Rationale: the boolean is the stable gate, while the field list lets the completion UI explain exactly what is missing without duplicating server rules on each client.
  Date/Author: 2026-04-10 / Codex

## Outcomes & Retrospective

The feature shipped with the server as the single source of truth for missing required profile fields. Both repositories now block signed-in OAuth users behind a dedicated completion form until first name, last name, and date of birth are saved. The implementation avoided a risky nullable-DOB migration by reusing the server’s unknown-DOB handling, adding a completion timestamp for legacy placeholder detection, and keeping the mobile cache schema unchanged.

The one integration issue discovered during verification was a Next.js 16 static-rendering requirement around `useSearchParams()`. Wrapping the new gate and the completion page in suspense boundaries resolved that cleanly without changing the user-facing flow.

## Context and Orientation

There are two repositories involved.

The website and backend contract live in `/Users/elesesy/StudioProjects/mvp-site`. Google website OAuth starts in `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/google/start/route.ts` and completes in `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/google/callback/route.ts`. Mobile Google OAuth uses `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/google/mobile/route.ts`. Mobile Apple OAuth uses `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/apple/mobile/route.ts`. Session restoration for both clients comes from `/Users/elesesy/StudioProjects/mvp-site/src/app/api/auth/me/route.ts`. The website stores auth state in `/Users/elesesy/StudioProjects/mvp-site/src/app/providers.tsx`, has its main profile editor in `/Users/elesesy/StudioProjects/mvp-site/src/app/profile/page.tsx`, and uses `/Users/elesesy/StudioProjects/mvp-site/src/lib/userService.ts` to patch profile data through `/Users/elesesy/StudioProjects/mvp-site/src/app/api/users/[id]/route.ts`.

The mobile app lives in `/Users/elesesy/StudioProjects/mvp-app`. Authentication flows are managed by `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`, rendered by `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.kt`, and routed by `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/RootComponent.kt` plus `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/App.kt`. Existing profile details editing lives in `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/profileDetails/`.

The important constraint is that the mobile `UserData` cache does not hold a birth date, while the website `UserData` type does. Because of that mismatch, startup enforcement must come from the server auth/session contract rather than the mobile cache alone.

## Plan of Work

First, add a server helper in `mvp-site` that decides whether a signed-in account still needs profile completion. The helper must accept the public profile fields plus the auth linkage markers that identify Google-linked or Apple-linked accounts. It must return `true` when first name or last name is blank, when date of birth is unknown, and when a legacy OAuth-linked account still has the old `2000-01-01` placeholder. Update the JSON auth routes in `mvp-site` so `POST /api/auth/login`, `POST /api/auth/google/mobile`, `POST /api/auth/apple/mobile`, `POST /api/auth/register`, and `GET /api/auth/me` include `requiresProfileCompletion` and `missingProfileFields` alongside the existing `profile`. While touching the OAuth creation routes, replace the placeholder birthday for newly created OAuth users with `new Date(0)` so future “missing DOB” records match the existing server-side unknown-DOB rule. Persist `requiredProfileFieldsCompletedAt` when those required fields are fully present, and add `googleSubject` so Google-backed accounts can be recognized the same way Apple-backed accounts already are.

Next, update the website client. Extend `src/lib/auth.ts` and `src/app/providers.tsx` so the provider stores both `requiresProfileCompletion` and `missingProfileFields` as part of the authenticated app state. Add a dedicated page at `/Users/elesesy/StudioProjects/mvp-site/src/app/complete-profile/page.tsx`. This page must require authentication, show only the required fields, validate that date of birth is a real date in `YYYY-MM-DD` format, patch the current user through `userService.updateProfile`, refresh session state from the backend, and then return the user to the original destination or the normal home page. Add a small client gate component under `src/components/auth/` and mount it from `src/app/layout.tsx`. That gate must redirect authenticated users with `requiresProfileCompletion === true` to `/complete-profile` and keep doing so on later startups until the provider state becomes complete. Because the gate and page use search params from the App Router, they must be wrapped in suspense boundaries to keep static prerendering valid.

Finally, update the mobile app. Extend `AuthResponseDto` in `mvp-app` with `requiresProfileCompletion` plus `missingProfileFields`. Add repository state in `UserRepository` and `IUserRepository` so the root router can observe whether completion is still required after login or startup. Add a dedicated mobile completion component and screen under a new package, wire it through Koin in `ComponentModule.kt`, register a new `AppConfig` entry, and render it from `App.kt`. The screen should collect first name, last name, and date of birth, using the existing platform date picker. Add a dedicated repository method that sends those fields through `PATCH /api/users/{id}` and clears the profile-completion flag on success. Update `RootComponent` so successful auth or startup routes to this screen before any deep link or default tab when the repository says completion is still required, and so the app automatically leaves the completion route once the repository state flips back to complete.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` when editing the website/backend and from `/Users/elesesy/StudioProjects/mvp-app` when editing the mobile app.

For the server and website:

    cd /Users/elesesy/StudioProjects/mvp-site
    pnpm test -- --runInBand src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts src/app/__tests__/providers.test.tsx

Executed during implementation:

    cd /Users/elesesy/StudioProjects/mvp-site
    npm test -- --runInBand src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts src/app/api/auth/google/mobile/__tests__/googleMobileRoute.test.ts src/app/api/auth/apple/mobile/__tests__/appleMobileRoute.test.ts src/app/api/users/__tests__/userByIdRoute.test.ts src/app/__tests__/providers.test.tsx
    npm run build

For the mobile app:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:testDebugUnitTest

Executed during implementation:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest"

## Validation and Acceptance

The change is complete when these behaviors are all observable.

On the website, create or log in to an OAuth-backed account that is missing first name, last name, or date of birth. After authentication succeeds, the browser must land on `/complete-profile` instead of the normal destination. Refreshing the page, closing the tab, or opening the site again while still logged in must return to `/complete-profile` until the form is saved. After saving valid values, the user must continue to their original destination or normal home page.

On mobile, authenticate through Google or Apple with an account that the backend marks as incomplete. After the auth request succeeds, the next route shown by `RootComponent` must be the new completion screen. Killing and relaunching the app while the auth token is still valid must show the completion screen again. After submitting valid values, the repository must clear the completion flag and the root router must continue to the normal home or deep-link target.

The server acceptance proof is that the JSON payload from `/api/auth/me` includes `requiresProfileCompletion: true` for an incomplete OAuth account and `false` after the completion form is saved.

Verification results:

- `npm test -- --runInBand src/app/api/auth/__tests__/authRoutes.test.ts src/app/api/auth/google/__tests__/googleOauthRoutes.test.ts src/app/api/auth/google/mobile/__tests__/googleMobileRoute.test.ts src/app/api/auth/apple/mobile/__tests__/appleMobileRoute.test.ts src/app/api/users/__tests__/userByIdRoute.test.ts src/app/__tests__/providers.test.tsx` passed in `/Users/elesesy/StudioProjects/mvp-site` after updating route and provider expectations.
- `npm run build` passed in `/Users/elesesy/StudioProjects/mvp-site` after wrapping the gate and completion page in suspense boundaries.
- `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.UserRepositoryAuthTest"` passed in `/Users/elesesy/StudioProjects/mvp-app`.

## Idempotence and Recovery

The website completion page and the mobile completion screen should be safe to submit more than once; each submission is a normal profile patch and simply overwrites the required fields. Redirect logic must use `replace`-style navigation so repeated startups do not build a back stack of completion pages. If a save fails halfway, the auth session must remain valid and the user must stay on the completion form so they can retry.

Because the database schema is not changing in `mvp-site`, recovery is limited to retrying the code change and rerunning tests. The mobile app’s local Room cache is versioned separately and is not expected to need a schema migration for this feature because the completion state is not being stored in the Room entity.
Because the `mvp-site` database schema now changes, recovery requires applying or rolling back the Prisma migration that adds `requiredProfileFieldsCompletedAt` and `googleSubject`, then rerunning the auth tests/build. The mobile app’s local Room cache is still version-agnostic for this feature because the completion state is not being stored in the Room entity.

## Artifacts and Notes

Expected auth-session shape after the backend change:

    {
      "user": { "id": "user_123", "email": "player@example.com", "name": "Player Example" },
      "session": { "userId": "user_123", "isAdmin": false },
      "token": "<signed token>",
      "profile": { "...": "existing public user fields" },
      "requiresProfileCompletion": true,
      "missingProfileFields": ["dateOfBirth"]
    }

Expected website flow after completion:

    /discover  -> redirected to /complete-profile?next=%2Fdiscover
    save valid first name, last name, and birthday
    redirected back to /discover

## Interfaces and Dependencies

In `/Users/elesesy/StudioProjects/mvp-site/src/server/`, define a small helper module that exports a function with a stable signature equivalent to:

    buildProfileCompletionState(profile, authUser): { requiresProfileCompletion: boolean, missingProfileFields: string[] }

The `profile` input must include `firstName`, `lastName`, `dateOfBirth`, and `requiredProfileFieldsCompletedAt`. The `authUser` input must include `googleSubject` and `appleSubject` so the helper can detect legacy OAuth placeholders.

In `/Users/elesesy/StudioProjects/mvp-site/src/lib/auth.ts`, extend the `fetchSession` return type to include:

    requiresProfileCompletion: boolean
    missingProfileFields: RequiredProfileField[]

In `/Users/elesesy/StudioProjects/mvp-site/src/app/providers.tsx`, extend the app context with:

    requiresProfileCompletion: boolean
    missingProfileFields: RequiredProfileField[]

In `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt`, extend `AuthResponseDto` with:

    val requiresProfileCompletion: Boolean? = null
    val missingProfileFields: List<String> = emptyList()

In `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`, extend `IUserRepository` and `UserRepository` with:

    val requiredProfileCompletionState: StateFlow<RequiredProfileCompletionState>
    suspend fun completeRequiredProfile(firstName: String, lastName: String, dateOfBirth: String): Result<UserData>

In `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/AppConfig.kt`, add a new route entry for the required-profile screen, then mirror it in `RootComponent.Child` and `AppContent`.

Revision note: created this ExecPlan after auditing both repositories so implementation could proceed without a second design pass. The main reason for the plan is that the feature crosses two repos and three auth surfaces (web Google OAuth, mobile Google OAuth, mobile Apple OAuth), so the shared server contract must be explicit.
