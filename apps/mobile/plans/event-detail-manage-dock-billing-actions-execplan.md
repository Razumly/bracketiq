# Event Detail Manage Dock And Participant Billing Actions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, mobile event detail tabs use a shared `Manage` entry point in the floating dock instead of tab-specific match editing buttons. Hosts and event managers can enter management mode from the same dock pattern, edit matches in Schedule/Bracket exactly as before, and manage participant cards with web-parity actions (`Refund`, `Send Bill`, `Remove`) including modal workflows. This gives users one consistent management interaction across tabs and aligns participant billing/admin controls with the web schedule page.

## Progress

- [x] (2026-03-04 17:10Z) Mapped existing mobile dock behavior and participant rendering in `EventDetailScreen.kt` and `ParticipantsVeiw.kt`.
- [x] (2026-03-04 17:14Z) Verified web source-of-truth behavior and APIs from `mvp-site` schedule page and event team billing routes.
- [x] (2026-03-04 21:18Z) Implemented billing repository support for event-team billing snapshots, event-team bill creation, and per-payment refunds using web parity endpoints.
- [x] (2026-03-04 21:44Z) Added participant management operations to `EventDetailComponent` and wired team/user removal plus billing passthrough methods.
- [x] (2026-03-04 22:05Z) Replaced match-edit entry labels with `Manage` in docks and added participants-specific manage mode wiring.
- [x] (2026-03-04 22:22Z) Extended participants cards with management action rows and modal dialogs for refund/create bill/remove.
- [x] (2026-03-04 22:32Z) Ran focused verification build (`./gradlew :composeApp:compileDebugKotlinAndroid`) successfully.

## Surprises & Discoveries

- Observation: Mobile billing repository did not expose web event-team billing endpoints used by the web participants manage flow.
  Evidence: `IBillingRepository` only contained generic `/api/billing/bills` and `leaveAndRefundEvent`, not `/api/events/{eventId}/teams/{teamId}/billing*` methods.

- Observation: Participants UI had no existing manage mode state or billing/removal action surface.
  Evidence: `ParticipantsView` rendered only `TeamCard` and `PlayerCardWithActions` with social/chat actions.

- Observation: A common-test fake (`CreateEvent_FakeBillingRepository`) had to be updated because `IBillingRepository` interface expansion is compile-time strict.
  Evidence: `./gradlew :composeApp:compileDebugKotlinAndroid` required implementing new interface methods in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventTestFixtures.kt`.

## Decision Log

- Decision: Reuse web event-team billing API contracts in mobile instead of approximating them with local bill aggregation.
  Rationale: This preserves backend source-of-truth semantics and avoids diverging refundability logic.
  Date/Author: 2026-03-04 / Codex

- Decision: Introduce a participants-specific manage mode while reusing existing match edit state for schedule/bracket.
  Rationale: Participants actions are immediate operations (refund/create bill/remove) and do not require staged save semantics like match editing.
  Date/Author: 2026-03-04 / Codex

## Outcomes & Retrospective

Unified management behavior now exists across event detail docks on mobile. Schedule/Bracket entry uses `Manage` while preserving existing save/cancel match editing flow, and Participants now has a dedicated manage mode with action rows and modals for `Refund`, `Send Bill`, and `Remove` on cards. Mobile now uses web-parity backend contracts for participant billing details and refunds, reducing behavioral drift.

Remaining gap: the participants modal UX is Compose-native and functionally aligned but not pixel-identical to Mantine web layouts. This is acceptable for cross-platform parity goals because payloads, operations, and action sequencing now match source-of-truth endpoints.

## Context and Orientation

Relevant mobile files:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` contains tab selection and floating dock action controls.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt` contains team/user participant list cards.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` contains screen-level orchestration and repository mutations.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` contains mobile API contract methods.

Web source-of-truth references:

- `/home/camka/Projects/MVP/mvp-site/src/app/events/[id]/schedule/page.tsx` contains participants manage action behavior and modal UX.
- `/home/camka/Projects/MVP/mvp-site/src/app/api/events/[eventId]/teams/[teamId]/billing/route.ts` defines billing snapshot response.
- `/home/camka/Projects/MVP/mvp-site/src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts` defines refund request payload.
- `/home/camka/Projects/MVP/mvp-site/src/app/api/events/[eventId]/teams/[teamId]/billing/bills/route.ts` defines send-bill request payload.

In this repo, a “floating dock” means the bottom action surface rendered per tab when details are expanded. “Manage mode” means a UI state where admin actions are shown for the active tab.

## Plan of Work

First, extend billing repository contracts with explicit event-team billing methods and DTOs so mobile can load snapshot totals, list bill payments with refundable amounts, create event bills, and submit per-payment refunds exactly through the web endpoints.

Second, add component-level methods that wrap those repository calls and participant removal mutations (`removeTeamFromEvent`, `removeCurrentUserFromEvent`) with loading/error handling and event refresh.

Third, refactor dock actions in `EventDetailScreen.kt` to replace match-edit label entry points with a shared `Manage` affordance and manage-mode controls; keep schedule/bracket save/cancel behavior intact.

Fourth, update `ParticipantsView` to accept manage-mode flags and callbacks, render action buttons on team/user cards, and present modal dialogs for `Refund`, `Send Bill`, and `Remove` with simple validation and in-progress states.

Finally, run a focused compile/test command and record final outcomes.

## Concrete Steps

From repository root `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Edit `BillingRepository.kt` and add event-team billing models/methods to both interface and implementation.
2. Edit `EventDetailComponent.kt` interface and `DefaultEventDetailComponent` to expose participants manage operations and bridge repository calls.
3. Edit `EventDetailScreen.kt` dock behavior to introduce shared `Manage` actions and participants manage state.
4. Edit `ParticipantsVeiw.kt` to render participant manage action rows and modal dialogs.
5. Run:

       ./gradlew :composeApp:testDebugUnitTest

   If environment constraints prevent this, run:

       ./gradlew :composeApp:compileDebugKotlinAndroid

## Validation and Acceptance

Acceptance is met when:

- In event detail on mobile, Schedule and Bracket docks show `Manage` entry behavior that enables existing match edit mode and still supports save/cancel/add match flows.
- Participants tab dock includes `Manage`; entering participants manage mode shows `Refund`, `Send Bill`, and `Remove` actions on applicable cards.
- Refund modal can load billing snapshot for selected participant team/user and submit per-payment refunds via event-team billing refund endpoint.
- Send Bill modal can create an event bill for team/user owner via event-team billing bill endpoint.
- Remove action removes team/user from event participants and refreshes data.
- Build/test command(s) complete successfully or documented with precise failure reason.

## Idempotence and Recovery

All code edits are additive and can be reapplied safely. If API calls fail at runtime, component handlers surface errors without mutating local state silently. Participant management operations always refresh event data after success to recover UI consistency.

## Artifacts and Notes

Key backend contract snippets used for implementation:

    GET /api/events/{eventId}/teams/{teamId}/billing
    POST /api/events/{eventId}/teams/{teamId}/billing/refunds { billPaymentId, amountCents }
    POST /api/events/{eventId}/teams/{teamId}/billing/bills { ownerType, ownerId, eventAmountCents, taxAmountCents, allowSplit, label }

Plan revision note: Created to execute unified manage dock + participants billing management feature with web API parity.

Plan revision note (2026-03-04 22:32Z): Updated progress, discoveries, and outcomes after implementation and successful compile verification.

## Interfaces and Dependencies

New/updated mobile interfaces expected:

- `IBillingRepository` additions for event-team billing snapshot, refund submission, and event-team bill creation.
- `EventDetailComponent` additions for participants manage operations used by `ParticipantsView`.
- `ParticipantsView` parameters for manage mode and action callbacks.

No new external libraries are introduced; implementation uses existing Kotlinx serialization + `MvpApiClient` + Compose Material3.
