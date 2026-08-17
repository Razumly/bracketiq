# Child Claim Signup Profile Conflict Resolution

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is governed by `PLANS.md` at the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, when someone signs up with an email that already belongs to a child account created by a parent and that account has no usable password yet, signup will continue instead of hard-failing. If the profile fields from the new signup differ from the existing child profile, the app will present a conflict prompt so the signer can choose which values to keep. Once chosen, registration completes and the account is claimed with a real password.

This is user-visible in the signup flow: same-email signup for claimable child accounts no longer fails when profile values differ, and the user sees an explicit “keep existing vs keep entered values” prompt.

## Progress

- [x] (2026-02-20 06:05Z) Located failing area and confirmed current signup path (`composeApp` register call plus backend `api/auth/register`) has no conflict-selection contract.
- [x] (2026-02-20 06:05Z) Added client DTO scaffolding for conflict responses and selection payload in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt`.
- [x] (2026-02-20 06:42Z) Implemented typed repository support: `SignupProfileConflictException`, conflict parsing from 409 API body, and selection payload wiring in `UserRepository.createNewUser`.
- [x] (2026-02-20 06:42Z) Implemented auth component conflict state, pending signup storage, and retry callbacks.
- [x] (2026-02-20 06:42Z) Implemented signup conflict UI in `AuthScreen` with per-field keep-existing/keep-entered selection and retry action.
- [x] (2026-02-20 06:42Z) Updated backend register route and auth tests for `PROFILE_CONFLICT` response + selected-value retry success.
- [ ] (2026-02-20 06:42Z) Validate with focused app/backend tests and debug assemble (completed: backend route tests pass; remaining: local composeApp Gradle compile/test blocked by unrelated generated-resource/KSP file instability).

## Surprises & Discoveries

- Observation: Backend currently already supports claiming placeholder auth users (`__NO_PASSWORD__`) but auto-updates profile values instead of forcing user selection when values differ.
  Evidence: `mvp-site/src/app/api/auth/register/route.ts` updates existing `userData` fields from incoming request with null-coalescing.

- Observation: Local `composeApp` Gradle verification is unstable in this checkout due unrelated generated files missing during build (`composeResources` png asset and generated KSP `MVPDatabaseCtor.kt`).
  Evidence: `:composeApp:prepareComposeResourcesTaskForCommonMain` failed with missing `android_neutral_rd_SU@1x.png`; repeated `:composeApp:compileDebugKotlinAndroid` failed with `FileNotFoundException` for `composeApp/build/generated/ksp/android/androidDebug/kotlin/com/razumly/mvp/core/data/MVPDatabaseCtor.kt`.

## Decision Log

- Decision: Add conflict handling as an explicit backend/app contract instead of client-only heuristics.
  Rationale: The server owns existing profile truth and must gate account claim atomically with selected values.
  Date/Author: 2026-02-20 / Codex

- Decision: Trigger conflict response only when the client requests enforcement (`enforceProfileConflictSelection=true`) to avoid breaking older clients.
  Rationale: Maintains backward compatibility while enabling the new UX in updated app builds.
  Date/Author: 2026-02-20 / Codex

- Decision: For conflicting fields, backend defaults omitted `profileSelection` field values to existing profile values instead of hard-failing.
  Rationale: Kotlin serialization omits explicit null fields by default in app payloads, so strict “selection field required” checks would incorrectly reject valid “keep existing” choices when existing value is null.
  Date/Author: 2026-02-20 / Codex

## Outcomes & Retrospective

App and backend implementation for claim-signup conflict resolution is complete. Backend behavior is validated by passing route tests that cover conflict response and successful selected-value claim. App-side verification is partially blocked by unrelated local build instability in generated resources/KSP outputs, so final Android assemble/test pass could not be confirmed in this environment.

## Context and Orientation

The app signup flow is implemented in `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthComponent.kt` and UI in `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.kt`. The repository method that calls register is `IUserRepository.createNewUser` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`. DTOs for auth routes are defined in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt`.

The backend source of truth for registration is `mvp-site/src/app/api/auth/register/route.ts`. Backend auth tests live in `mvp-site/src/app/api/auth/__tests__/authRoutes.test.ts`.

“Claim signup” means the flow where an existing child account can be activated by setting a password using the same email. “Conflict” means at least one of `firstName`, `lastName`, `userName`, or `dateOfBirth` differs between existing profile and signup submission.

## Plan of Work

First, extend the app repository layer with a typed exception for signup profile conflicts and request options for field selection. The repository will send `enforceProfileConflictSelection=true` on initial signup and, on retry, include `profileSelection` for the chosen values. If the backend replies with HTTP 409 and conflict payload, the repository will throw the typed conflict exception.

Second, extend `AuthComponent` to preserve pending signup input, expose conflict state, and add a resolver callback that retries signup with the selected profile values.

Third, update `AuthScreen` to render a lightweight conflict prompt with per-field choice controls for each differing field, then call the resolver.

Fourth, update backend register route to compute diffs for claimable-existing profiles when enforcement is requested. If differences exist and no selection was provided yet, return structured 409 conflict payload. If selection is provided, update profile using selected values and complete registration atomically.

Finally, update tests in both repos for new contract/behavior and run focused validation commands.

## Concrete Steps

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Update app repository/auth UI/component files for conflict handling.
2. Run `./gradlew :composeApp:testDebugUnitTest --tests "*UserRepositoryAuthTest*"`.
3. Run `./gradlew :composeApp:assembleDebug`.

From `/home/camka/Projects/MVP/mvp-site`:

1. Update `src/app/api/auth/register/route.ts` and `src/app/api/auth/__tests__/authRoutes.test.ts`.
2. Run `npm test -- authRoutes.test.ts` (or repo-standard equivalent) to validate the new 409 conflict contract and successful selection retry.

Expected observable behavior:

- Initial signup to claimable child account with differing fields returns 409 conflict payload (when enforcement flag is true).
- UI shows existing vs entered values and allows selection.
- Submit selection succeeds with 201 and returns auth token + resolved profile.

## Validation and Acceptance

Acceptance requires all of the following:

1. App build succeeds for debug variant after changes.
2. App-side auth repository tests pass with at least one new/updated test covering conflict parsing and retry path.
3. Backend auth route tests pass with at least one new test verifying 409 payload and one new test verifying selected-value registration success.
4. Manual behavior (or deterministic test) demonstrates: same email + claimable child account + differing profile fields leads to conflict selection, then successful signup.

## Idempotence and Recovery

All changes are additive and idempotent. Re-running tests/build should produce the same results.

If app-side build fails due unrelated workspace edits, isolate with targeted tests and report unaffected paths. If backend tests fail due environment differences, rerun the single auth test file and capture exact failing assertion.

## Artifacts and Notes

Validation evidence collected:

- `npm test -- src/app/api/auth/__tests__/authRoutes.test.ts` from `/home/camka/Projects/MVP/mvp-site` passed with 12/12 tests, including new conflict cases.
- `./gradlew --no-daemon :composeApp:compileDebugKotlinAndroid ...` in `/mnt/c/Users/samue/StudioProjects/mvp-app` repeatedly failed due pre-existing generated file issues unrelated to auth changes.

## Interfaces and Dependencies

The app side will expose these stable interfaces by the end of this plan:

- `IUserRepository.createNewUser(..., profileSelection: SignupProfileSelection? = null): Result<UserData>`
- `SignupProfileConflictException` carrying differing fields and snapshots.
- `AuthComponent` conflict state and resolver methods used by `AuthScreen`.

The backend register route will accept these request keys:

- `enforceProfileConflictSelection?: boolean`
- `profileSelection?: { firstName?: string; lastName?: string; userName?: string; dateOfBirth?: string }`

The backend conflict response shape will include:

- `error`, `code`, and `conflict` with `fields`, `existing`, and `incoming` snapshots.

---

Plan revision note (2026-02-20 06:42Z): Updated plan after implementation to mark completed milestones, record validation evidence, and document current local composeApp build blockers.
