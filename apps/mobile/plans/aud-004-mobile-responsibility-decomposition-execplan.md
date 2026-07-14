# Decompose mobile event detail and repository responsibilities

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

This plan finishes the current-source work required by audit finding AUD-004. It incorporates the completed history in `plans/event-detail-screen-components-execplan.md` and the still-active controller history in `plans/event-detail-component-decomposition-execplan.md`, but it is self-contained for the four files named by the audit and the current Room-first architecture.

## Purpose / Big Picture

The mobile event-detail route and its two central repositories work, but important UI rules, lifecycle bindings, persistence, network mapping, and domain operations remain concentrated in four files that are each several thousand lines. This makes a small change to event registration, cache refresh, billing, or screen presentation require reviewing unrelated workflows and increases the risk of accidentally rendering a one-off network response instead of the durable Room cache.

After this plan is complete, users must see the same event overview, registration, participants, schedule, standings, bracket, editing, checkout, refund, organization, product, and offline behavior on Android and iOS. The implementation will have explicit owners: screen files render immutable presentation state, the Decompose component coordinates lifecycle and existing workflow coordinators, Room stores own cached data, remote gateways own HTTP requests, and repository facades enforce remote-to-Room-to-render ordering.

## Progress

- [x] (2026-07-14 21:45Z) Reconciled AUD-004 against the current audit branch and measured `EventDetailScreen.kt` at 4,137 lines, `DefaultEventDetailComponent.kt` at 3,439 lines, `BillingRepository.kt` at 4,430 lines, and `EventRepository.kt` at 3,398 lines.
- [x] (2026-07-14 21:50Z) Mapped current responsibilities, existing coordinators, Room-first paths, test coverage, and the interaction with in-flight APP-009 membership persistence.
- [x] (2026-07-14 13:35Z) Milestone 1: extracted the pure stage-selection, weekly-schedule presentation, onboarding/role, primary-action, and match-day rules above `EventDetailScreen()` with direct tests. The route fell from 4,137 to 3,357 lines; all 30 focused tests, iOS simulator compilation, Android debug assembly, and diff checks pass.
- [x] (2026-07-14 14:00Z) Milestone 2a: extracted the detail-tab renderer into a typed presentation host, kept flow collection and route-local selection in `EventDetailScreen`, and added six direct regressions for tab availability, initial-tab fallback, and schedule-division filtering. The route fell from 3,357 to 2,891 lines; all 36 focused tests, iOS simulator compilation, Android debug assembly, and static/diff checks pass.
- [x] (2026-07-14 14:30Z) Milestone 2b: extracted overview/edit, sticky-action, and overlay/dialog presentation hosts without moving business state into composables. The route fell from 2,891 to 2,192 lines; all 46 focused tests, iOS simulator compilation, Android debug assembly, and static/diff checks pass.
- [x] (2026-07-14 15:29Z) Milestone 3: extracted component-owned event-team check-in, Room-backed relation state, participant hydration, and lifecycle bindings from `DefaultEventDetailComponent` while preserving its public interface and existing coordinators.
  - [x] (2026-07-14 14:40Z) Milestone 3a: integrated APP-009 commit `63451562` as `5b862d6d`, then extracted event-team check-in state, prompt policy, loading, and remote execution into `EventTeamCheckInCoordinator`. The component fell from 3,439 to 3,373 lines; all 28 focused coordinator/membership tests, four iOS migration tests, iOS simulator compilation, Android debug assembly, and diff checks pass.
  - [x] (2026-07-14 14:53Z) Milestone 3b: extracted event, player, host, cached-match, event-team, current-user-team, and managed-team derivation into `EventRelationStateCoordinator`. Membership now consumes canonical Room team IDs rather than the ignored `UserData.teamIds` compatibility field. The component fell from 3,373 to 3,272 lines; all 34 focused tests, two affected weekly integration regressions, four iOS migration tests, iOS simulator compilation, Android debug assembly, and diff checks pass.
  - [x] (2026-07-14 15:13Z) Milestone 3c: moved participant/bootstrap orchestration behind `EventParticipantBootstrapCoordinator`, preserving Room-backed participant switching, managed-bootstrap suppression and retry, hydration ordering, and weekly cache/membership/sync ordering. The component fell from 3,272 to 2,919 lines; all 55 focused state/coordinator tests, eight affected integration regressions, four iOS migration tests, iOS simulator compilation, Android debug assembly, and diff checks pass.
  - [x] (2026-07-14 15:29Z) Milestone 3d: replaced 22 inline `init` collectors with named component-scoped lifecycle bindings, preserving launch order, `collectLatest` cancellation, withdrawal-key deduplication, and match-realtime cleanup. The component fell from 2,919 to 2,819 lines; all 61 focused state/coordinator tests, 19 passing mobile join-flow integrations, four iOS migration tests, iOS simulator compilation, Android debug assembly, and diff checks pass.
- [x] (2026-07-14 15:41Z) Milestone 4: mechanically separated `IEventRepository`/`IBillingRepository`, their public models, and the event plus billing-domain wire DTO/mapping families from the two implementation files. Public signatures, serializers, defaults, endpoint paths, constructors, and dependency-injection bindings are unchanged; all 122 repository HTTP cases, iOS simulator compilation, Android debug assembly, and diff checks pass.
- [x] (2026-07-14 15:53Z) Reconciled Milestone 4 onto current audit head `20f11938`, which already contains LEG-001 commits `89cbafe6` and `1451c1b0`. The reconciled checkpoint `966aa872` preserves canonical-only identity handling in every moved Billing wire family; three production alias scans return zero matches, all 122 repository HTTP cases pass, and both platform build gates pass.
- [ ] Milestone 5: split `EventRepository` behind its existing facade into Room store, remote gateway, participant synchronization, registration mutation, event catalog, and session-cache collaborators.
  - [x] (2026-07-14 15:58Z) Milestone 5a: extracted viewer-scoped event filtering, startup cache cleanup, user-session invalidation, and lifecycle cancellation into `EventSessionCacheCoordinator`. The facade remains source-compatible and fell from 2,637 to 2,593 lines; all 65 Event repository HTTP cases, iOS simulator compilation, Android debug assembly, zero-alias scans, and diff checks pass.
  - [x] (2026-07-14 16:05Z) Milestone 5b: extracted event-detail request/decoding mechanics into `EventDetailRemoteGateway` and canonical detail observation/cache-read/eviction into `EventRoomStore`. The facade still orders remote fetch before Room persistence/re-read and keeps 403/404 eviction explicit; all 65 Event repository HTTP cases, iOS simulator compilation, Android debug assembly, zero-alias scans, and diff checks pass.
  - [ ] Milestone 5c: extract participant/management/compliance synchronization and current-user registration cache ownership.
  - [ ] Milestone 5d: extract registration mutations plus catalog/search/host/organization query ownership and complete the facade-only boundary.
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

- Observation: moving the stage-selection family into a sibling file required five helpers to become package-visible rather than file-private.
  Evidence: `tournamentBracketDivisionOptions`, `tournamentPoolDivisionOptions`, `resolveBracketDivisionForPool`, `hasLosersBracketSelector`, and `teamIdsForDivision` are still `internal` to the module and retain their existing signatures and behavior; no public API or call site outside the package was added.

- Observation: the canonical display label for the default `open` division is `CoEd Open 18+`, not the raw identifier `Open`.
  Evidence: the new weekly-session regression test initially asserted `Open`; the unchanged `toDivisionDisplayLabel` behavior produced `CoEd Open 18+`. The expectation was corrected and the complete focused set then passed 30 of 30 tests.

- Observation: the detail-tab body contained one non-visual policy that deserved a direct test boundary before movement: tournament schedules include both the selected bracket division and all of its pool divisions, while a selected pool narrows to that pool alone.
  Evidence: `EventDetailTabsHostRulesTest` now exercises selected-pool, bracket-plus-pools, ordinary-division, and single-division cases; all six tests pass and the extracted host calls the tested `filterScheduleMatchesForDivision` helper.

- Observation: the extracted tab host can remain presentation-only even though it renders four workflows and a floating dock.
  Evidence: `EventDetailTabsHost.kt` receives immutable state and callbacks, contains no `collectAsState`, `EventDetailComponent`, repository, or network reference, and the route continues to own `selectedTab`, participant-section selection, pool selection, dock expansion, and manage-mode state.

- Observation: overview/edit and dialog presentation can be extracted without transferring any route or business state ownership.
  Evidence: `EventDetailOverviewEditHost.kt` and `EventDetailOverlayHost.kt` receive typed immutable state and callback containers, contain no `collectAsState`, `StateFlow`, or `EventDetailComponent` reference, and the route still owns flow collection, local dialog/selection state, and every component mutation.

- Observation: the sticky overview action contains presentation policy that benefits from a small pure rule boundary.
  Evidence: `resolveEventDetailStickyPrimaryAction` preserves the original primary-action priority and enablement, while ten new host-rule tests cover edit availability, delete/signature copy, and sticky-action selection.

- Observation: APP-009 applies cleanly to the isolated screen branch and unlocks membership-dependent component work without a conflict merge.
  Evidence: cherry-picking `63451562` created integrated commit `5b862d6d` with all 28 APP-009 paths unchanged and no conflicts; the integrated schema-93 iOS migration suite passes four of four tests.

- Observation: one paid-team mobile join integration test is already red on the exact integrated baseline and is unrelated to event-team check-in extraction.
  Evidence: `EventDetailMobileJoinFlowTest.startTeamRegistration_forPaidOpenTeam_createsTeamRegistrationPurchaseIntent` expects a pending team-registration ID, but the Android unit-test payment processor immediately reports missing payment setup and clears it. The test fails identically at untouched commit `5b862d6d` and after this checkpoint; the other 19 tests in that class pass.

- Observation: after APP-009, component membership derivation cannot use `UserData.teamIds`, including in integration fakes.
  Evidence: that field is ignored compatibility data, while `TeamRepository.getTeamsWithPlayersFlow()` observes the Room membership junction. Switching the component to the canonical flow initially exposed two weekly test fixtures whose fake always returned an empty current-user team list; making the fake mirror the Room query restored both regressions, and the direct coordinator test proves a stale compatibility ID is excluded in favor of the Room team ID.

- Observation: participant/bootstrap orchestration can be extracted without moving lifecycle collection in the same checkpoint.
  Evidence: `EventParticipantBootstrapCoordinator` now owns participant flow construction, managed bootstrap, hydration, weekly prefetch/sync, result fanout, and cancellation-aware jobs, while `DefaultEventDetailComponent` retains narrow collectors that bind selected-event, participant, managed-target, and weekly-occurrence flows. This reduced the component by 353 lines without widening its public interface.

- Observation: direct tests of coordinator jobs launched in `backgroundScope` must drain the current scheduler queue without waiting for the background scope itself to finish.
  Evidence: the first focused run left only background jobs outstanding in three cases; replacing `advanceUntilIdle` with `runCurrent` made all six direct coordinator tests pass while leaving production scheduling unchanged.

- Observation: the component `init` block contained 22 independently cancellable collectors whose launch order is part of the effective startup behavior.
  Evidence: organization/template loading, event hydration, registration scope, participant bootstrap, membership, payment results, match realtime, edit state, withdrawal targets, standings, and bracket rounds all begin from eager state flows. `EventDetailLifecycleBindings` exposes one named binding per collector and the component invokes them in the original order; six direct tests cover the cancellation, deduplication, projection, and cleanup-sensitive bindings.

- Observation: file-private wire declarations cannot remain `private` after a same-package Kotlin file split, and several Event compliance mapper names intentionally duplicate file-private Team repository mappers.
  Evidence: moved DTOs and mappers use module-only `internal` visibility. Event and Billing answer/compliance mapper names received repository-specific prefixes so they remain unambiguous without widening any public contract; their bodies, DTO fields, serialization annotations, and call ordering are otherwise unchanged.

- Observation: the original Milestone 4 branch predated LEG-001, so mechanically moved Billing wire declarations would have restored obsolete `$id` fields even though the implementation-file conflict preserved the canonical branch.
  Evidence: the cherry-pick conflicted only in `BillingRepository.kt`, while the added catalog, rental, and payment wire files contained the old `legacyId` declarations and fallback expressions. Reapplying the canonical-only changes to their new owners and removing the two outbound legacy fields produced zero matches for serializer aliases, watch aliases, and production `legacyId` uses.

- Observation: event cache invalidation is viewer-scoped lifecycle work, not event-detail hydration, but it also supplies hidden-event filtering to cached, bounds, and text-search projections.
  Evidence: one constructor-owned coroutine deletes the startup cache, a second watches current-user identity and clears event/participant/compliance rows on a real identity transition, and four query paths apply the same hidden-event policy. `EventSessionCacheCoordinator` now owns that complete family and the facade delegates lifecycle plus projections without changing any DAO or endpoint behavior.

- Observation: detail request mechanics and canonical Room reads can be separated without moving synchronization policy out of the facade.
  Evidence: `EventDetailRemoteGateway` owns event DTO decoding, scoring-config fetches, occurrence query construction, participant snapshots, and detail bootstrap requests but never accesses a DAO. `EventRoomStore` owns relation observation, event cache/re-read, and eviction but never accesses HTTP. `EventRepository.getEvent()` still fetches remotely, evicts only on 403/404, writes Room, and returns the Room re-read value in that order.

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

- Decision: allow extracted pure helpers to use `internal` visibility when both the route and focused tests need them across files in the same package.
  Rationale: Kotlin `private` is file-scoped. Package/module visibility preserves encapsulation outside the module while keeping the extraction mechanical and directly testable.
  Date/Author: 2026-07-14 / Codex

- Decision: split the original screen-host milestone into independently verifiable detail-tab and overview/dialog checkpoints.
  Rationale: the detail tabs form one cohesive renderer with shared navigation, division selectors, and a floating dock. Extracting that complete family first reduces the route by 466 lines while keeping the next overview/edit and overlay/dialog movement mechanically separate and reviewable.
  Date/Author: 2026-07-14 / Codex

- Decision: keep tab selection and all mutations in `EventDetailScreen` and pass only immutable state plus callback containers to `EventDetailTabsHost`.
  Rationale: this preserves the route as the lifecycle/state boundary and prevents the extracted composable from becoming a second controller. It also leaves the existing `EventDetailComponent` interface and dependency-injection graph unchanged.
  Date/Author: 2026-07-14 / Codex

- Decision: let the overview host own only presentation-local sticky-action animation while the route retains business and dialog state.
  Rationale: animation height and visibility are renderer concerns, but flow collection, dialog flags, selected entities, report drafts, and component actions remain at the route boundary. This keeps both new hosts lifecycle-free and source-compatible with the existing component.
  Date/Author: 2026-07-14 / Codex

- Decision: extract check-in execution and its mutable UI state without moving managed-team relation derivation into the same coordinator.
  Rationale: prompt history, check-in snapshots, save state, and the two check-in HTTP calls form one cohesive workflow. Resolving which team the user manages depends on canonical Room relations and belongs to the next state-graph checkpoint rather than a network execution coordinator.
  Date/Author: 2026-07-14 / Codex

- Decision: inject Room-observation flow factories into one relation-state coordinator while leaving error presentation and full event-detail assembly in `DefaultEventDetailComponent`.
  Rationale: event, host, cached match, event-team, and current-user-team observations form one derived state graph, but organization billing, fields, hydration, and lifecycle side effects belong to later checkpoints. Function injection gives the graph direct tests without widening repository interfaces or creating a second cache.
  Date/Author: 2026-07-14 / Codex

- Decision: let the participant/bootstrap coordinator build flows and own orchestration jobs, but retain lifecycle collector launch in the component until Milestone 3d.
  Rationale: participant synchronization, hydration, managed bootstrap, and weekly prefetch form one cohesive orchestration boundary. Moving collector lifecycle at the same time would combine two independently testable responsibilities and make cancellation or ordering regressions harder to localize.
  Date/Author: 2026-07-14 / Codex

- Decision: keep the Decompose scope and domain handlers in `DefaultEventDetailComponent`, and let `EventDetailLifecycleBindings` own only collector launch, distinctness, latest-value cancellation, and realtime teardown.
  Rationale: the component remains the lifecycle owner and repository/coordinator assembly boundary. Returning each child job makes cancellation directly testable without creating a second component, moving domain mutations into a generic collector, or changing the public interface.
  Date/Author: 2026-07-14 / Codex

- Decision: keep repository contracts and models in the existing implementation module/package for this mechanical checkpoint, while using domain-specific wire files and module-only visibility for declarations the facades still construct directly.
  Rationale: moving module ownership at the same time would change dependency boundaries rather than only declaration ownership. The stable package keeps every consumer and dependency-injection binding source-compatible; Milestones 5 and 6 can now introduce collaborators against explicit contracts without mixing in DTO movement.
  Date/Author: 2026-07-14 / Codex

- Decision: preserve LEG-001 canonical identity as an explicit invariant of every repository extraction and require zero-alias production scans at each overlapping checkpoint.
  Rationale: a clean textual split can silently resurrect removed response compatibility when its source branch predates a canonical contract change. Keeping `id` as the sole Billing identity and validating the moved files prevents structural refactors from undoing the server/client contract cleanup.
  Date/Author: 2026-07-14 / Codex

- Decision: begin Milestone 5 with the session-cache lifecycle family before moving detail synchronization or mutations.
  Rationale: startup cleanup, user-change invalidation, hidden-event projection, and scope cancellation already form one isolated responsibility with direct repository regressions. Extracting it first removes constructor-owned coroutine state without changing remote/Room ordering, allowing the larger persistence and gateway boundaries to proceed from a validated facade.
  Date/Author: 2026-07-14 / Codex

- Decision: keep orchestration and failure policy in `EventRepository` while making the detail gateway HTTP-only and the Room store persistence-only.
  Rationale: a gateway that writes Room or a store that fetches HTTP would hide the remote-to-Room-to-render invariant. The facade remains the reviewable transaction boundary, including canonical response validation, 403/404 eviction, and post-write re-read, while the collaborators have one infrastructure reason to change.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Research and sequencing are complete, Milestones 1 through 4 are validated, and Milestone 5 is in progress. `EventDetailScreen.kt` owns 2,192 lines instead of 4,137. APP-009 is integrated as `5b862d6d`; event-team check-in lives in a 146-line coordinator, canonical Room-backed relation derivation lives in a 222-line coordinator, participant/bootstrap orchestration lives in a 425-line coordinator, and 22 lifecycle collectors now live behind a 327-line binding owner with six direct regressions. `DefaultEventDetailComponent.kt` now owns 2,819 lines instead of 3,439. The repository contracts/models and event plus billing-domain wire mappings now have explicit files; viewer-scoped cache lifecycle lives in a 77-line coordinator, detail HTTP mechanics in a 99-line gateway, and canonical detail cache access in a 30-line Room store. `EventRepository.kt` is 2,508 lines instead of 3,398 and `BillingRepository.kt` is 2,304 lines instead of 4,430. Milestone 4 is integration-ready at reconciled checkpoint `966aa872` on top of current audit head `20f11938`, including LEG-001 canonical-only identity behavior. Milestones 5c through 7 remain, so AUD-004 is still open.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-app-critical-audit` on the current audit branch. This is a Kotlin Multiplatform app. Shared Compose UI and Decompose components live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. Shared repository implementation lives under `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/`. Room is the local SQL database and source of truth for fetched data. Ktor is the HTTP client. The backend contract is the `mvp-site` repository at `/Users/elesesy/StudioProjects/mvp-site`.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` is the Compose route. It collects component flows, owns transient tab/dialog UI state, derives presentation, and assembles typed state and callback containers for focused sibling render hosts. Pure division/stage/weekly/guide/role rules, detail tabs, overview/edit, sticky action, and overlay/dialog rendering now live in focused sibling files. The route does not fetch data directly.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt` is the concrete Decompose component. A Decompose component is a lifecycle-aware object that exposes observable state and actions to a screen. This component assembles existing coordinators, binds Room observation and lifecycle collectors, refreshes event details and participants, owns realtime subscriptions, and delegates registration, billing, editing, publication, match, participant, and now event-team check-in actions.

`core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` implements event cache observation, remote hydration, event CRUD/search, participants/compliance, registration, standings, schedule, staff, deletion, and session-scoped cache behavior. `getEventWithRelationsFlow()` observes Room. Refresh paths call the server, validate/map the response, persist Room rows and relations, and then expose or re-read Room state.

`core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` contains the implementation for checkout/rentals/signing/bills/payments/subscriptions/products/discounts/organizations/reviews/refunds. `BillingRepositoryContract.kt` and `BillingRepositoryModels.kt` own its stable public surface. Checkout/signing, catalog/discount, rental, and payment wire declarations live in four domain-specific files. Catalog refresh paths still use viewer-scoped atomic DAO replacement and DAO re-read; this invariant must remain explicit after extraction.

A facade is the existing public class/interface that remains stable while delegating to internal collaborators. A remote gateway owns request/response mechanics but does not decide rendered state. A Room store owns DAO transactions and cached reads/writes. A synchronization collaborator validates remote data and commits all related Room rows before the facade reports success.

## Plan of Work

Milestone 1 moves only pure functions currently above `EventDetailScreen()` into three files in the same package. Create `EventDetailStageSelection.kt` for canonical division, playoff, pool, bracket, and selected-stage rules. Create `EventDetailWeeklySchedulePresentation.kt` for `WeeklySessionOption`, weekly-session construction, schedule labels, and 12-hour time formatting. Create `EventDetailScreenRules.kt` for onboarding-guide requirements, primary-action/role visibility, schedule-management visibility, and first-match-day detection. Keep existing function names, signatures, package visibility, and behavior. Add missing tests for `playoffDivisionIdsForSelection`, `buildWeeklySessionOptions`, and `isFirstMatchDayForTrackedUsers`. Do not touch any APP-009 model, DAO, Room schema, relation, or repository file in this milestone.

Milestone 2 is divided into two reviewable checkpoints. Milestone 2a moves the complete detail-tab renderer into `EventDetailTabsHost.kt`. The host receives `EventDetailTabsHostState` and `EventDetailTabsHostActions`, renders the participant, schedule, standings, and bracket tabs plus the shared division selector and floating dock, and contains no flow collection or component/repository reference. `EventDetailScreen()` retains tab, participant-section, pool, dock, and manage-mode selection. `EventDetailTabsHostRules.kt` owns the pure tab-list, initial-tab, and schedule-match filtering rules with direct tests.

Milestone 2b divided the remaining overview/edit and dialog render body into two more owners. `EventDetailOverviewEditHost.kt` receives immutable overview/edit state and callbacks and also owns the presentation-local sticky-action animation. `EventDetailOverlayHost.kt` receives transient dialog state and actions. `EventDetailScreen()` remains the route boundary that collects flows, owns route-local UI selection and dialog state, and invokes component mutations. The extracted composables do not collect repositories or duplicate business state.

Milestone 3 integrated APP-009 and validated schema-93 migration coverage. Checkpoint 3a extracted event-team check-in execution and its check-in/prompt/save state into `EventTeamCheckInCoordinator`; the component still supplies the current event, permission decision, managed-team ID, and error presentation. Checkpoint 3b moved relation derivation into a Room-backed state graph. Checkpoint 3c moved participant/bootstrap flow construction, hydration, managed bootstrap, weekly prefetch/sync, and result fanout into `EventParticipantBootstrapCoordinator`. Checkpoint 3d moved all 22 `init` collectors behind named `EventDetailLifecycleBindings` while retaining the Decompose scope and domain handlers in the component. Existing coordinators remain the sole owners of their mutable state. `DefaultEventDetailComponent` retains constructor and interface compatibility and is responsible for assembly, lifecycle ownership, public state exposure, and delegation.

Milestone 4 moved types mechanically before implementation splits. Public repository interfaces and public models now live in clearly named contract/model files in the same package. Serializable request/response DTOs and mappers now live in module-private wire files grouped by event, checkout/signing, catalog/discount, rental, and bill/payment domains. Serial names, defaults, nullability, endpoint paths, mapping bodies, constructors, and dependency-injection bindings remain compatible. Both repository suites passed independently and together before ownership work begins.

Milestone 5 keeps `EventRepository` as the dependency-injected facade while introducing internal collaborators for the Room event store, remote event gateway, participant/compliance synchronization, registration mutations, event catalog/search, and session cache. Checkpoint 5a first moves startup cleanup, current-user identity invalidation, hidden-event projection, and scope cancellation into `EventSessionCacheCoordinator`; no HTTP or detail persistence path changes in that checkpoint. A remote detail refresh is successful only after the related event, fields, matches, participants, compliance, and relations commit consistently. UI-facing flows continue to observe Room. Cancellation is rethrown; failed refreshes may expose an existing valid cache but cannot partially overwrite it or render a one-off remote object.

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

For the detail-tab host checkpoint, run:

    ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.eventDetail.EventDetailDivisionOptionsTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailWeeklyBehaviorTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailOnboardingGuideTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailScreenRoleVisibilityTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailTabsHostRulesTest'
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :composeApp:assembleDebug

Expect 36 focused tests with zero failures. A static search of `EventDetailTabsHost.kt` for `collectAsState`, `EventDetailComponent`, `Repository`, and `repository` must return no matches.

For the overview/edit and overlay/dialog checkpoint, add `EventDetailPresentationHostsTest` to the same focused command:

    ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.eventDetail.EventDetailDivisionOptionsTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailWeeklyBehaviorTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailOnboardingGuideTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailScreenRoleVisibilityTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailTabsHostRulesTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailPresentationHostsTest'
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :composeApp:assembleDebug

Expect 46 focused tests with zero failures. A static search of `EventDetailOverviewEditHost.kt` and `EventDetailOverlayHost.kt` for `collectAsState`, `StateFlow`, and `EventDetailComponent` must return no matches.

Do not run Gradle tests concurrently with another agent in this checkout. Isolated worktrees may run independently, but each result must identify its exact commit and checkout.

For the event-team check-in component checkpoint, run:

    ./gradlew :composeApp:testDebugUnitTest \
      --tests 'com.razumly.mvp.eventDetail.EventTeamCheckInCoordinatorTest' \
      --tests 'com.razumly.mvp.eventDetail.EventMembershipCoordinatorTest' \
      --tests 'com.razumly.mvp.eventDetail.EventDetailHydrationCoordinatorTest' \
      --tests 'com.razumly.mvp.eventDetail.EventLifecycleStateTest' \
      --tests 'com.razumly.mvp.eventDetail.EventBootstrapResourcesCoordinatorTest' \
      --tests 'com.razumly.mvp.core.data.dataTypes.TeamMembershipTest'
    ./gradlew :core:database:iosSimulatorArm64Test
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64
    ./gradlew :composeApp:assembleDebug

Expect 28 focused unit tests and four iOS migration tests with zero failures. Keep the exact-baseline paid-team payment-sheet fixture failure documented separately until its owning payment-flow work updates the Android unit-test setup.

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

Milestone 1 evidence on 2026-07-14:

    3,357  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
      414  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailStageSelection.kt
      262  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailWeeklySchedulePresentation.kt
      128  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreenRules.kt

    EventDetailDivisionOptionsTest: 9 passed
    EventDetailWeeklyBehaviorTest: 14 passed
    EventDetailOnboardingGuideTest: 2 passed
    EventDetailScreenRoleVisibilityTest: 5 passed
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL
    git diff --check: passed

Milestone 2a evidence on 2026-07-14:

    2,891  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
      695  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailTabsHost.kt
       62  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailTabsHostRules.kt
      165  composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailTabsHostRulesTest.kt

    EventDetailDivisionOptionsTest: 9 passed
    EventDetailWeeklyBehaviorTest: 14 passed
    EventDetailOnboardingGuideTest: 2 passed
    EventDetailScreenRoleVisibilityTest: 5 passed
    EventDetailTabsHostRulesTest: 6 passed
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL
    composeApp-debug.apk SHA-256: c8f3a9c9515db5abae61bf5bb599e3298edac87ea7ffe111ec401ca3de2604d6
    detail-host controller/repository static scan: no matches
    git diff --check: passed

Milestone 2b evidence on 2026-07-14:

    2,192  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
      796  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverviewEditHost.kt
      464  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailOverlayHost.kt
      185  composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailPresentationHostsTest.kt

    EventDetailDivisionOptionsTest: 9 passed
    EventDetailWeeklyBehaviorTest: 14 passed
    EventDetailOnboardingGuideTest: 2 passed
    EventDetailScreenRoleVisibilityTest: 5 passed
    EventDetailTabsHostRulesTest: 6 passed
    EventDetailPresentationHostsTest: 10 passed
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 11 executed, 56 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 12 executed, 162 up-to-date)
    composeApp-debug.apk SHA-256: 842919daf9041a4b3f94005b375cbdaba9f05246668bff95505b567762802b15
    overview/overlay host state/component static scan: no matches
    git diff --check: passed

Milestone 3a evidence on 2026-07-14:

    APP-009 source commit: 63451562e2eda22b99d5de6f364715e8562285eb
    APP-009 integrated commit: 5b862d6d
    3,373  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt
      146  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventTeamCheckInCoordinator.kt
      231  composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventTeamCheckInCoordinatorTest.kt

    EventTeamCheckInCoordinatorTest: 9 passed
    EventMembershipCoordinatorTest: 6 passed
    EventDetailHydrationCoordinatorTest: 4 passed
    EventLifecycleStateTest: 2 passed
    EventBootstrapResourcesCoordinatorTest: 5 passed
    TeamMembershipTest: 2 passed
    ./gradlew :core:database:iosSimulatorArm64Test: 4 passed; BUILD SUCCESSFUL (20 actionable tasks: 14 executed, 6 up-to-date)
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 18 executed, 49 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 17 executed, 157 up-to-date)
    composeApp-debug.apk SHA-256: 8af0e7ded01ef9a949187e09258d5e59519f6ace5ad0bc81aec009b648014e34
    git diff --check: passed

    Known baseline: EventDetailMobileJoinFlowTest has 19 passes and one paid-team
    payment-sheet fixture failure at both 5b862d6d and this checkpoint. The check-in
    extraction does not touch payment setup or that test.

Milestone 3b evidence on 2026-07-14:

    checkpoint parent: a9656bb3
    3,272  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt
      222  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRelationStateCoordinator.kt
      334  composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRelationStateCoordinatorTest.kt

    EventRelationStateCoordinatorTest: 6 passed
    EventTeamCheckInCoordinatorTest: 9 passed
    EventMembershipCoordinatorTest: 6 passed
    EventDetailHydrationCoordinatorTest: 4 passed
    EventLifecycleStateTest: 2 passed
    EventBootstrapResourcesCoordinatorTest: 5 passed
    TeamMembershipTest: 2 passed
    affected weekly team-membership integration regressions: 2 passed
    ./gradlew :core:database:iosSimulatorArm64Test: 4 passed; BUILD SUCCESSFUL (20 actionable tasks: 2 executed, 18 up-to-date)
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 11 executed, 56 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 13 executed, 161 up-to-date)
    composeApp-debug.apk SHA-256: 9aa14cf1ade5f6ab3f5b1ee0beb100e6d461de97e96fb46794ec60129308ba06
    git diff --check: passed

    Known baseline: EventDetailMobileJoinFlowTest has 19 passes and the same one
    paid-team payment-sheet fixture failure at this checkpoint. The single test also
    fails at the exact assertion on untouched checkpoint parent a9656bb3.

Milestone 3c evidence on 2026-07-14:

    checkpoint parent: dee13999
    2,919  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt
      425  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventParticipantBootstrapCoordinator.kt
      437  composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventParticipantBootstrapCoordinatorTest.kt

    EventParticipantBootstrapCoordinatorTest: 6 passed
    focused state/coordinator matrix: 55 passed
    affected EventDetailMobileJoinFlowTest regressions: 8 passed
    ./gradlew :core:database:iosSimulatorArm64Test: 4 passed; BUILD SUCCESSFUL (20 actionable tasks: 2 executed, 18 up-to-date)
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 11 executed, 56 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 13 executed, 161 up-to-date)
    composeApp-debug.apk SHA-256: f0db57609bc1fab95ec025b4a4cafc584c3e20aeaa13704d34a0f8324b884447
    git diff --check: passed

    The complete EventDetailMobileJoinFlowTest class was not rerun in this
    checkpoint; its inherited paid-team payment-sheet fixture baseline remains
    documented in Milestones 3a and 3b. The eight integration methods directly
    affected by participant/bootstrap and weekly-prefetch movement pass.

Milestone 3d evidence on 2026-07-14:

    checkpoint parent: d1da5244
    2,819  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/DefaultEventDetailComponent.kt
      327  composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailLifecycleBindings.kt
      285  composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailLifecycleBindingsTest.kt

    EventDetailLifecycleBindingsTest: 6 passed
    focused lifecycle/state/coordinator matrix: 61 passed
    passing EventDetailMobileJoinFlowTest integration methods: 19 passed
    ./gradlew :core:database:iosSimulatorArm64Test: 4 migration tests remain green; BUILD SUCCESSFUL (20 actionable tasks: 2 executed, 18 up-to-date)
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 11 executed, 56 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 14 executed, 160 up-to-date)
    composeApp-debug.apk SHA-256: 7d1b287904c7accc70a3543b5f10d0df7bd5495e2bcf7e692b49b58387d59fb9
    git diff --check: passed

    Known baseline: the remaining paid-open-team fixture still fails with
    `expected:<paid_open_team> but was:<null>`, the same assertion documented on
    the untouched Milestone 3b parent. The other 19 methods in the class pass,
    including paid-team signature/checkout and registration-detail lifecycle paths.

Milestone 4 evidence on 2026-07-14:

    checkpoint parent: cd3c027d
    2,637  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt
      266  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryContract.kt
      223  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryModels.kt
      317  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryWire.kt
    2,304  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt
      331  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryContract.kt
      447  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepositoryModels.kt
      253  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingCheckoutSigningWire.kt
      388  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingCatalogWire.kt
      324  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRentalWire.kt
      522  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingPaymentWire.kt

    BillingRepositoryHttpTest: 58 passed
    EventRepositoryHttpTest: 64 passed
    combined repository contract matrix: 122 passed
    serializable annotation parity: Event 7 -> 7; Billing 78 -> 78
    endpoint path multiset SHA-256 parity:
      Event: 05c84a806c1e68a2a45fa3c7f50694e29b96fa1556a03ab1eb092fb261eb55d2
      Billing: 4862219e0698d60491df617ad8da1d2437d70593172bbe5200cc08f38959d315
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 12 executed, 55 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 13 executed, 161 up-to-date)
    composeApp-debug.apk SHA-256: 6c87e783ffdfd51d0eef3b95161a6e2267698dacbf3dc864d76222736b912ae5
    git diff --check: passed

    No endpoint, request/response field, serializer annotation, default, nullability,
    repository constructor, or dependency-injection binding changed. The only renamed
    declarations are module-private helper functions that required repository-specific
    prefixes to avoid cross-file Kotlin overload collisions.

Milestone 4 current-head reconciliation evidence on 2026-07-14:

    current audit base: 20f11938
    required LEG-001 ancestors: 89cbafe6, 1451c1b0
    reconciled checkpoint: 966aa872
    rg -F '@SerialName("\$' over production Kotlin: 0 matches
    rg -F 'case legacyId = "$id"' over watchOS Swift: 0 matches
    rg 'legacyId' over production Kotlin and Swift: 0 matches
    BillingRepositoryHttpTest: 58 passed
    EventRepositoryHttpTest: 64 passed
    combined repository contract matrix: 122 passed
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 60 executed, 7 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 44 executed, 130 up-to-date)
    composeApp-debug.apk SHA-256: 6fdeb0d934f3c0047a457cb72ac634453fea3366ae79cfe6a9f2bd35766021b8
    git diff --check: passed

    The reconciliation moved every LEG-001 Billing cleanup to the split file that now
    owns the affected DTO or mapper and retained the two outbound canonical `id`
    assignments. No canonical worktree was modified and no branch was pushed.

Milestone 5a evidence on 2026-07-14:

    checkpoint parent: 6d781637
    2,593  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt
       77  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventSessionCacheCoordinator.kt
    EventRepositoryHttpTest: 65 passed
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 13 executed, 54 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 12 executed, 162 up-to-date)
    composeApp-debug.apk SHA-256: 3153b8bd4d56100a83d2f9bcbb1240aa323f0aebaf88314effe1698f9a5820ab
    three canonical identity production scans: 0 matches
    git diff --check: passed

    Existing regressions directly cover hidden-event projection and identity-change
    invalidation, and a new regression proves that the facade's existing `close()`
    stops later session invalidation. The coordinator retains the original
    undispatched first-user observation, ignores that initial value, and clears all
    three cache families only on a subsequent identity change.

Milestone 5b evidence on 2026-07-14:

    checkpoint parent: e1a4f21c
    2,508  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt
       99  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventDetailRemoteGateway.kt
       30  core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRoomStore.kt
    EventRepositoryHttpTest: 65 passed
    ./gradlew :composeApp:compileKotlinIosSimulatorArm64: BUILD SUCCESSFUL (67 actionable tasks: 12 executed, 55 up-to-date)
    ./gradlew :composeApp:assembleDebug: BUILD SUCCESSFUL (174 actionable tasks: 12 executed, 162 up-to-date)
    composeApp-debug.apk SHA-256: 5eba15f20c04c63cd2b16ebf2b4d8e11f7e6298d6136d49c9cbe1592f78ab5e9
    three canonical identity production scans: 0 matches
    git diff --check: passed

    The gateway contains no `DatabaseService` reference and the store contains no
    `MvpApiClient` reference. The facade remains the only owner of fetch -> validate ->
    persist -> re-read ordering and retains the existing forbidden/not-found eviction
    policy before rethrowing the remote failure.

## Interfaces and Dependencies

Keep `EventDetailScreen(component: EventDetailComponent, ...)`, the `EventDetailComponent` interface, and `DefaultEventDetailComponent` constructor source-compatible. Pure screen rules stay in package `com.razumly.mvp.eventDetail` with existing function names/signatures and `internal` visibility where tests and route use them. Extracted composables receive immutable state data classes and callback containers; they do not receive repositories.

Keep `IBillingRepository`, `BillingRepository`, `IEventRepository`, and `EventRepository` public signatures and dependency-injection bindings compatible. Internal gateways use the existing Ktor client and network DTOs. Internal stores use existing DAOs and Room transactions. Synchronizers enforce validation and complete persistence before UI state is exposed. Do not add a second cache, persistence library, HTTP client, or state-management framework.

Use Kotlin coroutines with structured cancellation, existing `StateFlow`/Decompose lifecycle helpers, existing Room DAOs, current Ktor serialization, and current test fakes. Every collaborator must receive explicit dependencies through its constructor so tests can replace network, clock, or store boundaries without global state.

Revision note (2026-07-14): Created the self-contained AUD-004 continuation after current-source mapping showed that prior screen/coordinator extraction was substantial but pure presentation rules, lifecycle assembly, repository contracts/mappings, and Room-first domain ownership remained concentrated. Sequenced membership-dependent work after APP-009 and selected a pure no-overlap first milestone.

Revision note (2026-07-14): Completed Milestone 1 by moving pure stage, weekly schedule, and route rules into three cohesive files, adding direct regression coverage, and recording exact Android/iOS build evidence. Five formerly file-private helpers became module-internal because Kotlin privacy is file-scoped; no public contract changed.

Revision note (2026-07-14): Completed Milestone 2a by moving all detail-tab rendering, selector, and dock UI behind typed immutable state/callback containers. Added direct coverage for the pure navigation and schedule-filter rules, kept route-local state and component calls in `EventDetailScreen`, and recorded the exact focused-test, Android, iOS, static-scan, line-count, and APK evidence. Split the remaining screen-host work into Milestone 2b so overview/edit and overlay/dialog extraction stays independently reviewable.

Revision note (2026-07-14): Completed Milestone 2b by moving overview/edit, sticky-action, and overlay/dialog rendering behind typed immutable state/callback containers. Kept all flow collection, route-local selection/dialog state, and component mutations in `EventDetailScreen`, added ten pure presentation-rule regressions, and recorded exact focused-test, Android, iOS, static-scan, line-count, and APK evidence. The APP-009 checkpoint is now available on `codex/critical-audit-remediation` at commit `63451562`, so the next membership-dependent milestone must integrate that commit before continuing.

Revision note (2026-07-14): Started Milestone 3 by integrating APP-009 without conflicts and extracting event-team check-in execution/state into a focused coordinator. Kept managed-team relation resolution in the component for the canonical Room state-graph checkpoint, added nine direct regressions, and recorded the exact unit, migration, Android, iOS, line-count, APK, and baseline-failure evidence.

Revision note (2026-07-14): Completed Milestone 3b by moving all Room-backed event/user/team relation observation and managed-team derivation into `EventRelationStateCoordinator`. Replaced ignored profile team IDs with canonical Room team IDs throughout component membership decisions, updated the integration fake to mirror the Room membership query, added six direct regressions, and recorded exact focused, weekly integration, parent-baseline, migration, Android, iOS, line-count, and APK evidence.

Revision note (2026-07-14): Completed Milestone 3c by moving participant flow construction, managed bootstrap, hydration, weekly occurrence prefetch/sync, result fanout, and their structured jobs into `EventParticipantBootstrapCoordinator`. Retained lifecycle collector launch in `DefaultEventDetailComponent` for Milestone 3d, added six direct ordering/cancellation regressions, and recorded exact focused, affected-integration, migration, Android, iOS, line-count, and APK evidence.

Revision note (2026-07-14): Completed Milestone 3d and Milestone 3 by replacing 22 inline `init` collectors with named `EventDetailLifecycleBindings` launched from the component-owned Decompose scope in their original order. Kept payment/domain handling in the component, added six direct cancellation/deduplication/realtime-cleanup regressions, and recorded exact focused, 19-path integration, migration, Android, iOS, line-count, APK, and inherited-baseline evidence.

Revision note (2026-07-14): Completed Milestone 4 by moving the Event and Billing public contracts/models plus event, checkout/signing, catalog/discount, rental, and bill/payment wire declarations into focused same-package files. Kept both facades, constructors, endpoints, serializer shapes, and Room-first behavior unchanged; used module-only visibility and repository-specific private-helper prefixes where Kotlin file privacy required it, then recorded the 122-test repository matrix and Android/iOS artifact evidence.

Revision note (2026-07-14): Reconciled Milestone 4 onto current audit head `20f11938`, preserving all LEG-001 canonical-only identity changes across the newly split Billing files. Recorded zero-alias static scans, the 122-test repository matrix, both platform build gates, and integration-ready checkpoint `966aa872`; Milestone 5 proceeds from this reconciled base.

Revision note (2026-07-14): Started Milestone 5 with the isolated session-cache lifecycle family. Moved startup deletion, viewer identity observation, cache-family invalidation, hidden-event projection, and scope cancellation into `EventSessionCacheCoordinator`, retained the public facade and coroutine ordering, added direct close/cancellation coverage, and recorded the 65-test Event repository gate plus Android/iOS artifact evidence. Split the remaining Event repository work into Room/gateway, participant/compliance, and mutation/catalog checkpoints.

Revision note (2026-07-14): Completed Milestone 5b by moving detail endpoint construction and response decoding into an HTTP-only gateway and canonical detail observation/cache/re-read/eviction into a Room-only store. Kept orchestration, validation, failure policy, and remote-to-Room ordering explicit in the facade, then recorded the 65-test Event repository gate plus Android/iOS artifact evidence.
