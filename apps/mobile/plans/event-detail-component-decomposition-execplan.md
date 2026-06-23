# Decompose EventDetailComponent Responsibilities

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is self-contained for a contributor who has only the current working tree and this plan. The related but separate UI-oriented plan is `plans/event-details-modularization-execplan.md`; that plan focuses on `EventDetails.kt`, while this plan focuses on `EventDetailComponent.kt` and its state/workflow responsibilities.

## Purpose / Big Picture

The mobile event detail feature currently works through one very large component implementation, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`. The public `EventDetailComponent` interface exposes event state and actions to the screen, while the concrete `DefaultEventDetailComponent` coordinates event loading, edit payload preparation, registration, payments, signatures, participants, invitations, league standings, match editing, bracket editing, images, sharing, and notifications.

After this refactor, the app should behave the same for users, but the code will be easier to change safely. A developer should be able to adjust event edit payload preparation, match editing, or registration/payment flow without reading the whole component. The observable outcome is that existing event detail and event creation flows compile and pass their focused regression tests, while `EventDetailComponent.kt` becomes an orchestration layer that delegates cohesive work to smaller helpers with direct tests.

## Progress

- [x] (2026-06-22) Audited current event-detail file sizes and confirmed `EventDetailComponent.kt` is the largest file in the Kotlin shared app at 7,904 lines.
- [x] (2026-06-22) Checked the existing `plans/event-details-modularization-execplan.md` and confirmed it covers UI extraction from `EventDetails.kt`, not decomposition of `DefaultEventDetailComponent`.
- [x] (2026-06-22) Created this ExecPlan before implementation.
- [x] (2026-06-22) Added the implementation rule that every code update must be followed by relevant tests, and progress is not accepted unless those tests pass or a blocker is documented.
- [x] (2026-06-22) Recorded a clean baseline with focused event-detail tests and common metadata compilation before moving component logic.
- [x] (2026-06-22) Extracted event edit payload, field draft, and timeslot draft preparation into `EventEditPayloadBuilder.kt` with direct focused tests.
- [x] (2026-06-22) Extracted pure match/bracket graph normalization, editable match validation, and bracket reset helpers into `EventMatchEditHelpers.kt` with direct focused tests.
- [x] (2026-06-22) Extracted join-confirmation target construction, event snapshot/cache matching, and registration-cache membership predicates into `EventRegistrationFlowHelpers.kt` with focused tests.
- [x] (2026-06-22) Extracted payment-plan preview state, selected-division resolution, and effective payment-plan normalization into `EventPaymentPlanHelpers.kt` with focused tests.
- [x] (2026-06-22) Extracted deterministic signature context queue and pending-step matching helpers into `EventSignatureFlowHelpers.kt` with focused tests.
- [x] (2026-06-22) Extracted event registration question answer normalization, missing-required detection, and request filtering into `EventRegistrationFlowHelpers.kt` with focused tests.
- [x] (2026-06-22) Extracted current-user registration cache membership, withdraw-target classification, refund eligibility, team-withdrawal decision, and registration/payment error predicates into `EventRegistrationFlowHelpers.kt` with focused tests.
- [x] (2026-06-22) Extracted event invite search normalization, invite context resolution, participant exclusion sets, and player invite DTO construction into `EventInviteHelpers.kt` with focused tests.
- [x] (2026-06-22) Extracted event sport-rule normalization for league and tournament set/timed scoring into `EventSportRulesHelpers.kt` with focused tests.
- [x] (2026-06-22) Extract registration, join, withdraw, refund, payment preview, and signature flow state into a cohesive coordinator without changing public behavior.
  - [x] (2026-06-22) Move registration question dialog, answer, expanded, hold, and registration-progress state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move join-choice and child-selection dialog state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move team join-question dialog and pending-team state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move pending joinable-child selection state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move self/team join execution action selection into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move team join-policy classification and submit loading selection into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move team registration target-id normalization into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move team registration result follow-up classification into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move team registration continuation branching into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move child-registration result message classification into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move self/minor join result and payment-plan pre-join decisions into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move self, team, child, and minor join orchestration decisions around the existing repository callbacks into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move payment-plan preview dialog and continuation state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move billing-address prompt and continuation state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move pending join-confirmation target state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move purchase-intent fee-breakdown UI state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move starting team registration and pending paid team-registration state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move pending payment-sheet purchase-intent state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move text/web signature prompt state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move signature context, pending-step, child/team target, and post-signature continuation state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move remaining signature polling job lifecycle into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move withdraw-target list state into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Move refund and leave action preflight decisions into `EventRegistrationFlowCoordinator` with focused tests.
  - [x] (2026-06-22) Wire remaining public registration actions through the coordinator and run the final coordinator regression suite.
- [x] (2026-06-22) Extract participant management and invite/search coordination where it can be tested independently.
  - [x] (2026-06-22) Move invite suggestions, team-invite loading, and pending staff-invite draft state into `EventInviteCoordinator` with focused tests.
  - [x] (2026-06-22) Move participant management snapshot/compliance loading state and request-token coordination into `EventParticipantManagementCoordinator` with focused tests.
  - [x] (2026-06-22) Move participant invite/add/remove preflight decisions into helpers or coordinator methods with focused tests.
- [ ] Thin `DefaultEventDetailComponent` so it owns Decompose lifecycle, public state exposure, and delegation, while helpers own domain-specific transformations.
  - [x] (2026-06-22) Move league standings state and division target decisions into `EventLeagueStandingsCoordinator` with focused tests.
  - [x] (2026-06-22) Move organization-template loading state into `EventOrganizationTemplatesCoordinator` with focused tests.
  - [x] (2026-06-22) Move rental resource selection, slot normalization, and rental-backed edit draft construction into `EventRentalResourcesCoordinator` with focused tests.
  - [x] (2026-06-22) Move template event creation and field/timeslot clone preparation into `EventTemplateCreateBuilder` with focused tests.
  - [x] (2026-06-22) Move match editing state, staged create/delete tracking, and match edit dialogs into `EventMatchEditingCoordinator` with focused tests.
  - [x] (2026-06-22) Move weekly occurrence selection, summary cache, and overview participant summary state into `EventWeeklyOccurrenceCoordinator` with focused tests.
  - [x] (2026-06-22) Move event edit draft state, field resizing, league slot edits, and scoring config mutation into `EventEditDraftCoordinator` with focused tests.
- [ ] Run focused event-detail regression tests and final compile/build validation.

## Surprises & Discoveries

- Observation: `EventDetailComponent.kt` already has some extracted collaborators, so the refactor should continue the existing pattern instead of creating a new architecture.
  Evidence: Existing nearby helper files include `EventScheduleRules.kt`, `EventMatchRules.kt`, `EventDetailsValidation.kt`, `EventStaffPersistence.kt`, `EventDetailDivisionOptions.kt`, `EventOverviewCapacity.kt`, `data/MatchOperationLocalApplier.kt`, and `data/BracketGraphValidator.kt`.

- Observation: `EventDetails.kt` is already covered by a separate plan and has been partially split.
  Evidence: `plans/event-details-modularization-execplan.md` records completed extraction of pure rules, shared UI primitives, read-only helpers, required documents, division list UI, and staff card UI, while leaving `EventDetails.kt` not yet orchestration-only.

- Observation: `EventDetailComponent.kt` has direct test coverage through component construction, especially for mobile join flow behavior.
  Evidence: `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailMobileJoinFlowTest.kt` constructs `DefaultEventDetailComponent` in many scenarios.

- Observation: Moving helper functions out of `EventDetailComponent.kt` can expose imports that still belong to the component.
  Evidence: The first post-extraction `./gradlew :composeApp:compileCommonMainKotlinMetadata` failed because `EventDetailComponent.kt` still used `toTimeZoneOrUtc` in rental slot conversion after its import was removed. Restoring the import made the same compile command pass.

- Observation: Event division defaults are normalized before being assigned to field drafts.
  Evidence: `EventEditPayloadBuilderTest.buildEditableFieldDrafts_defaults_empty_field_divisions_to_event_divisions` initially expected `division-a`; the code correctly returned the existing normalized identifier `division_a`, so the test was corrected and passed.

- Observation: Template creation uses the same division normalization path as event edit field and slot drafts.
  Evidence: The first `EventTemplateCreateBuilderTest` run expected raw `division-a`, but the extracted builder correctly returned `division_a`; updating the test expectation made the focused suite pass.

- Observation: The bracket round layout logic is not purely a graph helper because it still depends on component UI state for the losers bracket toggle.
  Evidence: `buildBracketRounds(...)` and `shouldIncludeInCurrentBracket(...)` still read `losersBracket.value`, so the second extraction moved bracket node construction, graph normalization, validation, and reset rules but left round layout inside `DefaultEventDetailComponent`.

- Observation: The first safe registration extraction is the join-confirmation boundary, not the full registration workflow.
  Evidence: `registrationMatchesJoinConfirmationTarget(...)`, `eventSnapshotMatchesJoinConfirmationTarget(...)`, and registration-cache membership predicates are deterministic, while payment preview, purchase intent processing, signature queues, and withdraw/refund flows still coordinate repositories, state flows, and UI prompts.

- Observation: Payment-plan preview and effective payment-plan selection are deterministic once the component passes event, division, minor, team-join, and full-state inputs explicitly.
  Evidence: `EventPaymentPlanHelpersTest` covers selected division plan details, team-signup suppression for self join, minor/full suppression, weekly relative due offsets, and missing division prices without constructing `DefaultEventDetailComponent`.

- Observation: The first safe signature extraction is queue and step matching logic; polling, prompt mutation, and repository calls are still component-owned.
  Evidence: `EventSignatureFlowHelpersTest` covers child-context chaining, fallback context selection, and pending signature step matching by template/document id. `EventDetailMobileJoinFlowTest` still covers required-document signing and post-signature checkout behavior.

- Observation: Event registration question answer handling has a deterministic core separate from dialog continuation and persistence.
  Evidence: `EventRegistrationQuestionHelpersTest` covers answer-id normalization, all-dialog-question answer maps, missing required answer selection, request filtering, and empty-question fallback behavior without constructing `DefaultEventDetailComponent`.

- Observation: Withdraw and refund flow still has a deterministic membership core separate from repository calls and UI state.
  Evidence: `EventWithdrawTargetHelpersTest` covers cached SELF/TEAM registration membership, weekly occurrence filtering, current-user cached-state precedence, event snapshot membership, paid-refund eligibility, team-withdrawal decisions, and server-message predicates without constructing `DefaultEventDetailComponent`.

- Observation: Event invite search has a small pure request-building and exclusion-set core.
  Evidence: `EventInviteHelpersTest` covers invite search query normalization, organization/sport fallback resolution, team/player participant exclusion sets, and event player invite DTO normalization without constructing `DefaultEventDetailComponent`.

- Observation: Sport-based league/tournament scoring normalization is deterministic once the available sports list is passed explicitly.
  Evidence: `EventSportRulesHelpersTest` covers non-competitive event no-op behavior, set-based league normalization, timed league normalization, and tournament bracket set/point normalization without constructing `DefaultEventDetailComponent`.

- Observation: The first coordinator slice can own registration question and progress state without owning repository persistence.
  Evidence: `EventRegistrationFlowCoordinator.kt` now owns question dialog state, answer state, expanded state, hold expiration state, registration progress key construction, draft construction, and draft restoration. `DefaultEventDetailComponent` still calls `CurrentUserDataSource` to save, load, and clear progress.

- Observation: The unfiltered debug unit suite currently has three reproducible failures outside the coordinator refactor.
  Evidence: `./gradlew :composeApp:testDebugUnitTest` completed 662 tests with 3 failures. Rerunning the three failing classes reproduced the same failures: two backend schedule HTTP 400 failures in mobile API integration tests, and one `TeamInviteDialogUiTest` failure with `No padding values provided`.

## Decision Log

- Decision: Keep the public `EventDetailComponent` interface and `DefaultEventDetailComponent` constructor stable during the first extraction milestones.
  Rationale: The screen and tests already depend on these entry points. The first goal is to reduce internal responsibility without creating a call-site migration.
  Date/Author: 2026-06-22 / Codex

- Decision: Start with event edit payload preparation before side-effectful registration or payment flows.
  Rationale: The edit payload code is cohesive, mostly deterministic, high-risk for scheduling regressions, and easier to cover with direct unit tests than flows that call repositories and payment processors.
  Date/Author: 2026-06-22 / Codex

- Decision: Use small internal helpers in the existing `com.razumly.mvp.eventDetail` package before introducing new Gradle modules or public APIs.
  Rationale: The broader Gradle modularization plan exists separately in `plans/kmp-feature-modularization-execplan.md`. This plan is a safer package-level decomposition that can happen first and will make later module extraction easier.
  Date/Author: 2026-06-22 / Codex

- Decision: Test after every implementation update and require passing tests before accepting progress.
  Rationale: This component sits on event creation, scheduling, registration, payments, and match editing paths. Small extractions can compile while subtly changing behavior, so each update must be paired with focused tests for the touched area and no milestone can be marked complete while its relevant tests are failing.
  Date/Author: 2026-06-22 / Codex

- Decision: Keep `DefaultEventDetailComponent` responsible for assigning `_editableFields`, `_fieldCount`, and `_editedEvent` after payload preparation, while moving the deterministic draft calculation into `EventEditPayloadBuilder`.
  Rationale: This preserves existing component state semantics and avoids moving mutable `StateFlow` ownership into the helper. The helper now returns both the prepared payload and the normalized editable field list for the component to apply.
  Date/Author: 2026-06-22 / Codex

- Decision: Extract match/bracket graph normalization and validation first, but leave staged-match creation and round layout in `DefaultEventDetailComponent`.
  Rationale: Graph normalization, overlap validation, schedule-match requirements, tournament-link requirements, and bracket reset decisions are deterministic and directly testable. Staged-match creation still depends on component state, generated IDs, current time, selected division, dialog opening, and editable-round refreshes, so it should move only after the pure helpers are stable.
  Date/Author: 2026-06-22 / Codex

- Decision: Split the registration/payment milestone into a pure join-confirmation helper first, leaving a coordinator extraction for a later step.
  Rationale: The join-confirmation helpers have clear input/output contracts and already had direct weekly behavior coverage. Moving them first reduces component size without changing the side-effectful payment, signature, withdraw, or refund flows.
  Date/Author: 2026-06-22 / Codex

- Decision: Extract payment-plan preview and effective plan selection before moving purchase intent or billing side effects.
  Rationale: These functions normalize event/division data and decide whether a preview should show, but do not launch checkout, create bills, mutate registration state, or call repositories. Keeping side effects in the component for now preserves behavior while making the next coordinator extraction smaller.
  Date/Author: 2026-06-22 / Codex

- Decision: Extract signature context queue and pending-step matching as helpers, but leave signature polling and prompt state inside `DefaultEventDetailComponent`.
  Rationale: Context queue building and step matching are deterministic and directly testable. Polling and prompt mutation depend on coroutine jobs, repositories, loading/error state, and pending continuation actions, so they should move only after the helper boundary is stable.
  Date/Author: 2026-06-22 / Codex

- Decision: Extract event registration question answer normalization while leaving dialog state, continuations, and registration-progress persistence in `DefaultEventDetailComponent`.
  Rationale: The helper can preserve the existing answer filtering contract with direct tests. The component still owns UI state and side effects, which keeps this milestone low risk and prepares the eventual registration coordinator extraction.
  Date/Author: 2026-06-22 / Codex

- Decision: Extract withdraw/refund membership rules before a side-effectful registration coordinator.
  Rationale: Cached registration classification, snapshot membership resolution, paid-refund eligibility, team-withdrawal selection, and known server-message predicates are pure decisions. Repository calls, selected profile refresh, loading/error state, and payment/refund mutations remain in `DefaultEventDetailComponent` until a coordinator can own them coherently.
  Date/Author: 2026-06-22 / Codex

- Decision: Extract invite request helpers before participant/invite coordination.
  Rationale: Query normalization, invite context fallback, exclusion-set calculation, and player invite DTO construction are deterministic. Repository calls for search, add-player/add-team, and create-invites remain in `DefaultEventDetailComponent` to preserve current side effects while reducing invite-specific branching in the component.
  Date/Author: 2026-06-22 / Codex

- Decision: Extract sport-rule normalization while leaving official-staff sport transitions in `DefaultEventDetailComponent`.
  Rationale: League/tournament set/timed scoring normalization is pure when given `Event` plus the current sports list. Official-staff syncing still depends on comparing previous and next component state and should move separately only with direct staffing coverage.
  Date/Author: 2026-06-22 / Codex

- Decision: Start the side-effectful registration coordinator as a state owner before moving repository or payment side effects.
  Rationale: Registration question prompts, answer normalization, hold state, and progress draft/key handling are cohesive and directly testable, while join, payment, signature, refund, and withdraw flows still depend on several repositories and continuation callbacks. Moving the state boundary first reduces component responsibility without changing public behavior.
  Date/Author: 2026-06-22 / Codex

## Outcomes & Retrospective

The first implementation milestone is complete. `EventEditPayloadBuilder.kt` now owns event update payload preparation, editable field draft normalization, league slot draft normalization, default field helpers, default league slot creation, league scoring DTO conversion, and recurring slot date-boundary helpers. `DefaultEventDetailComponent` still owns public state, lifecycle, repository calls, and state assignment after helper output. `EventDetailComponent.kt` dropped from 7,904 lines to 7,492 lines after this milestone.

The second implementation milestone is complete. `EventMatchEditHelpers.kt` now owns editable bracket node construction, bracket graph normalization, editable match validation, bracket match detection, and reset-to-empty-bracket-match behavior. `DefaultEventDetailComponent` still owns staged-match creation, edit-mode state, repository calls, and UI round layout. `EventDetailComponent.kt` dropped further to 7,322 lines after this milestone.

The third implementation milestone is a partial registration-flow extraction. `EventRegistrationFlowHelpers.kt` now owns join-confirmation target construction, event snapshot matching, registration-cache matching, and registration-cache status/role predicates. `DefaultEventDetailComponent` still owns payment previews, purchase intent processing, signature queues, withdraw/refund flows, repository calls, and UI-facing state. `EventDetailComponent.kt` dropped further to 7,220 lines after this milestone.

The fourth implementation milestone is another partial registration-flow extraction. `EventPaymentPlanHelpers.kt` now owns payment-plan preview dialog state, selected-division detail resolution, and effective payment-plan normalization. `DefaultEventDetailComponent` still owns showing/dismissing the preview dialog, continuing the pending action, purchase intent processing, billing side effects, signature queues, withdraw/refund flows, repository calls, and UI-facing state. `EventDetailComponent.kt` dropped further to 7,100 lines after this milestone.

The fifth implementation milestone is a partial signature-flow extraction. `EventSignatureFlowHelpers.kt` now owns signature context queue construction, indexed context fallback, and pending signature step matching. `DefaultEventDetailComponent` still owns signature step loading, prompt state, polling, text signature submission, purchase intent document prompts, billing side effects, repository calls, and UI-facing state. `EventDetailComponent.kt` dropped further to 7,077 lines after this milestone.

The sixth implementation milestone is another partial registration-flow extraction. `EventRegistrationFlowHelpers.kt` now also owns event registration question answer updates, dialog answer normalization, missing required question detection, and request-answer filtering. `DefaultEventDetailComponent` still owns dialog state, continuation execution, registration-progress persistence, repository calls, and UI-facing state. `EventDetailComponent.kt` dropped further to 7,067 lines after this milestone.

The seventh implementation milestone is another partial registration/withdraw/refund extraction. `EventRegistrationFlowHelpers.kt` now also owns current-user registration-cache membership resolution, event snapshot membership helpers, withdraw-target membership classification, paid-refund eligibility, registered-team withdrawal decisions, and duplicate/already-registered error predicates. `DefaultEventDetailComponent` still owns selected weekly occurrence state, child target loading, repository calls, payment/refund mutations, loading/error state, and UI-facing state. `EventDetailComponent.kt` dropped further to 6,910 lines after this milestone.

The eighth implementation milestone starts the participant/invite extraction. `EventInviteHelpers.kt` now owns invite search query normalization, event organization/sport context fallback, team/player exclusion-set calculation, and event player invite DTO construction. `DefaultEventDetailComponent` still owns user/team repository calls, participant mutation refresh, selected weekly occurrence prompts, loading/error state, and UI-facing suggestion lists. `EventDetailComponent.kt` dropped further to 6,893 lines after this milestone.

The ninth implementation milestone extracts event sport-rule normalization. `EventSportRulesHelpers.kt` now owns set/timed scoring normalization for league and tournament events, including division-level league rules and nested playoff tournament config rules. `DefaultEventDetailComponent` still owns sport list state, official-staff sport transitions, edit-mode state, and repository calls. `EventDetailComponent.kt` dropped further to 6,731 lines after this milestone.

The tenth implementation milestone starts the cohesive registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns event registration question dialog state, answer state, expanded state, hold expiration state, registration progress key construction, draft construction, and draft restoration. `DefaultEventDetailComponent` still owns `CurrentUserDataSource`, event/user/occurrence selection, repository calls, payment processing, signature polling, withdraw/refund mutations, and public actions. `EventDetailComponent.kt` dropped further to 6,655 lines after this milestone.

The eleventh implementation milestone moves payment-plan preview state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the payment-plan preview dialog and pending preview continuation, while `DefaultEventDetailComponent` still builds preview content, decides when to show it, and launches the existing join/signature continuations. `EventDetailComponent.kt` dropped further to 6,651 lines after this milestone.

The twelfth implementation milestone moves withdraw-target list state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the withdraw target list exposed to the UI, while `DefaultEventDetailComponent` still computes targets from the current user, linked children, cached membership, and event snapshot, and still owns leave/refund repository operations. `EventDetailComponent.kt` dropped further to 6,649 lines after this milestone.

The thirteenth implementation milestone moves billing-address prompt state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the billing-address prompt and pending continuation, while `DefaultEventDetailComponent` still loads and saves billing addresses through `BillingRepository` before invoking the returned continuation. `EventDetailComponent.kt` dropped further to 6,645 lines after this milestone.

The fourteenth implementation milestone moves text/web signature prompt state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns prompt visibility and prompt replacement/clearing for both mobile text signatures and web signing prompts, while `DefaultEventDetailComponent` still owns signature step loading, polling, signature recording, context selection, and post-signature continuation execution. `EventDetailComponent.kt` is now 6,646 lines after this milestone.

The fifteenth implementation milestone moves join-choice and child-selection dialog state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the self-or-child join-choice dialog and child-selection dialog, while `DefaultEventDetailComponent` still loads linked children, validates registration eligibility, and executes the self/child join flows. `EventDetailComponent.kt` dropped further to 6,638 lines after this milestone.

The sixteenth implementation milestone moves team join-question dialog state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the team join-question dialog, required-answer validation for that dialog, and the pending team reference needed after answers are submitted. `DefaultEventDetailComponent` still fetches team registration context, calls team repositories, handles registration results, and continues paid team registration. `EventDetailComponent.kt` dropped further to 6,632 lines after this milestone.

The seventeenth implementation milestone moves pending join-confirmation target state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the post-payment confirmation target used after self/team purchase intents complete, while `DefaultEventDetailComponent` still builds targets, waits for registration confirmation, refreshes event/user state, and owns payment result handling. `EventDetailComponent.kt` is now 6,635 lines after this milestone.

The eighteenth implementation milestone moves purchase-intent fee-breakdown UI state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns fee-breakdown visibility, current fee-breakdown data, and pending fee-confirm continuation. `DefaultEventDetailComponent` still processes purchase intents, shows the payment sheet, and handles payment results. `EventDetailComponent.kt` dropped further to 6,628 lines after this milestone.

The nineteenth implementation milestone moves starting team registration and pending paid team-registration state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the in-flight team registration id exposed to the UI and the pending paid team registration reference used by payment results. `DefaultEventDetailComponent` still fetches team join context, calls team repositories, creates team registration purchase intents, shows the payment sheet, and refreshes team/user state. `EventDetailComponent.kt` dropped further to 6,614 lines after this milestone.

The twentieth implementation milestone moves signature flow state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the pending signature context queue, current step metadata, child/team signature target, and post-signature continuation. `DefaultEventDetailComponent` still owns signature repository calls, loading/error handling, and the coroutine poll job tied to component scope. `EventDetailComponent.kt` dropped further to 6,587 lines after this milestone.

The twenty-first implementation milestone moves pending payment-sheet purchase-intent state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the pending checkout intent, consumes it once when the component presents the payment sheet, preserves it through fee-breakdown confirmation, and clears it when fee breakdown is dismissed. `DefaultEventDetailComponent` still owns Stripe payment processor calls, billing-address loading, loading/error state, and payment result handling. `EventDetailComponent.kt` is now 6,595 lines after this milestone.

The twenty-second implementation milestone moves refund and leave action preflight decisions into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns withdraw/refund target normalization, membership error messages, paid-refund eligibility messaging, started-event rejection messaging, weekly individual-refund rejection, and team-withdrawal selection. `DefaultEventDetailComponent` still owns resolving membership from the current event/cache, repository calls, loading/error state mutation, and event refresh after mutation. `EventDetailComponent.kt` dropped further to 6,558 lines after this milestone.

The twenty-third implementation milestone moves pending joinable-child selection state into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now retains the joinable child list across join-choice and child-selection dialog transitions and resolves selected child ids for the component. `DefaultEventDetailComponent` still loads linked children, validates registration availability/questions, runs signature checks, and executes child registration repository calls. `EventDetailComponent.kt` dropped further to 6,554 lines after this milestone.

The twenty-fourth implementation milestone moves self/team join execution action selection into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now decides whether a join should request parent approval, require a division price, start a payment plan, join directly, or create a purchase intent from the effective payment-plan inputs. `DefaultEventDetailComponent` still owns the repository calls, billing-address prompts, payment-intent processing, rollback handling, loading state, and refresh behavior for each branch. `EventDetailComponent.kt` is now 6,567 lines after this milestone.

The twenty-fifth implementation milestone moves signature polling job lifecycle into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns poll-job replacement, cancellation, and clearing as part of the pending signature flow, while `DefaultEventDetailComponent` still owns the coroutine body, signature polling repository calls, prompt progression, error handling, and refresh continuations. `EventDetailComponent.kt` dropped to 6,564 lines after this milestone.

The twenty-sixth implementation milestone moves team join-policy classification into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now decides whether a team join policy is open, request-to-join, or closed, owns the closed-policy error message, and supplies the submit loading label for team join-question continuations. `DefaultEventDetailComponent` still loads team join context, shows question dialogs, and executes team join/request repository calls. `EventDetailComponent.kt` dropped to 6,557 lines after this milestone.

The twenty-seventh implementation milestone moves team registration target-id normalization into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now owns the parent-team fallback rule used by team registration start, join-question submission, team join/request submission, and registration target resolution. `DefaultEventDetailComponent` still fetches parent team data when needed and owns all team repository calls. `EventDetailComponent.kt` dropped to 6,555 lines after this milestone.

The twenty-eighth implementation milestone moves team registration result follow-up classification into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now decides whether a team registration result should wait for parent approval, require child email, start additional signing, or continue, including the user-facing fallback messages for the first two cases. `DefaultEventDetailComponent` still refreshes event data, starts signing, requests refreshed team registration, and continues checkout/active-join handling. `EventDetailComponent.kt` is now 6,557 lines after this milestone.

The twenty-ninth implementation milestone moves team registration continuation branching into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now decides whether continuing team registration should reject a missing team id, start paid checkout, reject an inactive registration result, or complete an active join. `DefaultEventDetailComponent` still owns billing-address prompts, purchase-intent creation, team refresh, membership refresh, and success/error state mutation. `EventDetailComponent.kt` is now 6,557 lines after this milestone.

The thirtieth implementation milestone moves child-registration result message classification into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now turns a `ChildRegistrationResult` into the user-facing completion, waitlist, parent-approval, child-email, consent-status, pending-status, default pending, and first-warning message. `DefaultEventDetailComponent` still owns registration, event refresh, loading/error state mutation, and repository failure handling. `EventDetailComponent.kt` dropped to 6,538 lines after this milestone.

The thirty-first implementation milestone moves self/minor join result and payment-plan pre-join decisions into the registration coordinator. `EventRegistrationFlowCoordinator.kt` now classifies parent-approval and waitlist messages for self/minor join results, determines whether self payment-plan pre-join should continue, reload the event, report a non-duplicate failure, or remember that rollback is required. `DefaultEventDetailComponent` still owns repository calls, billing creation, rollback execution, event refresh, loading/error mutation, and payment purchase-intent flow. `EventDetailComponent.kt` dropped to 6,524 lines after this milestone.

The thirty-second implementation milestone completes the current self/team/child/minor join orchestration decision slice. `EventRegistrationFlowCoordinator.kt` now classifies team join-before-payment-plan results, treats duplicate already-registered errors as resumable payment-plan paths, preserves rollback intent, owns user/team payment-plan success copy, and exposes the shared `PaymentPlanBillStatus` used by billing creation. `DefaultEventDetailComponent` still owns repository calls, billing creation, rollback execution, event refresh, loading/error mutation, and purchase-intent processing. `EventDetailComponent.kt` dropped to 6,518 lines after this milestone.

The thirty-third implementation milestone closes the registration coordinator parent task. Public registration, join, withdraw/refund, payment preview, billing-address, payment-sheet, fee-breakdown, and signature prompt state now route through `EventRegistrationFlowCoordinator`, while `DefaultEventDetailComponent` remains responsible for Decompose lifecycle, repository and billing side effects, refreshes, coroutine execution, and UI-facing public state exposure. The final coordinator regression suite passed across coordinator, mobile join-flow, payment-plan helper, signature helper, registration-question helper, and withdraw/refund helper tests. `EventDetailComponent.kt` remains 6,518 lines after this close-out.

The thirty-fourth implementation milestone starts participant/invite coordination extraction. `EventInviteCoordinator.kt` now owns suggested-user state, team invite suggestion state, team invite loading state, and pending staff-invite draft state. `DefaultEventDetailComponent` still owns user/team/staff repository calls, email membership checks, event mutation, refresh behavior, and loading/error state, but delegates invite UI state mutations and pending staff-invite merging/removal to the coordinator. `EventDetailComponent.kt` dropped to 6,481 lines after this milestone.

The thirty-fifth implementation milestone moves participant management state and request-token coordination into a coordinator. `EventParticipantManagementCoordinator.kt` now owns event team/participant loading state, participant management snapshots, division warnings, team/user compliance summaries, participant management and compliance loading flags, managed-detail bootstrap suppression, and stale request-token handling. `DefaultEventDetailComponent` still owns repository calls, Room observations, permission checks, selected occurrence resolution, and error/logging behavior. `EventDetailComponent.kt` dropped to 6,411 lines after this milestone.

The thirty-sixth implementation milestone completes the participant/invite coordination extraction. `EventInviteHelpers.kt` now owns team/player invite preflight decisions and user-removal id preflight, preserving existing user-facing error copy while `DefaultEventDetailComponent` keeps weekly occurrence prompts, repository mutations, refreshes, and loading/error side effects. `EventDetailComponent.kt` dropped to 6,404 lines after this milestone.

The thirty-seventh implementation milestone starts the final component-thinning task. `EventLeagueStandingsCoordinator.kt` now owns league standings data/loading/confirming state, standings load-target resolution, current standings division resolution, and confirmation success copy. `DefaultEventDetailComponent` still owns repository calls, schedule refresh triggers, selected event/division flows, loading/error side effects, and match/event refreshes after confirmation. `EventDetailComponent.kt` dropped to 6,382 lines after this milestone.

The thirty-eighth implementation milestone moves organization-template loading state into a coordinator. `EventOrganizationTemplatesCoordinator.kt` now owns template list, loading, error, clear, success, and failure state transitions while `DefaultEventDetailComponent` keeps the billing repository call, organization selection, logging, and error-message normalization. `EventDetailComponent.kt` dropped to 6,375 lines after this milestone.

The thirty-ninth implementation milestone extracts a larger rental-resource chunk. `EventRentalResourcesCoordinator.kt` now owns available rental resources, selected rental resource ids, attached-resource selection from existing rental-backed slots, selection changes, selected rental fields, non-rental slot cleanup, rental-backed slot normalization, and rental-backed edit draft construction. `DefaultEventDetailComponent` still owns billing repository loading, edit-flow assignment, and event draft state exposure. `EventDetailComponent.kt` dropped to 6,217 lines after this milestone.

The fortieth implementation milestone extracts another larger template-creation chunk. `EventTemplateCreateBuilder.kt` now owns template event shell construction, participant/staff reset, official id remapping, field clone/persistence decisions, timeslot remapping/cloning, and league scoring config selection. `DefaultEventDetailComponent` still owns already-template validation, current event/edit-state selection, repository creation, loading/error side effects, and navigation-facing state. `EventDetailComponent.kt` dropped to 6,060 lines after this milestone.

The forty-first implementation milestone extracts match editing coordination. `EventMatchEditingCoordinator.kt` now owns match edit mode state, editable matches/rounds, staged match create/delete metadata, pending create cleanup, team-selection dialog state, match-edit dialog state, staged schedule/bracket match construction, bracket-anchor insertion, match update/delete/lock transitions, and bulk update payload preparation. `DefaultEventDetailComponent` still owns permission checks, selected event/division context, the `buildBracketRounds` display helper, `matchRepository.updateMatchesBulk`, loading/error side effects, and notification sending. `EventDetailComponent.kt` dropped to 5,829 lines after this milestone.

The forty-second implementation milestone extracts weekly occurrence state and summary coordination. `EventWeeklyOccurrenceCoordinator.kt` now owns selected occurrence state, selected occurrence summaries, weekly summary cache, overview participant summary state, selection validation, selected-start checks, summary remembering, and pending prefetch filtering. `DefaultEventDetailComponent` still owns repository sync, prefetch job lifecycle, participant sync side effects, loading/error state, and registration/participant action calls. `EventDetailComponent.kt` dropped to 5,731 lines after this milestone.

The forty-third implementation milestone extracts edit draft state coordination. `EventEditDraftCoordinator.kt` now owns edit-mode state exposure, edited event draft state, editable field drafts, field-count resizing, league slot drafts, league scoring config mutation, readonly draft refresh, edit-mode seeding, edited-event resync, rental draft application, and prepared-field application. `DefaultEventDetailComponent` still owns permission checks, sports loading, official-staff sport transition decisions, rental-resource repository calls, template creation side effects, update repository calls, and loading/error state. `EventDetailComponent.kt` dropped to 5,649 lines after this milestone.

Focused helper tests and related schedule/weekly/match/join/payment/signature/question regression tests pass. Registration coordination and participant/invite coordination are now complete; the remaining work is to keep thinning `DefaultEventDetailComponent` around lower-risk orchestration seams, then run final focused regression and build validation.

## Context and Orientation

This repository is a Kotlin Multiplatform app. Shared app code lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/`. The event detail feature lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`.

`EventDetailComponent.kt` contains two key types. `EventDetailComponent` is the public interface used by the screen. It exposes `StateFlow` values such as `selectedEvent`, `divisionMatches`, `eventFields`, `participantManagementSnapshot`, `editableMatches`, `editableLeagueTimeSlots`, and dialog states. It also exposes actions such as `joinEvent`, `updateEvent`, `rescheduleEvent`, `commitMatchChanges`, `startManagingParticipants`, `invitePlayerToEvent`, `confirmTextSignature`, and `sendNotification`. `DefaultEventDetailComponent` is the concrete implementation. It starts around line 712 in the current file and mixes lifecycle handling, repository calls, state mutation, pure data preparation, and UI-facing workflow decisions.

The current largest shared Kotlin files in this area are:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`, 7,904 lines.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`, 7,135 lines.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, 5,481 lines.

This plan targets `EventDetailComponent.kt` first. `EventDetailScreen.kt` and `EventDetails.kt` can be split later, but they should not block making the component safer. A helper in this plan means an `internal` Kotlin class or function in the same package that can be tested directly from `commonTest`. A coordinator means a small class that owns one workflow's state transitions and delegates side effects through injected functions or repositories; it should not know about Compose UI.

Backend endpoint paths and request/response contracts come from the sibling `mvp-site` repository. Do not invent or change backend payloads during this refactor. If an endpoint or payload shape must be checked, use `/Users/elesesy/StudioProjects/mvp-site/` as the source of truth.

## Plan of Work

First, record the baseline. Run focused event-detail tests that cover schedule rules, weekly behavior, join flow, division options, staff persistence, and match/bracket helpers. Also run a shared Kotlin compile task. If any test fails before changes, record the failure in `Surprises & Discoveries` and avoid mixing a pre-existing failure with the refactor.

During implementation, test after every code update before proceeding to the next update. A code update means any extraction, helper introduction, call-path reroute, test addition, or removal of old private functions. Run the smallest focused tests that cover the changed behavior immediately, then run the broader validation suite at milestone boundaries. Do not mark a `Progress` item complete unless the relevant tests passed. If a test cannot be run or fails for an environment reason, record the command, failure, and required follow-up in `Surprises & Discoveries` and `Artifacts and Notes`.

Second, extract the event edit payload preparation block. In the current file, this starts around the private `PreparedEventForUpdate` data class near line 5915 and includes `prepareEventForUpdate`, `buildFieldDrafts`, `buildLeagueSlotDrafts`, `editableLeagueTimeSlotsForEvent`, `syncEditableLeagueSlotBoundaries`, `buildEditableFieldDrafts`, `syncEditableFieldsForEvent`, default field helpers, league scoring conversion, default slot creation, and date/minute/day conversion helpers. Create a new file such as `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilder.kt`. The helper should receive explicit input values and return prepared values. It should not read or mutate `MutableStateFlow` directly. `DefaultEventDetailComponent` can remain responsible for assigning returned values back into `_editableFields`, `_fieldCount`, `_editedEvent`, or `_editableLeagueTimeSlots`.

The first extraction should introduce direct tests in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilderTest.kt`. Cover at least these cases: field drafts preserve selected rental-backed field IDs, empty field divisions become event divisions and then `OPEN`, non-repeating slot times derive `dayOfWeek`, `daysOfWeek`, and start/end minutes, repeating weekly slots preserve multiple weekdays, and invalid slots with no valid fields or invalid time bounds are dropped. These cases map to repository guidelines about explicit field division assignment and multi-weekday weekly timeslots.

Third, extract match and bracket editing helpers. The current component has local logic for refreshing editable rounds, building bracket nodes, normalizing editable bracket graphs, finding the next editable match number, creating staged matches, validating match changes, checking overlaps, resetting bracket matches, and checking bracket membership. Some infrastructure already exists in `data/MatchOperationLocalApplier.kt` and `data/BracketGraphValidator.kt`; prefer extending those existing helpers or adding `EventMatchEditStateBuilder.kt` rather than creating parallel concepts. Keep `DefaultEventDetailComponent` in charge of repository calls such as commit operations, but move deterministic match transformations and validation into testable functions.

Fourth, isolate registration and payment flow state. This area includes event registration questions, weekly occurrence selection, join choice dialogs, child join selection, registration holds, payment plan preview, billing address prompts, text/web signature prompts, withdraw targets, paid refund checks, and purchase intent processing. Create a coordinator only after the pure helper extractions have passed. The coordinator should own state transition functions and receive side-effect callbacks for repository calls, purchase launch, and navigation. Preserve `EventDetailComponent` public actions such as `joinEvent`, `joinEventAsTeam`, `confirmJoinAsSelf`, `leaveEvent`, `withdrawAndRefund`, `requestRefund`, `confirmTextSignature`, and `submitBillingAddress`.

Fifth, isolate participant management and invitations. Participant management includes bootstrapping managed participant data, moving participant divisions, removing users or teams, billing snapshots, team compliance summaries, and participant warnings. Invitations include user search, team search, pending staff invites, inviting teams, inviting players, inviting by email, and free-agent team invitations. Extract this only where tests can prove the state and request mapping, and do not change endpoint usage without checking `mvp-site`.

Finally, thin `DefaultEventDetailComponent`. The component should still expose the same public state and actions, own the Decompose lifecycle, own coroutine scope and cancellation, and wire repositories. It should delegate cohesive transformations and workflow decisions to helpers. Stop after each milestone to update `Progress`, `Surprises & Discoveries`, and `Outcomes & Retrospective`.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app` on macOS.

Record baseline file size and focused test behavior:

    rg --files composeApp/src/commonMain/kotlin composeApp/src/androidMain/kotlin composeApp/src/iosMain/kotlin | rg '\.kt$' | xargs wc -l | sort -nr | head -20
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailWeeklyBehaviorTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueSlotValidationTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsScheduleLockingTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailDivisionOptionsTest*"
    ./gradlew :composeApp:compileCommonMainKotlinMetadata

After extracting event edit payload preparation, run:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventEditPayloadBuilderTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueSlotValidationTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailWeeklyBehaviorTest*"
    ./gradlew :composeApp:compileCommonMainKotlinMetadata

After extracting match and bracket helpers, run:

    ./gradlew :composeApp:testDebugUnitTest --tests "*BracketGraphValidatorTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*MatchRepositoryHttpTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsMatchRulesTest*"
    ./gradlew :composeApp:compileCommonMainKotlinMetadata

After registration, payment, participant, or invitation coordinator changes, run the relevant focused tests plus the broader debug suite:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    ./gradlew :composeApp:testDebugUnitTest --tests "*EventStaffPersistenceTest*"
    ./gradlew :composeApp:testDebugUnitTest

Before completion, run:

    ./gradlew :composeApp:testDebugUnitTest
    ./gradlew :composeApp:testReleaseUnitTest
    ./gradlew :composeApp:assembleDebug

If iOS simulator validation is needed and Xcode tooling is available, also run:

    ./gradlew :composeApp:allTests

## Validation and Acceptance

Acceptance requires behavior preservation and better separability.

Every implementation update must leave the relevant focused tests passing before work continues. Every milestone must leave the milestone-specific tests and compile command passing. Final acceptance requires the full requested debug and release test commands to pass, plus Android debug assembly, unless a platform/environment blocker is documented with the exact failing command and follow-up.

The public `EventDetailComponent` interface and `DefaultEventDetailComponent` constructor should remain source-compatible unless this plan is explicitly revised with a decision explaining why a public migration is necessary. Existing event detail and event creation call sites should compile without changing their behavior.

The first milestone is accepted when event edit payload preparation can be tested without constructing `DefaultEventDetailComponent`, and when the new helper tests prove field division defaults, rental-backed fields, non-repeating slots, repeating multi-weekday slots, and invalid slot filtering.

The match/bracket milestone is accepted when deterministic match transformations and validation can be tested outside the component, and existing bracket graph or match rule tests still pass.

The registration/payment milestone is accepted when existing mobile join flow tests still pass, public actions still behave through the component, and the extracted coordinator has focused tests for state transitions that do not require real network or payment services.

The overall plan is accepted when `EventDetailComponent.kt` is materially smaller, `DefaultEventDetailComponent` is mostly lifecycle/delegation/repository orchestration, the focused tests listed above pass, and Android debug assembly succeeds. The target is not an arbitrary line-count number, but a practical checkpoint is to remove at least the edit payload and match/bracket transformation clusters from the file before claiming meaningful progress.

## Idempotence and Recovery

Make this refactor additive-first. Add helpers and tests, route one call path through them, then remove duplicated private functions after tests pass. Keep helpers `internal` and in the same package unless there is a proven need for public API. Avoid file moves that combine unrelated behavior changes with extraction.

If a test fails after an extraction, first confirm whether the failure reproduces on the previous commit or before the extraction. If the failure is caused by the extraction, prefer restoring the old behavior through tests and small adapters instead of changing product semantics. Do not use destructive git commands. Inspect `git diff` and repair the smallest relevant files.

Generated Gradle files under `build/` are ephemeral. Do not commit them. If Room entities are modified, stop and revise this plan before proceeding because this refactor is not intended to change Room schema.

## Artifacts and Notes

Record key command outputs here as work proceeds. Keep snippets concise and focused on proof of success or failure.

Initial audit evidence:

    7904 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
    7135 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    5481 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt

Existing direct component test evidence:

    composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventDetailMobileJoinFlowTest.kt constructs DefaultEventDetailComponent in multiple scenarios.

Baseline focused tests passed before source extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*" --tests "*EventDetailWeeklyBehaviorTest*" --tests "*LeagueSlotValidationTest*" --tests "*EventDetailsScheduleLockingTest*" --tests "*EventDetailDivisionOptionsTest*"
    Exit code: 0

Withdraw/refund helper extraction tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventWithdrawTargetHelpersTest*"
    Exit code: 0

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationQuestionHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0

Invite helper extraction tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventInviteHelpersTest*"
    Exit code: 0

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 49s; 43 actionable tasks: 5 executed, 38 up-to-date.
    Notes: Gradle started the local backend from `/Users/elesesy/StudioProjects/mvp-site`; `adb` was not found, so emulator port reverse was skipped.

Baseline common metadata compilation passed before source extraction:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 40s; 11 actionable tasks: 4 executed, 7 up-to-date.
    Notes: Compilation reported existing warnings in `EventRepository.kt`, `EventDetailComponent.kt`, `EventDetails.kt`, `LeagueScheduleFields.kt`, `ParticipantsVeiw.kt`, `SetCountDropdown.kt`, `TeamSizeLimitDropdown.kt`, `RentalSchedulingUtils.kt`, `RentalBuilderContent.kt`, `ProfileMyScheduleScreen.kt`, `ProfileDetailsScreen.kt`, and `RefundManagerScreen.kt`. These warnings did not fail the build.

First post-extraction compile caught and verified a wiring fix:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    First run exit code: 1
    Failure: `EventDetailComponent.kt` still used `toTimeZoneOrUtc` after the import was removed.
    Fix: restored `import com.razumly.mvp.core.util.toTimeZoneOrUtc`.

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Second run exit code: 0
    Result: BUILD SUCCESSFUL in 19s; 11 actionable tasks: 3 executed, 8 up-to-date.

First helper test run exposed a test expectation issue, then passed after correction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventEditPayloadBuilderTest*"
    First run exit code: 1
    Failure: expected raw `division-a`, but the existing division normalization contract returns `division_a`.

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventEditPayloadBuilderTest*"
    Second run exit code: 0
    Result: BUILD SUCCESSFUL in 36s; 43 actionable tasks: 6 executed, 37 up-to-date.

Related schedule and weekly regression tests passed after extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*LeagueSlotValidationTest*" --tests "*EventDetailWeeklyBehaviorTest*" --tests "*EventDetailsScheduleLockingTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 16s; 43 actionable tasks: 5 executed, 38 up-to-date.

Milestone common metadata compilation passed after tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2s; 11 actionable tasks: 2 executed, 9 up-to-date.

Post-milestone line-count evidence:

    7492 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     509 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilder.kt
     239 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventEditPayloadBuilderTest.kt

Whitespace audit passed:

    git diff --check
    Exit code: 0

Match/bracket helper extraction compile passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 27s; 11 actionable tasks: 3 executed, 8 up-to-date.

Direct match/bracket helper tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventMatchEditHelpersTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 55s; 43 actionable tasks: 10 executed, 33 up-to-date.

Related match/bracket regression tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*BracketGraphValidatorTest*" --tests "*MatchRepositoryHttpTest*" --tests "*EventDetailsMatchRulesTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 15s; 43 actionable tasks: 5 executed, 38 up-to-date.

Milestone common metadata compilation passed after match/bracket tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2s; 11 actionable tasks: 2 executed, 9 up-to-date.

Second milestone line-count evidence:

    7322 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     190 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchEditHelpers.kt
     246 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventMatchEditHelpersTest.kt

Second milestone whitespace audit passed:

    git diff --check
    Exit code: 0

Join-confirmation helper extraction focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailWeeklyBehaviorTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2m 7s; 43 actionable tasks: 10 executed, 33 up-to-date.

Related mobile join flow regression tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 23s; 43 actionable tasks: 5 executed, 38 up-to-date.

Milestone common metadata compilation passed after join-confirmation tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 18s; 11 actionable tasks: 3 executed, 8 up-to-date.

Third milestone line-count evidence:

    7220 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     109 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowHelpers.kt

Third milestone whitespace audit passed:

    git diff --check
    Exit code: 0

Payment-plan helper extraction focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventPaymentPlanHelpersTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 39s; 43 actionable tasks: 8 executed, 35 up-to-date.
    Notes: An earlier successful run took 2m 26s before cleanup of new helper warnings; the focused suite was rerun after the cleanup.

Related mobile join flow regression tests passed after payment-plan extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 14s; 43 actionable tasks: 5 executed, 38 up-to-date.

Milestone common metadata compilation passed after payment-plan tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 20s; 11 actionable tasks: 3 executed, 8 up-to-date.

Fourth milestone line-count evidence:

    7100 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     141 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventPaymentPlanHelpers.kt
     189 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventPaymentPlanHelpersTest.kt

Fourth milestone whitespace audit passed:

    git diff --check
    Exit code: 0

Signature helper extraction focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventSignatureFlowHelpersTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2m 3s; 43 actionable tasks: 10 executed, 33 up-to-date.

Related mobile join/signature flow regression tests passed after signature helper extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 15s; 43 actionable tasks: 5 executed, 38 up-to-date.

Milestone common metadata compilation passed after signature helper tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 17s; 11 actionable tasks: 3 executed, 8 up-to-date.

Fifth milestone line-count evidence:

    7077 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
      47 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventSignatureFlowHelpers.kt
     146 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventSignatureFlowHelpersTest.kt

Fifth milestone whitespace audit passed:

    git diff --check
    Exit code: 0

Registration question helper extraction focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationQuestionHelpersTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 49s; 43 actionable tasks: 9 executed, 34 up-to-date.

Related mobile join/question flow regression tests passed after registration question helper extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 13s; 43 actionable tasks: 5 executed, 38 up-to-date.

Milestone common metadata compilation passed after registration question helper tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 18s; 11 actionable tasks: 3 executed, 8 up-to-date.

Sixth milestone line-count evidence:

    7067 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     153 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowHelpers.kt
     112 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationQuestionHelpersTest.kt

Sixth milestone whitespace audit passed:

    git diff --check
    Exit code: 0

Sport-rule helper extraction focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventSportRulesHelpersTest*"
    Exit code: 0

Related event validation/edit payload regression tests passed after sport-rule helper extraction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsValidationTest*" --tests "*EventEditPayloadBuilderTest*"
    Exit code: 0

Milestone common metadata compilation passed after sport-rule helper tests:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0

Ninth milestone line-count evidence:

    6731 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     167 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventSportRulesHelpers.kt
     182 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventSportRulesHelpersTest.kt

Ninth milestone whitespace audit passed:

    git diff --check
    Exit code: 0

Registration coordinator first slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventRegistrationQuestionHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 16s; 43 actionable tasks: 5 executed, 38 up-to-date.

Registration coordinator first slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2s; 11 actionable tasks: 2 executed, 9 up-to-date.

Tenth milestone line-count evidence:

    6655 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     207 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     167 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Payment preview coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventPaymentPlanHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 33s; 43 actionable tasks: 9 executed, 34 up-to-date.

Payment preview coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 13s; 11 actionable tasks: 3 executed, 8 up-to-date.

Eleventh milestone line-count evidence:

    6651 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     230 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     210 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Withdraw-target coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventWithdrawTargetHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 55s; 43 actionable tasks: 9 executed, 34 up-to-date.

Withdraw-target coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 22s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twelfth milestone line-count evidence:

    6649 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     241 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     229 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Billing prompt coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 22s; 43 actionable tasks: 9 executed, 34 up-to-date.

Billing prompt coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 12s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirteenth milestone line-count evidence:

    6645 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     266 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     265 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Signature prompt coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventSignatureFlowHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 38s; 43 actionable tasks: 9 executed, 34 up-to-date.

Signature prompt coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 16s; 11 actionable tasks: 3 executed, 8 up-to-date.

Fourteenth milestone line-count evidence:

    6646 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     293 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     332 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Join dialog coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 31s; 43 actionable tasks: 9 executed, 34 up-to-date.

Join dialog coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 14s; 11 actionable tasks: 3 executed, 8 up-to-date.

Fifteenth milestone line-count evidence:

    6638 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     322 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     380 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Team join-question coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 40s; 43 actionable tasks: 9 executed, 34 up-to-date.

Team join-question coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 16s; 11 actionable tasks: 3 executed, 8 up-to-date.

Sixteenth milestone line-count evidence:

    6632 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     369 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     443 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Pending join-confirmation target coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*" --tests "*EventDetailWeeklyBehaviorTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 59s; 43 actionable tasks: 9 executed, 34 up-to-date.

Pending join-confirmation target coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 14s; 11 actionable tasks: 3 executed, 8 up-to-date.

Seventeenth milestone line-count evidence:

    6635 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     381 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     473 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Fee-breakdown coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventPaymentPlanHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 41s; 43 actionable tasks: 9 executed, 34 up-to-date.

Fee-breakdown coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 16s; 11 actionable tasks: 3 executed, 8 up-to-date.

Eighteenth milestone line-count evidence:

    6628 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     410 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     522 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Team registration state coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 33s; 43 actionable tasks: 9 executed, 34 up-to-date.

Team registration state coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 12s; 11 actionable tasks: 3 executed, 8 up-to-date.

Nineteenth milestone line-count evidence:

    6614 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     451 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     558 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Signature flow state coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventSignatureFlowHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 31s; 43 actionable tasks: 9 executed, 34 up-to-date.

Signature flow state coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 13s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twentieth milestone line-count evidence:

    6587 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     562 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     661 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Payment-sheet intent coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventPaymentPlanHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 38s; 43 actionable tasks: 9 executed, 34 up-to-date.

Payment-sheet intent coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 17s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-first milestone line-count evidence:

    6595 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     581 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     699 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Withdraw/refund preflight coordinator slice first focused test run caught a fixture issue:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventWithdrawTargetHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 1
    Result: 55 tests completed, 2 failed.
    Fix: `EventRegistrationFlowCoordinatorTest.paidEvent()` now includes the matching `divisions = listOf("open")` entry so `hasAnyPaidDivision()` sees the test division price.

Withdraw/refund preflight coordinator slice focused tests passed after fixture correction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventWithdrawTargetHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 26s; 43 actionable tasks: 6 executed, 37 up-to-date.

Withdraw/refund preflight coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 16s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-second milestone line-count evidence:

    6558 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     686 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     840 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Full debug unit suite currently blocked:

    ./gradlew :composeApp:testDebugUnitTest
    Exit code: 1
    Result: 662 tests completed, 3 failed.
    Failures:
    - `EventLifecycleMobileApiIntegrationTest.event_lifecycle_matrix_creates_joins_schedules_and_updates_matches`: backend schedule request returned HTTP 400 with "Not enough time is allotted in the configured time slots to schedule this event. Not enough teams are available to cover match and team-official slots."
    - `LeaguePlayoffMobileApiIntegrationTest.league_playoff_mobile_api_flow_loads_staff_invites_periphery_join_and_schedule_data`: backend schedule request returned HTTP 400 for `/api/events/mobile_api_league_playoff_regression/schedule`.
    - `TeamInviteDialogUiTest.existing_team_read_only_view_uses_team_name_title_inline_jersey_and_expandable_details`: `IllegalStateException: No padding values provided`.

Targeted rerun of the full-suite failures reproduced the same failures:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventLifecycleMobileApiIntegrationTest*" --tests "*LeaguePlayoffMobileApiIntegrationTest*" --tests "*TeamInviteDialogUiTest*"
    Exit code: 1
    Result: 6 tests completed, 3 failed.

Joinable-child selection coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 33s; 43 actionable tasks: 9 executed, 34 up-to-date.

Joinable-child selection coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 17s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-third milestone line-count evidence:

    6554 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     699 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     857 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Join execution action coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2m 2s; 43 actionable tasks: 9 executed, 34 up-to-date.

Join execution action coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 15s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-fourth milestone line-count evidence:

    6567 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     734 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
     972 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Signature poll-job lifecycle coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventSignatureFlowHelpersTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 40s; 43 actionable tasks: 9 executed, 34 up-to-date.

Signature poll-job lifecycle coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 23s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-fifth milestone line-count evidence:

    6564 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     750 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1000 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Team join-policy coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 48s; 43 actionable tasks: 9 executed, 34 up-to-date.

Team join-policy coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 14s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-sixth milestone line-count evidence:

    6557 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     788 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1036 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Team registration target-id coordinator slice first focused test run caught a fixture issue:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 1
    Result: `EventRegistrationFlowCoordinatorTest` failed to compile because direct `Team(...)` construction omitted required `division`, `name`, and `teamSize` fields.
    Fix: the test now uses the existing `Team(captainId = ...).copy(...)` fixture pattern.

Team registration target-id coordinator slice focused tests passed after fixture correction:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 33s; 43 actionable tasks: 6 executed, 37 up-to-date.

Team registration target-id coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 13s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-seventh milestone line-count evidence:

    6555 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     792 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1060 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Team registration result decision coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2m 4s; 43 actionable tasks: 9 executed, 34 up-to-date.

Team registration result decision coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 20s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-eighth milestone line-count evidence:

    6557 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     829 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1126 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt

Team registration continuation coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 44s; 43 actionable tasks: 9 executed, 34 up-to-date.

Team registration continuation coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 14s; 11 actionable tasks: 3 executed, 8 up-to-date.

Twenty-ninth milestone line-count evidence:

    6557 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     874 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1177 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt
    1045 plans/event-detail-component-decomposition-execplan.md

Child-registration result message coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2m 7s; 43 actionable tasks: 9 executed, 34 up-to-date.

Child-registration result message coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 25s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirtieth milestone line-count evidence:

    6538 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     897 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1236 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt
    1068 plans/event-detail-component-decomposition-execplan.md

Self/minor join result coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 40s; 43 actionable tasks: 9 executed, 34 up-to-date.

Self/minor join result coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 12s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-first milestone line-count evidence:

    6524 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     953 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1304 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt
    1091 plans/event-detail-component-decomposition-execplan.md

Team join payment-plan coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 33s; 43 actionable tasks: 9 executed, 34 up-to-date.

Team join payment-plan coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 11s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-second milestone line-count evidence:

    6518 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
    1008 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1366 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt
    1113 plans/event-detail-component-decomposition-execplan.md

Final registration coordinator regression suite passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRegistrationFlowCoordinatorTest*" --tests "*EventDetailMobileJoinFlowTest*" --tests "*EventPaymentPlanHelpersTest*" --tests "*EventSignatureFlowHelpersTest*" --tests "*EventRegistrationQuestionHelpersTest*" --tests "*EventWithdrawTargetHelpersTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 22s; 43 actionable tasks: 5 executed, 38 up-to-date.

Final registration coordinator close-out line-count evidence:

    6518 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
    1008 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinator.kt
    1366 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRegistrationFlowCoordinatorTest.kt
    1129 plans/event-detail-component-decomposition-execplan.md

Invite coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventInviteCoordinatorTest*" --tests "*EventInviteHelpersTest*" --tests "*EventStaffPersistenceTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 50s; 43 actionable tasks: 9 executed, 34 up-to-date.

Invite coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 20s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-fourth milestone line-count evidence:

    6481 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     117 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventInviteCoordinator.kt
     152 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventInviteCoordinatorTest.kt
    1154 plans/event-detail-component-decomposition-execplan.md

Participant management coordinator slice first focused test run caught a compile issue:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventParticipantManagementCoordinatorTest*" --tests "*EventInviteCoordinatorTest*" --tests "*EventInviteHelpersTest*" --tests "*EventStaffPersistenceTest*"
    Exit code: 1
    Result: `EventDetailComponent.kt` failed to compile because `target` was nullable after coordinator bootstrap gating.
    Fix: bind a non-null `bootstrapTarget` before using `toOccurrence()` and clearing bootstrap state.

Participant management coordinator slice focused tests passed after compile fix:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventParticipantManagementCoordinatorTest*" --tests "*EventInviteCoordinatorTest*" --tests "*EventInviteHelpersTest*" --tests "*EventStaffPersistenceTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 34s; 43 actionable tasks: 9 executed, 34 up-to-date.

Participant management coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 14s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-fifth milestone line-count evidence:

    6411 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     154 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventParticipantManagementCoordinator.kt
     153 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventParticipantManagementCoordinatorTest.kt
    1183 plans/event-detail-component-decomposition-execplan.md

Participant invite/add/remove preflight focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventInviteHelpersTest*" --tests "*EventInviteCoordinatorTest*" --tests "*EventParticipantManagementCoordinatorTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 42s; 43 actionable tasks: 9 executed, 34 up-to-date.

Participant invite/add/remove preflight common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 13s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-sixth milestone line-count evidence:

    6404 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     165 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventInviteHelpers.kt
     280 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventInviteHelpersTest.kt
    1205 plans/event-detail-component-decomposition-execplan.md

League standings coordinator slice first focused test run caught a compile issue:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventLeagueStandingsCoordinatorTest*" --tests "*LeagueStandingsPresentationTest*"
    Exit code: 1
    Result: `EventDetailComponent.kt` failed to compile because a private extension method reference to `isPlayoffPlacementDivision` is prohibited by Kotlin.
    Fix: pass the playoff-placement check as an explicit lambda.

League standings coordinator slice focused tests passed after compile fix:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventLeagueStandingsCoordinatorTest*" --tests "*LeagueStandingsPresentationTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 23s; 43 actionable tasks: 9 executed, 34 up-to-date.

League standings coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 12s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-seventh milestone line-count evidence:

    6382 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     100 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventLeagueStandingsCoordinator.kt
     148 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventLeagueStandingsCoordinatorTest.kt
    1235 plans/event-detail-component-decomposition-execplan.md

Organization templates coordinator slice focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventOrganizationTemplatesCoordinatorTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 30s; 43 actionable tasks: 9 executed, 34 up-to-date.

Organization templates coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 12s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-eighth milestone line-count evidence:

    6375 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
      40 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventOrganizationTemplatesCoordinator.kt
      60 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventOrganizationTemplatesCoordinatorTest.kt
    1258 plans/event-detail-component-decomposition-execplan.md

Rental resources coordinator slice first focused test run caught a test expectation issue:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRentalResourcesCoordinatorTest*"
    Exit code: 1
    Result: `EventRentalResourcesCoordinatorTest.edit_draft_merges_selected_rental_fields_and_slots_with_custom_resources` expected rental slot order before custom slot order, but the preserved component behavior sorts by start, start time, and id.
    Fix: update the test to assert the preserved sorted order and identify the rental slot by `sourceType`.

Rental resources coordinator slice focused tests passed after expectation fix:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventRentalResourcesCoordinatorTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 57s; 43 actionable tasks: 9 executed, 34 up-to-date.

Rental resources coordinator slice common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 18s; 11 actionable tasks: 3 executed, 8 up-to-date.

Thirty-ninth milestone line-count evidence:

    6217 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     240 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventRentalResourcesCoordinator.kt
     175 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventRentalResourcesCoordinatorTest.kt
    1288 plans/event-detail-component-decomposition-execplan.md

Template create builder first focused test run caught a test expectation issue:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventTemplateCreateBuilderTest*" --tests "*EventEditPayloadBuilderTest*"
    Exit code: 1
    Result: `EventTemplateCreateBuilderTest.league_template_clones_fields_slots_and_scoring_config` expected raw `division-a`, but the existing normalization path returned `division_a`.
    Fix: update the test to assert normalized division ids.

Template create builder focused tests passed after expectation fix:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventTemplateCreateBuilderTest*" --tests "*EventEditPayloadBuilderTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 52s; 43 actionable tasks: 6 executed, 37 up-to-date.

Template create builder common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 27s; 11 actionable tasks: 3 executed, 8 up-to-date.

Fortieth milestone line-count evidence:

    6060 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     211 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventTemplateCreateBuilder.kt
     181 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventTemplateCreateBuilderTest.kt
    1321 plans/event-detail-component-decomposition-execplan.md

Match editing coordinator focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventMatchEditingCoordinatorTest*" --tests "*EventMatchEditHelpersTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2m 18s; 43 actionable tasks: 10 executed, 33 up-to-date.

Match editing coordinator common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 14s; 11 actionable tasks: 3 executed, 8 up-to-date.

Related bracket and match regression tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*BracketGraphValidatorTest*" --tests "*EventDetailsMatchRulesTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 13s; 43 actionable tasks: 5 executed, 38 up-to-date.

Forty-first milestone line-count evidence:

    5829 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     497 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchEditingCoordinator.kt
     161 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventMatchEditingCoordinatorTest.kt
    1350 plans/event-detail-component-decomposition-execplan.md

Weekly occurrence coordinator focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventWeeklyOccurrenceCoordinatorTest*" --tests "*EventDetailWeeklyBehaviorTest*" --tests "*EventDetailMobileJoinFlowTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 1m 28s; 43 actionable tasks: 5 executed, 38 up-to-date.

Weekly occurrence coordinator common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 19s; 11 actionable tasks: 3 executed, 8 up-to-date.

Weekly occurrence overview capacity regression passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventOverviewCapacityTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 20s; 43 actionable tasks: 5 executed, 38 up-to-date.

Forty-second milestone line-count evidence:

    5731 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     203 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventWeeklyOccurrenceCoordinator.kt
     125 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventWeeklyOccurrenceCoordinatorTest.kt
    1379 plans/event-detail-component-decomposition-execplan.md

Edit draft coordinator focused tests passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventEditDraftCoordinatorTest*" --tests "*EventEditPayloadBuilderTest*" --tests "*EventTemplateCreateBuilderTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 2m 51s; 43 actionable tasks: 9 executed, 34 up-to-date.

Edit draft coordinator common metadata compilation passed:

    ./gradlew :composeApp:compileCommonMainKotlinMetadata
    Exit code: 0
    Result: BUILD SUCCESSFUL in 21s; 11 actionable tasks: 3 executed, 8 up-to-date.

Edit draft related validation and rental resource regressions passed:

    ./gradlew :composeApp:testDebugUnitTest --tests "*EventDetailsValidationTest*" --tests "*EventRentalResourcesCoordinatorTest*"
    Exit code: 0
    Result: BUILD SUCCESSFUL in 21s; 43 actionable tasks: 5 executed, 38 up-to-date.

Forty-third milestone line-count evidence:

    5649 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt
     211 composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventEditDraftCoordinator.kt
     190 composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/EventEditDraftCoordinatorTest.kt
    1408 plans/event-detail-component-decomposition-execplan.md

## Interfaces and Dependencies

Expected internal interfaces and helpers may include these names, but exact names can change if implementation reveals a better local fit:

    internal data class PreparedEventForUpdate(
        val event: Event,
        val fields: List<Field>?,
        val timeSlots: List<TimeSlot>?,
        val leagueScoringConfig: LeagueScoringConfigDTO?,
    )

    internal class EventEditPayloadBuilder {
        fun prepareForUpdate(input: EventEditPayloadInput): EventEditPayloadResult
        fun buildEditableFields(input: EditableFieldInput): List<Field>
        fun buildEditableLeagueTimeSlots(input: EditableLeagueSlotInput): List<TimeSlot>
    }

    internal data class EventEditPayloadInput(...)
    internal data class EventEditPayloadResult(...)

    internal object EventMatchEditStateBuilder {
        fun buildBracketNodes(matches: List<MatchWithRelations>): List<BracketNode>
        fun normalizeEditableBracketGraph(matches: List<MatchWithRelations>): List<MatchWithRelations>
        fun validateEditableMatches(matches: List<MatchWithRelations>): ValidationResult
    }

These helpers should depend on existing domain models from `core/data/dataTypes`, `core/network/dto`, and nearby event-detail helper functions. They should not depend on Compose UI, Decompose `ComponentContext`, navigation handlers, or payment UI. Side-effectful coordinators may depend on repository interfaces only where direct tests can provide fakes.

Revision Note (2026-06-22): Initial plan created to track decomposition of `DefaultEventDetailComponent` separately from the existing `EventDetails.kt` UI modularization plan.
Revision Note (2026-06-22): Added explicit test-after-every-update discipline and acceptance language requiring relevant tests to pass before progress is marked complete.
Revision Note (2026-06-22): Recorded passing baseline focused event-detail tests and common metadata compilation before source extraction.
Revision Note (2026-06-22): Recorded completion of the event edit payload helper extraction, direct tests, regression tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded completion of the pure match/bracket helper extraction, direct tests, related regression tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded completion of the join-confirmation helper extraction, focused and broader join-flow tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded completion of the payment-plan helper extraction, focused and broader join-flow tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded completion of the signature helper extraction, focused and broader join-flow tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded completion of the registration-question helper extraction, focused and broader join-flow tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded completion of the sport-rule helper extraction, focused and related edit validation tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the first registration coordinator slice, added remaining coordinator substeps, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the payment-plan preview coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the withdraw-target coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the billing-address prompt coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded current unfiltered debug unit suite blockers after the coordinator slices.
Revision Note (2026-06-22): Recorded the signature prompt coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the join dialog coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the team join-question coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the pending join-confirmation target coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the purchase-intent fee-breakdown coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the starting team registration coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the signature flow state coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the payment-sheet intent coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the refund and leave preflight coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the joinable-child selection state coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the self/team join execution action coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the signature poll-job lifecycle coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the team join-policy coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the team registration target-id coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the team registration result decision coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the team registration continuation coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the child-registration result message coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the self/minor join result coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the team join payment-plan coordinator slice, focused tests, compile checks, and line-count impact, and marked the self/team/child/minor orchestration decision subtask complete.
Revision Note (2026-06-22): Recorded the final registration coordinator regression suite and marked the registration coordinator parent task complete.
Revision Note (2026-06-22): Recorded the first invite coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the participant management coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the participant invite/add/remove preflight helper slice, focused tests, compile checks, and marked participant/invite coordination complete.
Revision Note (2026-06-22): Recorded the league standings coordinator slice, focused tests, compile fix, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the organization templates coordinator slice, focused tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the rental resources coordinator slice, focused tests, expectation fix, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the template creation builder slice, focused tests, expectation fix, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the match editing coordinator slice, focused tests, related bracket/match regression tests, compile checks, and line-count impact.
Revision Note (2026-06-22): Recorded the weekly occurrence coordinator slice, focused tests, compile checks, overview capacity regression, and line-count impact.
Revision Note (2026-06-22): Recorded the edit draft coordinator slice, focused tests, related validation/rental regressions, compile checks, and line-count impact.
