# Require canonical API fields in current mobile clients

This ExecPlan is a living document maintained according to `PLANS.md` at the repository root. It completes the mobile-client portion of cross-repository audit finding LEG-001 after `mvp-site` stopped emitting Appwrite-style `$id`, `$createdAt`, and `$updatedAt` response aliases.

## Purpose / Big Picture

Android, iOS, Wear OS, and watchOS currently decode canonical `id` fields but still carry pre-1.6.13 response aliases and often choose `id ?: legacyId`. After this work, current clients use the one canonical web contract, malformed responses cannot acquire an empty or obsolete identity, and outgoing billing references use canonical names. The supported v1.6.13 client remains compatible because its existing canonical-only fixture already passed against the new server contract; this plan changes only current client source.

## Progress

- [x] (2026-07-14 15:06Z) Created isolated worktree `/private/tmp/mvp-app-leg001-mobile` on branch `codex/leg001-mobile-canonical` from canonical audit commit `abb2c982`.
- [x] (2026-07-14 15:06Z) Read `AGENTS.md`, `PLANS.md`, the site LEG-001 contract inventory and ExecPlan, and the current AUD-004/AUD-008 ownership boundaries.
- [x] (2026-07-14 15:06Z) Confirmed AUD-004 currently owns `DefaultEventDetailComponent.kt`, the new `EventParticipantBootstrapCoordinator.kt`, its common test, and `plans/aud-004-mobile-responsibility-decomposition-execplan.md`; those files are excluded. The AUD-008 Google button artwork and selector paths are also excluded.
- [x] (2026-07-14 15:17Z) Removed dollar-prefixed aliases from current shared DTOs, domain models used for response decoding, and repository-private response models while retaining canonical validation.
- [x] (2026-07-14 15:17Z) Removed the same aliases from Wear OS DTOs and watchOS Codable models; optimistic segment and incident operations now use canonical `id` only.
- [x] (2026-07-14 15:17Z) Added canonical-only and legacy-only rejection coverage. Shared DTO tests, targeted Billing/User/Match/Chat tests, all Wear JVM tests, and a 10-source watchOS Swift type-check pass.
- [ ] Compile iOS, assemble Android debug, run Wear tests and a complete-source watchOS Swift type-check, and record exact evidence.
- [ ] Commit the bounded mobile slice without pushing or editing the audit ledger.

## Surprises & Discoveries

- Observation: four `$id` DTO properties in `core/network/.../BillingDtos.kt` are outbound purchase/refund references rather than response models.
  Evidence: every constructor is in `BillingRepository.kt`; most already set `id`, but two paths still set only `legacyId`. The client can remove those aliases by sending the canonical `id` property without changing endpoint behavior.

- Observation: match segment and incident aliases live in shared domain models as well as network DTOs.
  Evidence: optimistic phone and watch score appliers compare and copy `legacyId`. These are not separate identities; canonical `id` already carries the operation or server identity, so the appliers must update `id` directly instead of retaining a second serialized field.

- Observation: the first targeted billing run correctly exposed one stale compatibility fixture rather than a production regression.
  Evidence: `BillingRepositoryHttpTest.listOrganizationTemplates_gets_and_maps_response` still expected a `$id`-only template to map. The fixture now contains two canonical rows plus one obsolete-alias-only row and verifies that only the canonical rows survive; the targeted rerun passed.

## Decision Log

- Decision: remove only HTTP compatibility aliases, not unrelated product fallbacks such as display labels or the non-null local event end used by the current Room model.
  Rationale: the validated web contract guarantees canonical identity and timestamps. Changing unrelated presentation or persistence semantics would expand LEG-001 beyond the proved contract.
  Date/Author: 2026-07-14 / Codex

- Decision: keep response DTO identity properties nullable at decode boundaries where existing conversion APIs intentionally return null, but make every resolver use canonical `id` only and add strict collection/context tests where the repository already supports them.
  Rationale: this removes legacy success paths without turning an alias cleanup into a public DTO constructor migration. Required response rows still fail existing `toXOrThrow` or repository validation; optional embedded rows remain explicitly nullable.
  Date/Author: 2026-07-14 / Codex

- Decision: exclude every active AUD-004 event-detail orchestration path and AUD-008 Google artwork path.
  Rationale: the worktrees share history and will be reconciled later; non-overlapping files keep each audit checkpoint independently cherry-pickable.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Shared, Wear OS, and watchOS implementation is complete and focused validation is green. Full shared tasks, the iOS simulator compile, and the Android debug assembly remain before this mobile slice can close.

## Context and Orientation

The mobile repository is Kotlin Multiplatform. Shared wire models are in `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto`; Room/domain models are in `core/model`; repository-private wire models are in `core/repository-impl`. Wear OS has a separate Ktor DTO layer in `wearApp/src/main/java/com/razumly/mvp/wear/data/WearDtos.kt`. watchOS uses Swift `Codable` models in `iosApp/watchApp/WatchOfficialModels.swift`.

The authoritative server is the isolated site branch at `/private/tmp/mvp-site-leg001`. Its validated responses use `id`, `createdAt`, and `updatedAt` only and preserve `end: null` for open-ended events. Current mobile code still contains dollar-prefixed serializer aliases in event, team, match, user, organization, facility, sport, chat, billing, family, Wear OS, and watchOS records. Outgoing billing reference DTOs also retain `$id`; their constructors can send canonical `id` instead.

AUD-004 is concurrently extracting event-detail orchestration in `/private/tmp/mvp-app-aud004-next`. Do not edit its component/coordinator/test or plan. AUD-008 concerns only Google button artwork/resources and must remain untouched. This LEG-001 worktree starts at `abb2c982`, which already includes the completed AUD-004 relation-state checkpoint.

## Plan of Work

First remove `@SerialName("\$id")`, `@SerialName("\$createdAt")`, and `@SerialName("\$updatedAt")` from shared network and model types. Update conversion functions to validate canonical fields only. Change the two outbound billing builders that populate `legacyId` to populate `id`. In repository-private billing, family, chat, and match mappings, remove each fallback and keep existing null/error handling. In optimistic match appliers, use the one canonical segment or incident `id` for matching and copies.

Next remove the seven Wear OS alias properties and seven watchOS alias properties. Keep existing `resolvedId` APIs where they reduce call-site churn, but make them normalize canonical `id` only. Update demo constructors and local score-operation copies to set `id`.

Extend the shared network contract test so canonical-only event, team, match, user, organization, field, sport, and chat records decode, while legacy-only records cannot map to domain objects. Exercise repository HTTP fixtures for billing, rentals, family, and chat. Compile all call sites to catch constructor changes, then run platform validation serially.

## Concrete Steps

Run from `/private/tmp/mvp-app-leg001-mobile` with JDK 17:

    rg -n -F '@SerialName("\$' core composeApp wearApp --glob '*.kt' --glob '!**/build/**'
    rg -n -F 'case legacyId = "$id"' iosApp/watchApp --glob '*.swift'
    ./gradlew :core:network:testDebugUnitTest --tests 'com.razumly.mvp.core.network.dto.*'
    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest' --tests 'com.razumly.mvp.core.data.repositories.UserRepositoryHttpTest'
    ./gradlew :core:network:testDebugUnitTest :core:repository-impl:testDebugUnitTest :composeApp:testDebugUnitTest
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :wearApp:testDebugUnitTest
    ./gradlew :composeApp:assembleDebug
    git diff --check

Use the existing watchOS audit command or `xcrun swiftc -typecheck` with every production source required by `WatchOfficialModels.swift`; record its exact source count and result after running it.

## Validation and Acceptance

Acceptance requires canonical-only fixtures to map every resource family used by the current phone client and requires a legacy-only `$id` fixture to fail mapping instead of producing a domain row. Production searches must find no dollar-prefixed aliases or `legacyId` response fallback in shared, Wear OS, or watchOS client code. Any remaining use must be a clearly named historical test fixture; outbound canonical requests must serialize `id` and not `$id`.

The focused and complete shared test tasks must pass. `:composeApp:compileKotlinIosSimulatorArm64`, `:composeApp:assembleDebug`, Wear JVM tests, and the full watchOS Swift type-check must succeed. The diff must not include active AUD-004 or AUD-008 paths.

## Idempotence and Recovery

Searches, tests, and compile tasks are repeatable. Source edits do not change Room schema columns, so no database version or schema regeneration is expected. If removing a domain alias exposes an optimistic-operation call site, copy the operation identity into canonical `id` and preserve sequence-based fallback matching rather than restoring `$id`. Commit shared and wearable slices separately if either platform needs independent correction. Do not reset another worktree, modify the canonical audit branch, push, or edit `mvp-site/docs/code-audit/README.md`.

## Artifacts and Notes

The exact supported-floor evidence is `/private/tmp/mvp-site-leg001/docs/code-audit/leg-001-v1.6.13-contract.md`. The web implementation commits are `39fd524e`, `c1d6791e`, `310a9833`, and validation commit `610a1dd0`. Mobile work starts from `abb2c982`.

## Interfaces and Dependencies

Continue using kotlinx.serialization for Kotlin and `Codable` for watchOS. Do not add a compatibility serializer, a second identity property, another JSON library, or a new cache. Preserve public repository and UI interfaces. `resolvedId()` helpers may remain only as canonical normalization helpers; they must not inspect a legacy field. Domain `id` remains the sole identity passed to Room, matching, scoring operations, and UI models.

Revision note (2026-07-14 15:06Z): created this self-contained mobile continuation after verifying the web contract, inventorying current dollar-prefixed aliases, and excluding the exact active AUD-004/AUD-008 ownership paths.
