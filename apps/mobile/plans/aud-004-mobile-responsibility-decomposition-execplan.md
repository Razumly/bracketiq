# Decompose mobile event detail and repository responsibilities

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

This plan finishes the current-source work required by audit finding AUD-004. It incorporates the completed history in `plans/event-detail-screen-components-execplan.md` and the still-active controller history in `plans/event-detail-component-decomposition-execplan.md`, but it is self-contained for the four files named by the audit and the current Room-first architecture.

## Purpose / Big Picture

The mobile event-detail route and its two central repositories work, but important UI rules, lifecycle bindings, persistence, network mapping, and domain operations remain concentrated in four files that are each several thousand lines. This makes a small change to event registration, cache refresh, billing, or screen presentation require reviewing unrelated workflows and increases the risk of accidentally rendering a one-off network response instead of the durable Room cache.

After this plan is complete, users must see the same event overview, registration, participants, schedule, standings, bracket, editing, checkout, refund, organization, product, and offline behavior on Android and iOS. The implementation will have explicit owners: screen files render immutable presentation state, the Decompose component coordinates lifecycle and existing workflow coordinators, Room stores own cached data, remote gateways own HTTP requests, and repository facades enforce remote-to-Room-to-render ordering.

## Progress

- [x] (2026-07-14 21:45Z) Reconciled AUD-004 against the current audit branch and measured `EventDetailScreen.kt` at 4,137 lines, `DefaultEventDetailComponent.kt` at 3,439 lines, `BillingRepository.kt` at 4,430 lines, and `EventRepository.kt` at 3,398 lines.
- [x] (2026-07-14 21:50Z) Mapped current responsibilities, existing coordinators, Room-first paths, test coverage, and the interaction with in-flight APP-009 membership persistence.
- [ ] Milestone 1: extract the pure stage-selection, weekly-schedule presentation, onboarding/role, primary-action, and match-day rules above `EventDetailScreen()` with direct tests.
- [ ] Milestone 2: split the remaining screen body into typed overview/edit, detail-tab, and overlay/dialog presentation hosts without moving business state into composables.
- [ ] Milestone 3: after APP-009 is integrated, extract event-team check-in, Room-backed relation state, participant hydration, and lifecycle bindings from `DefaultEventDetailComponent` while preserving its public interface and existing coordinators.
- [ ] Milestone 4: mechanically separate repository contracts/public models and private wire DTO mappings from implementation without changing names, serialization, or dependency-injection bindings.
- [ ] Milestone 5: split `EventRepository` behind its existing facade into Room store, remote gateway, participant synchronization, registration mutation, event catalog, and session-cache collaborators.
- [ ] Milestone 6: split `BillingRepository` behind `IBillingRepository` into checkout/signing, rental, bill/payment, discount, catalog, organization/review, and refund collaborators.
- [ ] Milestone 7: run focused and broad Gradle tests, Android assembly/install/cold-launch checks, iOS compilation/tests, and Android/iOS event-detail visual smoke; reconcile AUD-004 only after runtime evidence passes.

## Surprises & Discoveries

- Observation: the event-detail package already has substantial decomposition, so a second component architecture would be counterproductive.
  Evidence: the package contains 74 top-level files, 24 coordinator files, 68 common test files, and roughly 483 event-detail test methods. `DefaultEventDetailComponent` already delegates registration, hydration, membership, participant management, edit drafts, match editing, standings, templates, and billing work to named coordinators.

- Observation: `EventDetailScreen.kt` does not call repositories directly.
  Evidence: the route collects roughly 60 flows from `EventDetailComponent` and invokes component actions. The remaining problem is presentation-rule and local UI ownership, not a direct-network screen path.

- Observation: the repository files mix public contracts, implementations, and private wire models, but their current catalog flows do enforce Room-first behavior.
  Evidence: product and organization refreshes validate a remote response, atomically replace viewer-scoped DAO rows, and re-read the DAO. Event detail refresh persists the event, participants, compliance, fields, and matches before observed state is exposed.

- Observation: APP-009 changes the canonical membership graph used by all three event-detail layers.
  Evidence: `EventRepository.kt` builds `TeamPlayerCrossRef` from `team.playerIds`; `DefaultEventDetailComponent.kt` reads current-user/team membership; `EventDetailScreen.kt` derives tracked teams from `currentUser.teamIds`. Those paths must not be decomposed until APP-009's Room schema and junction ownership are integrated.

- Observation: the pure rules above `EventDetailScreen()` are isolated from APP-009 and are the safest first slice.
  Evidence: they transform event/division/schedule/guide inputs into presentation values and do not own a `StateFlow`, repository, DAO, endpoint, or mutable component state.

## Decision Log

- Decision: continue the existing coordinator architecture and keep `EventDetailComponent`, `IBillingRepository`, and `IEventRepository` source-compatible.
  Rationale: hundreds of tests, screens, fakes, and dependency-injection bindings already depend on these interfaces. Internal collaborators can narrow ownership without a cross-app API migration.
  Date/Author: 2026-07-14 / Codex

- Decision: sequence APP-009 before component or event-repository membership decomposition.
  Rationale: refactoring relation ownership against the old duplicated `teamIds`/`playerIds` representation would either conflict with APP-009 or preserve the exact ambiguity APP-009 removes. The pure screen-rule slice has no file or semantic overlap and may proceed now.
  Date/Author: 2026-07-14 / Codex

- Decision: preserve Room as the rendered-data source and the web API as the remote contract authority.
  Rationale: repositories may refresh from HTTP, but UI-facing state must come from validated data written to and observed or re-read from Room. No collaborator may return an unpersisted remote response as canonical UI state.
  Date/Author: 2026-07-14 / Codex

- Decision: extract complete responsibility families, not arbitrary equal-sized chunks.
  Rationale: line count is a diagnostic. A smaller facade backed by a new catch-all collaborator would not resolve AUD-004. Each file must have one domain reason to change and a direct test boundary.
  Date/Author: 2026-07-14 / Codex

- Decision: keep composables presentational and lifecycle-free unless an existing Decompose component already owns that lifecycle.
  Rationale: state flows, repositories, and long-lived coroutine jobs belong to components/coordinators. Screen hosts receive immutable state and callbacks so Android and iOS render the same authoritative state.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Research and sequencing are complete. Implementation has not started under this plan. Existing event-detail extraction work is retained and will be finished rather than rewritten. The first slice is deliberately pure and APP-009-independent; component and repository milestones remain gated on the membership migration landing cleanly.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-app-critical-audit` on the current audit branch. This is a Kotlin Multiplatform app. Shared Compose UI and Decompose components live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. Shared repository implementation lives under `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/`. Room is the local SQL database and source of truth for fetched data. Ktor is the HTTP client. The backend contract is the `mvp-site` repository at `/Users/elesesy/StudioProjects/mvp-site`.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` is the Compose route. It currently contains pure division/stage/weekly/guide/role rules, collects component flows, owns transient tab/dialog UI state, derives presentation, and hosts overview, edit, tab, sticky-dock, and overlay content. It does not fetch data directly.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt` is the concrete Decompose component. A Decompose component is a lifecycle-aware object that exposes observable state and actions to a screen. This component assembles existing coordinators, binds Room observation and lifecycle collectors, refreshes event details and participants, owns realtime subscriptions, and delegates registration, billing, editing, publication, match, and participant actions.

`core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` implements event cache observation, remote hydration, event CRUD/search, participants/compliance, registration, standings, schedule, staff, deletion, and session-scoped cache behavior. `getEventWithRelationsFlow()` observes Room. Refresh paths call the server, validate/map the response, persist Room rows and relations, and then expose or re-read Room state.

`core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` contains `IBillingRepository`, public billing models, the implementation for checkout/rentals/signing/bills/payments/subscriptions/products/discounts/organizations/reviews/refunds, and private wire DTOs/mappers. Catalog refresh paths use viewer-scoped atomic DAO replacement and DAO re-read; this invariant must remain explicit after extraction.

A facade is the existing public class/interface that remains stable while delegating to internal collaborators. A remote gateway owns request/response mechanics but does not decide rendered state. A Room store owns DAO transactions and cached reads/writes. A synchronization collaborator validates remote data and commits all related Room rows before the facade reports success.

## Plan of Work

Milestone 1 moves only pure functions currently above `EventDetailScreen()` into three files in the same package. Create `EventDetailStageSelection.kt` for canonical division, playoff, pool, bracket, and selected-stage rules. Create `EventDetailWeeklySchedulePresentation.kt` for `WeeklySessionOption`, weekly-session construction, schedule labels, and 12-hour time formatting. Create `EventDetailScreenRules.kt` for onboarding-guide requirements, primary-action/role visibility, schedule-management visibility, and first-match-day detection. Keep existing function names, signatures, package visibility, and behavior. Add missing tests for `playoffDivisionIdsForSelection`, `buildWeeklySessionOptions`, and `isFirstMatchDayForTrackedUsers`. Do not touch any APP-009 model, DAO, Room schema, relation, or repository file in this milestone.

Milestone 2 divides the screen body into three render owners. An overview/edit host receives immutable overview and edit state plus callbacks. A detail-tab host receives the selected tab, division/stage models, and tab-specific state/actions. An overlay/dialog host receives transient dialog state and actions. `EventDetailScreen()` remains the route boundary that collects flows and owns route-local UI selection. Extracted composables do not collect repositories or duplicate business state. Existing state/action containers and section files should be extended rather than replaced.

Milestone 3 begins only after APP-009 is integrated and its migrations/tests pass. Extract event-team check-in execution into a coordinator, relation derivation into a Room-backed state graph, participant/bootstrap work into a hydration controller, and the large lifecycle collector block into narrow lifecycle bindings. Existing coordinators remain the sole owners of their mutable state. `DefaultEventDetailComponent` retains constructor and interface compatibility and becomes responsible for assembly, public state exposure, and delegation.

Milestone 4 moves types mechanically before implementation splits. Public repository interfaces and public models move to clearly named contract/model files in the same package. Private serializable request/response DTOs and mappers move to wire files grouped by domain. Keep serial names, defaults, nullability, endpoint paths, and mapping behavior byte-for-byte compatible. Run repository tests after each mechanical move before changing ownership.

Milestone 5 keeps `EventRepository` as the dependency-injected facade while introducing internal collaborators for the Room event store, remote event gateway, participant/compliance synchronization, registration mutations, event catalog/search, and session cache. A remote detail refresh is successful only after the related event, fields, matches, participants, compliance, and relations commit consistently. UI-facing flows continue to observe Room. Cancellation is rethrown; failed refreshes may expose an existing valid cache but cannot partially overwrite it or render a one-off remote object.

Milestone 6 keeps `BillingRepository` and `IBillingRepository` stable while introducing collaborators for checkout/signing, rental orders, bills/payments/subscriptions, discounts, product catalog, organizations/reviews, and refunds. Product/organization/time-slot/review snapshots retain viewer ownership and atomic replacement. A successful remote catalog read is persisted and re-read from the DAO before it becomes canonical; an empty authoritative response replaces stale rows, and an ordinary transport failure does not masquerade as a successful empty result.

Milestone 7 runs the focused repository and event-detail suites, the complete debug unit suite, iOS compilation/tests, and Android assembly. Install the exact APK produced by the validated commit and cold-launch twice. On Android and iOS, open the same event and exercise overview, participants, schedule, standings, bracket, edit, refresh, and an offline cached reopen. Verify no crash, ANR, Room migration failure, missing relation, direct-network flash, stale-account catalog, or visual regression.

## Concrete Steps

Before every milestone, work from the repository root and inspect scope:

    cd /Users/elesesy/StudioProjects/mvp-app-critical-audit
    git status --short
    git diff --check

For the pure screen-rule slice, run:

    ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.eventDetail.EventDetailDivisionOptionsTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailWeeklyBehaviorTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailOnboardingGuideTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailScreenRoleVisibilityTest'
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :composeApp:assembleDebug

Do not run Gradle tests concurrently with another agent in this checkout. Isolated worktrees may run independently, but each result must identify its exact commit and checkout.

For the repository milestones, run the two contract suites first:

    ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.core.data.repositories.BillingRepositoryHttpTest'
    ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest'

The current suites contain 58 billing and 64 event cases. Preserve or increase those counts. They cover Room snapshot replacement, offline fallback, authoritative empty responses, participant bootstrap, and cache convergence.

At final validation, run serially:

    ./gradlew :composeApp:testDebugUnitTest
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :composeApp:assembleDebug
    ./gradlew bootIOSSimulator :composeApp:iosSimulatorArm64Test

Use the Android emulator QA workflow to install the exact `composeApp/build/outputs/apk/debug/composeApp-debug.apk`, resolve and launch `com.razumly.mvp/.MainActivity`, capture UI hierarchy/screenshots/logcat, and compare its APK digest with the validated artifact. Use the iOS simulator debugger workflow for the matching shared commit and capture the target event screens plus runtime warnings.

After each passing milestone, update this plan, run `git diff --check`, stage only the milestone paths, run `git diff --cached --check`, and commit. Never stage the unrelated in-progress APP-009 DAO starter changes unless they are reconciled as part of APP-009 itself.

## Validation and Acceptance

Behavioral acceptance requires Android and iOS users to load the same event state online and from a valid offline cache, navigate every event-detail tab, register or withdraw through existing actions, edit authorized event data, and use billing/catalog/refund paths without behavior drift. Refreshes must not flash an unpersisted remote model, incomplete relation graph, or another viewer's cache.

Structural acceptance targets are:

- `EventDetailScreen.kt` is at most about 1,200 lines; the first pure-rule milestone alone reduces it to at most 3,450 lines.
- `DefaultEventDetailComponent.kt` is at most about 1,500 lines and owns assembly/lifecycle/public delegation rather than domain implementations.
- The `BillingRepository.kt` facade is at most about 900 lines and `EventRepository.kt` facade at most about 1,000 lines.
- No new collaborator exceeds roughly 800–1,000 lines; a collaborator near that limit must have one cohesive domain responsibility and direct tests.
- `EventDetailComponent`, `IBillingRepository`, `IEventRepository`, constructors used by dependency injection, endpoint paths, wire serialization, and platform behavior remain compatible.
- No composable directly fetches repository/network data, and no repository refresh exposes an unpersisted remote object as canonical rendered data.
- Viewer-scoped catalog replacement, participant/relation atomicity, cancellation, and offline fallback remain covered by tests.
- APP-009 canonical junction ownership is integrated before membership-related component/repository decomposition.

AUD-004 is not complete from file movement alone. It closes only after ownership is singular, Room-first invariants are explicit, focused/broad tests pass, and exact-commit Android and iOS smoke evidence confirms the user-visible paths.

## Idempotence and Recovery

Each milestone is a mechanical extraction behind a stable facade followed by focused validation. Moves can be repeated safely. If a compile fails, restore the moved symbol's visibility/import before changing behavior. If a repository test observes a remote object before Room persistence, stop and restore the original refresh sequence rather than adding a UI fallback.

Do not combine screen extraction, component lifecycle extraction, and repository ownership changes in one commit. Do not reset or discard the dirty worktree. Reconcile APP-009 through its isolated commit and migration evidence before touching membership-dependent paths. Recovery is by reverting only the latest scoped milestone commit or applying a narrow corrective patch; Room schema downgrades and destructive database fallbacks are not allowed.

## Artifacts and Notes

Planning measurements on 2026-07-14:

    4,137  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    3,439  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt
    4,430  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt
    3,398  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt

The first slice must not touch the four currently unstaged APP-009 starter paths under `core/database`. Test counts, artifact hashes, runtime screenshots, and logs will be appended here as milestones complete.

## Interfaces and Dependencies

Keep `EventDetailScreen(component: EventDetailComponent, ...)`, the `EventDetailComponent` interface, and `DefaultEventDetailComponent` constructor source-compatible. Pure screen rules stay in package `com.razumly.mvp.eventDetail` with existing function names/signatures and `internal` visibility where tests and route use them. Extracted composables receive immutable state data classes and callback containers; they do not receive repositories.

Keep `IBillingRepository`, `BillingRepository`, `IEventRepository`, and `EventRepository` public signatures and dependency-injection bindings compatible. Internal gateways use the existing Ktor client and network DTOs. Internal stores use existing DAOs and Room transactions. Synchronizers enforce validation and complete persistence before UI state is exposed. Do not add a second cache, persistence library, HTTP client, or state-management framework.

Use Kotlin coroutines with structured cancellation, existing `StateFlow`/Decompose lifecycle helpers, existing Room DAOs, current Ktor serialization, and current test fakes. Every collaborator must receive explicit dependencies through its constructor so tests can replace network, clock, or store boundaries without global state.

Revision note (2026-07-14): Created the self-contained AUD-004 continuation after current-source mapping showed that prior screen/coordinator extraction was substantial but pure presentation rules, lifecycle assembly, repository contracts/mappings, and Room-first domain ownership remained concentrated. Sequenced membership-dependent work after APP-009 and selected a pure no-overlap first milestone.
