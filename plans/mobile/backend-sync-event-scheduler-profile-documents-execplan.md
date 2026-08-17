# Sync mobile app with backend event scheduler and profile documents

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`PLANS.md` exists at the repository root and this plan must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, the mobile app will align with current backend contracts for event creation/scheduler payloads and will expose profile-level document handling. Users will be able to open Profile and manage required/signed documents, and event updates will no longer clear backend-required template assignments unintentionally. The result is visible by running the app, opening Profile, entering the new Documents section, and by running DTO tests that prove event template ids are preserved in update payloads.

## Progress

- [x] (2026-02-17 17:19Z) Audited backend `mvp-site` Prisma + API + staged changes and identified mobile drift areas.
- [x] (2026-02-17 17:27Z) Implemented event/team data contract sync in shared Kotlin models and DTO mapping (event template-id preservation fix, `registrationByDivisionType`, `minAge`/`maxAge`, team manager/coach/parent ids).
- [x] (2026-02-17 17:33Z) Implemented Profile Documents state/actions/navigation/UI flow (home action, stack routing, unsigned/signed cards, PDF open, text-sign confirm dialog, signed text preview).
- [x] (2026-02-17 17:35Z) Added/adjusted regression tests and fakes (`EventDtosTest`, `BillingRepositoryHttpTest`, `CreateEvent_FakeBillingRepository`).
- [x] (2026-02-17 17:39Z) Ran focused and full `composeApp` debug unit tests; both passed.
- [x] (2026-02-17 17:54Z) Removed legacy `fieldType/type` usage from event/field domain + event create/detail/map/search UI and API payloads.
- [x] (2026-02-17 18:04Z) Added Android Room migration `80 -> 81`, generated `81.json` schema, revalidated compile/tests, and stopped the auto-started local backend process.

## Surprises & Discoveries

- Observation: Mobile `Event.toUpdateDto()` always emits `requiredTemplateIds = []` when override is not provided.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` currently defaults `requiredTemplateIdsOverride` to `emptyList()` instead of event state.
- Observation: Backend now has a dedicated `/api/profile/documents` route that returns both unsigned/signed document cards with signer context metadata.
  Evidence: `mvp-site/src/app/api/profile/documents/route.ts`.
- Observation: `:composeApp:testDebugUnitTest` auto-starts the local backend (`next dev`) on port `3000` and can leave the process running if not explicitly stopped/killed.
  Evidence: Gradle task output from `startLocalBackend` during test runs.
- Observation: This project does not expose `:composeApp:roomGenerateSchema`; schema snapshots are produced via KSP + `copyRoomSchemas` during Android compile/test tasks.
  Evidence: Gradle task listing and successful `copyRoomSchemas` execution during `:composeApp:testDebugUnitTest`.

## Decision Log

- Decision: Keep existing field-type UI surface for now but sync backend-critical data contracts first (templates/docs/scheduler-safe payload fields). (Superseded by follow-up cleanup decision below.)
  Rationale: Field-type removal on backend is backward-compatible in current routes, while document handling and template-id preservation are correctness-critical for immediate correctness.
  Date/Author: 2026-02-17 / Codex.
- Decision: Follow up in the same execution with full legacy `fieldType/type` removal and a non-destructive Room migration.
  Rationale: Backend and Prisma now removed these columns; completing cleanup now avoids model drift and prevents future contract regressions while preserving installed app data via migration.
  Date/Author: 2026-02-17 / Codex.
- Decision: Implement profile document fetch/sign/view in `IBillingRepository` instead of introducing a new repository abstraction.
  Rationale: Profile already depends on billing repository; this keeps DI and feature wiring minimal while remaining testable.
  Date/Author: 2026-02-17 / Codex.
- Decision: Render signed text documents in-app via dialog preview while routing PDF documents through WebView.
  Rationale: Backend response already includes text content for TEXT templates; direct preview avoids unnecessary URL plumbing and keeps the flow symmetric with unsigned text-sign prompts.
  Date/Author: 2026-02-17 / Codex.

## Outcomes & Retrospective

Completed in one pass:

- Event/team contract sync shipped in shared models + network DTO mappings.
- Profile Documents flow shipped end-to-end in profile feature (navigation, fetching, signing, viewing).
- Regression coverage updated for event template-id preservation and profile-documents API parsing.
- Legacy event/field `fieldType/type` was removed across shared models, event create/detail/search/map UI, and field patch payloads.
- Room schema was safely migrated from `80` to `81` with explicit Android migration and generated schema snapshot (`composeApp/schemas/com.razumly.mvp.core.data.MVPDatabaseService/81.json`).
- Validation executed:
  - `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.EventDtosTest" --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"` (PASS)
  - `./gradlew :composeApp:testDebugUnitTest` (PASS)
  - `./gradlew :composeApp:compileDebugUnitTestKotlinAndroid` (PASS)
  - `./gradlew :composeApp:stopLocalBackend` (PASS; cleaned background `next dev`)

## Context and Orientation

The mobile shared app lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp`. Event request/response mapping is centered in `core/network/dto/EventDtos.kt` and canonical event models are in `core/data/dataTypes/Event.kt` plus `core/data/dataTypes/dtos/EventDTO.kt`. Profile navigation/state is in `profile/ProfileComponent.kt`, the profile home grid is `profile/ProfileHomeScreen.kt`, stack rendering is `profile/ProfileScreen.kt`, and feature screens are in `profile/ProfileFeatureScreens.kt`.

Backend source of truth is in `/home/camka/Projects/MVP/mvp-site`. Recent backend work introduced `/api/profile/documents`, free-agent route changes, and scheduler normalization behavior. The mobile change needed immediately is to preserve backend required template ids during event updates and to expose profile document handling in app UI.

## Plan of Work

First, update event model and DTO mapping so backend-required template ids are represented in the `Event` domain object and included in outbound update payloads unless explicitly overridden. At the same time, add additional backend contract fields that are now persisted and should be round-trippable.

Second, extend billing repository API with a profile-document list call that maps `/api/profile/documents` into strongly typed shared models and add helper conversion for signer context.

Third, extend profile component state and navigation with a Documents child screen. Add actions to refresh documents, start signing unsigned documents, confirm text signatures, and open signed documents. Reuse existing signing infrastructure (`getRequiredSignLinks`, `recordSignature`, `UrlHandler.openUrlInWebView`) to keep behavior consistent with event detail flow.

Fourth, add/update tests for DTO behavior and any new repository parsing helpers, then run focused unit tests.

## Concrete Steps

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Edit model/DTO files:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`

2. Edit billing/profile files:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileHomeScreen.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileScreen.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`

3. Update tests:
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/EventDtosTest.kt`
   - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventTestFixtures.kt`
   - Add repository/DTO tests if needed for profile document mapping.

4. Run:
   - `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.network.dto.EventDtosTest"`
   - `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest"`
   - If stable, `./gradlew :composeApp:testDebugUnitTest`

## Validation and Acceptance

Acceptance is achieved when:

- Event DTO tests show `requiredTemplateIds` are preserved from event state and trimmed/deduplicated when overridden.
- Profile feature exposes a Documents section that displays unsigned and signed document cards from API response.
- Unsigned text documents can be confirmed (records signature) and unsigned PDF documents open in web view.
- Signed PDF documents open via `viewUrl` and signed text documents show content in-app.
- Focused unit tests pass for modified DTO/repository/profile logic.

## Idempotence and Recovery

All edits are additive and source-controlled. Re-running tests is safe. If API parsing mismatches appear, rollback is straightforward by reverting modified files and re-running focused tests to confirm baseline behavior.

## Artifacts and Notes

Primary proof artifacts will be:

- Test output for `EventDtosTest` and billing/profile mapping tests.
- Updated profile navigation/action files showing document handling flow.
- DTO diff showing corrected `requiredTemplateIds` behavior.

## Interfaces and Dependencies

The following interfaces must exist and compile after this work:

- `IBillingRepository` gains profile document listing support returning a typed unsigned/signed payload.
- `ProfileComponent` gains document state and actions (`navigateToDocuments`, refresh/sign/view helpers, text signature confirm/dismiss).
- Event mapping function `Event.toUpdateDto(...)` preserves event-level required template ids when override is absent.

The existing dependencies remain unchanged: Ktor client + Kotlinx serialization for transport, Decompose for profile navigation, and shared `UrlHandler` for opening signing/view URLs.

Revision note (2026-02-17 17:19Z): Initial execution plan created after backend/mobile drift analysis to drive implementation and testing in one pass.
Revision note (2026-02-17 17:39Z): Marked implementation complete with profile documents UI, contract sync updates, regression tests, and passing debug unit suite.
Revision note (2026-02-17 18:04Z): Executed second sync pass to remove legacy `fieldType/type`, add Room `80 -> 81` migration, generate schema v81, and revalidate build/tests.
