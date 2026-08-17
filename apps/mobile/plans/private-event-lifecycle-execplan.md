# Add private event lifecycle support on mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](/Users/elesesy/StudioProjects/mvp-app/PLANS.md).

## Purpose / Big Picture

After this change, the mobile app can load, display, and edit events whose lifecycle is `PRIVATE`. Private events remain hidden by backend policy, but when a manager opens one in the app they should see a blue `Private` label anywhere draft events currently show a red `Draft` label, and the lifecycle picker should let them choose `Private` explicitly.

## Progress

- [x] (2026-04-06 21:06Z) Inspected shared `Event` and `EventDTO` models, event lifecycle helpers, the event detail lifecycle dropdown, the publish action, and the mobile event card badge.
- [x] (2026-04-06 21:21Z) Updated shared event-state helpers and the mobile lifecycle picker to understand `PRIVATE`.
- [x] (2026-04-06 21:21Z) Updated mobile lifecycle badge rendering so `PRIVATE` shows as a blue label and draft-like states stay red.
- [x] (2026-04-06 21:21Z) Added focused Kotlin tests and ran the relevant Android unit-test task successfully.

## Surprises & Discoveries

- Observation: Mobile already distinguishes UI lifecycle options from stored state, but only for `Published` versus `Draft`.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt` has `EditableLifecycleState` with only `PUBLISHED` and `DRAFT`.
- Observation: Draft rendering is centralized in `Event.isDraftLikeState()` and `Event.lifecycleStateLabel()`, which makes badge support straightforward once those helpers stop treating every non-published state as draft.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt`.
- Observation: The cleanest way to test the lifecycle mapping was to move the edit-state mapper out of `EventDetailScreen.kt` into a dedicated shared file.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventLifecycleState.kt` now contains the enum and mapping helpers, and `EventLifecycleStateTest` exercises them directly without UI harness complexity.

## Decision Log

- Decision: Treat `PRIVATE` as a distinct lifecycle in shared mobile helpers instead of folding it into draft-like behavior.
  Rationale: The UI needs a different label and color, and the user explicitly wants private to be “besides draft and published.”
  Date/Author: 2026-04-06 / Codex
- Decision: Leave the existing one-tap publish action alone unless a concrete regression appears.
  Rationale: Publishing still means moving any hidden state to `PUBLISHED`; the new user request is about the editable lifecycle options and labels, not a new dedicated quick action.
  Date/Author: 2026-04-06 / Codex

## Outcomes & Retrospective

The mobile app now understands `PRIVATE` in shared event helpers, exposes it as a third lifecycle option in event editing, and renders a blue `Private` badge on event cards. Focused validation passed with:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.eventDetail.EventLifecycleStateTest

The only caution remains the pre-existing unrelated CocoaPods/iOS worktree changes in this repository. This feature avoided those files completely.

## Context and Orientation

The shared mobile event model lives in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`. That file defines the persisted `state` string plus convenience helpers such as `isDraftLikeState()` and `lifecycleStateLabel()`. Network and DTO conversions live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`.

Event editing happens in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`, where `EditableLifecycleState` maps UI labels back into stored event states. Event cards use the lifecycle helpers in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt` to show the current draft badge. The app depends on `mvp-site` as the backend contract source of truth, so the mobile changes must match the same persisted `state` values introduced there.

## Plan of Work

First, update the shared event helpers in `Event.kt` so they can answer three lifecycle questions cleanly: whether an event is draft-like, whether it is private, and what label should be shown. Keep `UNPUBLISHED` and `DRAFT` grouped as draft-like for backward compatibility, while letting `PRIVATE` remain separate.

Next, expand `EditableLifecycleState` in `EventDetailScreen.kt` to include `PRIVATE`, update the `Event.toEditableLifecycleState()` mapper to recognize it, and update `EditableLifecycleState.toEventState()` so it preserves `DRAFT` when editing an old draft, returns `UNPUBLISHED` for ordinary draft saves, returns `PRIVATE` for private saves, and still returns `PUBLISHED` for published saves.

Then update the card badge in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt`. Replace the single `showDraftBadge` boolean with a lifecycle badge model that can render `Draft` with the existing red styling and `Private` with a blue styling. Reuse the shared lifecycle helper so the card and detail screen do not diverge.

Finally, add focused tests around the new lifecycle mapping and label behavior. The most likely homes are `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/EventDtosTest.kt` for DTO/state round-tripping and a new or existing event-detail helper test if the lifecycle mapping logic warrants direct assertions.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`, apply the edits in this order:

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`.
2. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`.
3. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt`.
4. Edit the relevant tests in `composeApp/src/commonTest`.

Run focused validation after the code changes:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.network.dto.EventDtosTest

If the lifecycle logic ends up in a new helper test file, run that test class in the same command or with an additional `--tests` filter.

## Validation and Acceptance

Acceptance on mobile means all of the following are true:

1. An event loaded with `state = "PRIVATE"` keeps that state in memory and through DTO conversions.
2. The event detail lifecycle dropdown offers `Private` as a third option.
3. Choosing `Private` while editing writes `state = "PRIVATE"` back into the edited event model.
4. Event cards show a blue `Private` badge for private events and still show the red `Draft` badge for `UNPUBLISHED` and `DRAFT`.

The focused tests should pass after the change and should not pass against the pre-change code if they assert private-state handling.

## Idempotence and Recovery

These edits are additive and safe to reapply. The only caution is existing unrelated iOS/CocoaPods changes in this repository; avoid touching `iosApp/Pods`, `Podfile.lock`, or `composeApp.podspec` unless a build step requires it. If a test fails because of a different local state, rerun only the focused Compose test classes rather than broad iOS-related Gradle tasks.

## Artifacts and Notes

Key current-state references:

    composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt
    composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt
    composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt

## Interfaces and Dependencies

At the end of this work, the following behaviors must exist:

- `Event.state` may contain `PRIVATE` without being normalized away.
- `Event.lifecycleStateLabel()` must return `Private` for `PRIVATE`.
- `EditableLifecycleState` in `EventDetailScreen.kt` must contain `PRIVATE`.
- `EditableLifecycleState.toEventState(currentState: String)` must map `PRIVATE` to `"PRIVATE"`.
- The badge rendering in `EventCard.kt` must derive its label and color from the lifecycle state instead of a draft-only boolean.

Revision note: updated this plan on 2026-04-06 after implementation and focused Android unit-test validation so the plan reflects the completed mobile work.
