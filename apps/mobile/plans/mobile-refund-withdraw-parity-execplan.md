# Align Mobile Refund Withdrawals With Web Behavior

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows the repository guidance in `PLANS.md`.

## Purpose / Big Picture

After this change, the mobile app will match the current `mvp-site` refund behavior on the event details screen. Paid participants inside the automatic refund window will be withdrawn and refunded immediately, while paid participants outside that window will withdraw through the refund-request path instead. Team registrations will send the same `refundMode` and `refundReason` contract that `mvp-site` now expects, so hosts see one correct refund request path instead of a silent no-op.

## Progress

- [x] (2026-04-07 15:44 PDT) Compared `mvp-app` event-detail refund flow against `mvp-site` and confirmed three drift points: reversed button labels, stale refund-window math, and missing `refundMode`/`refundReason` fields on team participant deletes.
- [x] (2026-04-07 16:09 PDT) Added a shared mobile refund-policy helper and rewired the event detail screen plus component logic to use automatic refunds only when the event is still before the configured deadline.
- [x] (2026-04-07 16:38 PDT) Added focused common/JVM coverage for the refund policy helper and the team participant delete payload, then ran `.\gradlew.bat :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventRefundPolicyTest" --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest"` successfully.
- [ ] Commit the finished `mvp-app` and `mvp-site` changes.

## Surprises & Discoveries

- Observation: `mvp-site` user-facing summaries still contain stale `0/1/2` refund labels, but the live refund logic and tests use real hour counts with `0` meaning no automatic refund window.
  Evidence: `src/lib/refundPolicy.ts` enables automatic refunds only when `cancellationRefundHours > 0`, and `src/components/ui/__tests__/RefundSection.test.tsx` expects `cancellationRefundHours: 0` to produce a request-only path.
- Observation: the mobile event editor also still exposes legacy refund values, so events with custom refund windows from the web can arrive in the app with no matching selected option.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/CancellationRefundOptions.kt` used `0/1/2/3` pseudo-enum values before this patch.
- Observation: WSL on this machine only has Java 8, so Android/KMP Gradle tasks must run through the Windows Java 17 toolchain instead of Linux.
  Evidence: the first `:composeApp:testDebugUnitTest` attempt failed during Gradle configuration with "This build uses a Java 8 JVM", while the same test command passed from PowerShell.

## Decision Log

- Decision: use a shared `eventDetail` refund-policy helper instead of recomputing refund windows inline inside the composable.
  Rationale: the event detail screen and the event details summary both need the same hour-based interpretation, and a pure helper is straightforward to test.
  Date/Author: 2026-04-07 / Codex
- Decision: keep the existing `/api/billing/refund` route for individual registrations, but route team refund withdrawals through `api/events/[eventId]/participants` with `refundMode`.
  Rationale: this matches the `mvp-site` contract change and avoids reintroducing the broken team refund path.
  Date/Author: 2026-04-07 / Codex

## Outcomes & Retrospective

Implementation is effectively complete. The mobile client now uses the hour-based refund policy, team withdrawals carry refund intent fields, and focused JVM tests passed. Only the final git commits remain.

## Context and Orientation

The mobile event details flow lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`. `EventDetailScreen.kt` decides which withdrawal/refund action label to show and whether to open a refund-reason dialog. `EventDetailComponent.kt` owns the actual leave and refund commands. Repository calls are defined in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/`. The team participant delete DTO is `EventParticipantsRequestDto` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`.

The server-side source of truth is `mvp-site`. The matching web refund policy is implemented in `/home/camka/Projects/MVP/mvp-site/src/lib/refundPolicy.ts`, and team automatic or request-based refunds now travel through the event participants delete route with `refundMode` and `refundReason`.

## Plan of Work

Add a pure helper under `eventDetail/` that interprets `cancellationRefundHours` as an actual hour count. Use it in `EventDetailScreen.kt` to fix button labels and to trigger automatic refunds only when the event is still before the deadline. Add a dedicated automatic-refund action on `EventDetailComponent` and make refund requests special-case team registrations so they use `IEventRepository.removeTeamFromEvent(..., refundMode, refundReason)` instead of the old billing refund route. Extend `EventParticipantsRequestDto` and the repository implementation to serialize the new fields. Update the mobile refund summary and cancellation-refund option labels so they describe the real data contract instead of the old pseudo-enum values.

## Concrete Steps

From `C:\Users\samue\StudioProjects\mvp-app`:

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/RefundPolicy.kt` to add the pure helper for refund deadlines and summary text.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` and `EventDetailComponent.kt` to use the helper and route automatic team refunds through the new component method.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` so participant deletes can include `refundMode` and `refundReason`.
4. Update focused tests under `composeApp/src/commonTest/kotlin/com/razumly/mvp/`.
5. Commit the mobile and site repositories after the verification commands pass.

## Validation and Acceptance

Run focused common/JVM tests and expect the new refund-policy tests plus the participant delete repository test to pass. Acceptance is:

1. A paid event before the refund deadline shows a "Get Refund" action and uses the immediate refund path.
2. A paid event outside the refund deadline shows a request-oriented label and still captures a refund reason.
3. Team refund withdrawals send `refundMode: "auto"` or `refundMode: "request"` with the delete payload.

## Idempotence and Recovery

These edits are source-only and safe to repeat. If a test fails after the repository contract changes, update fake repository implementations in `commonTest` to match the new signature before rerunning Gradle.

## Artifacts and Notes

Expected participant delete payload excerpt after the patch:

    {"teamId":"team_1","refundMode":"request","refundReason":"Team can no longer attend"}

## Interfaces and Dependencies

At the end of this work, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` must expose:

    enum class EventParticipantRefundMode(val wireValue: String)
    suspend fun removeTeamFromEvent(
        event: Event,
        teamWithPlayers: TeamWithPlayers,
        refundMode: EventParticipantRefundMode? = null,
        refundReason: String? = null,
    ): Result<Unit>

And `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` must expose:

    fun withdrawAndRefund(targetUserId: String? = null)

Revision note (2026-04-07): Created this ExecPlan while implementing the mobile parity patch because the change spans UI logic, repository contracts, and test coverage.
Revision note (2026-04-07): Updated progress and discoveries after the focused Windows Gradle verification passed and WSL Java 8 was confirmed as unsuitable for Android/KMP tasks.
