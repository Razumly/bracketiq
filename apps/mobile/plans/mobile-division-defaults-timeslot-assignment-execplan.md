# Mobile division defaults and timeslot assignment

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Event creation on mobile should treat event price and event max teams as the default values for divisions, not as a separate required "event max teams" validation when divisions are being configured. A host should be able to add or update divisions, have those confirmed division values become the next defaults, reopen the event and see those defaults applied, switch to single-division mode and see event-level Price and Max Teams controls instead of division-level controls, and assign divisions to timeslots only when split-by-division scheduling is enabled. The visible proof is in the create/edit event screen: the invalid max-teams warning disappears from the default field, single-division mode hides division price/max fields while showing event price/max fields under Team Event and Single Division, and the timeslot division dropdown has unique division names and is only visible for split-by-division scheduling.

## Progress

- [x] 2026-05-09T02:43:34Z Created this ExecPlan after confirming the request spans validation, division editor defaults, single-division layout, and timeslot division assignment.
- [x] 2026-05-09T03:08:11Z Inspect the current event-detail division editor, validation aggregation, and timeslot division controls.
- [x] 2026-05-09T03:36:20Z Implement event price/max as division defaults and remove default max-team required validation.
- [x] 2026-05-09T03:36:20Z Implement single-division UI and data behavior so existing and new divisions receive the current event price/max values.
- [x] 2026-05-09T03:36:20Z Enable mobile split-by-division scheduling controls, hide timeslot division assignment otherwise, and auto-assign all divisions to all timeslots when split scheduling is off.
- [x] 2026-05-09T03:36:20Z Deduplicate division options in timeslot dropdowns and require each division to appear on at least one timeslot when split scheduling is on.
- [x] 2026-05-09T04:01:40Z Add or update focused tests and run verification.

## Surprises & Discoveries

- The timeslot dropdown duplicates come from combining division IDs and division keys as independent options, then formatting both to the same visible label.
- `Event.maxParticipants` is still part of global form validation, which is why the event/default max teams value blocks save with "must be at least 2."
- `Single Division` is currently disabled in the mobile form and forced checked for new events, so the UI cannot drive the new single/split behavior yet.
- The full `:composeApp:testDebugUnitTest` task still fails in unrelated existing HTTP/mobile integration tests after the focused event-detail tests pass; none of the failures are in the new helper or timeslot validation tests.

## Decision Log

- Decision: Use the existing `Event.priceCents` and `Event.maxParticipants` fields as the persisted division defaults.
  Rationale: Those values are already fetched when the event is opened and are already used as fallback values for division price and max teams. Keeping them as the default source avoids adding another persisted model and matches the user's request to remove the separate "Division Defaults" section.
  Date/Author: 2026-05-09 / Codex

## Outcomes & Retrospective

Implemented. Event max teams is no longer a global required validation error. Confirming a division now stores that division's price/max as the next event defaults, and single-division mode exposes event-level Price and Max Teams controls while hiding division-level price/max inputs. Switching to single division applies the current defaults to existing division details and disables split-by-division scheduling. Mobile split-by-division scheduling is now exposed, timeslot division pickers are hidden unless split scheduling is enabled, non-split saves normalize every timeslot to all event divisions, and split scheduling validates that every division is assigned to at least one timeslot. The duplicate timeslot dropdown entries are removed by canonicalizing division options through division details and deduplicating visible labels.

## Context and Orientation

The work is in `/Users/elesesy/StudioProjects/mvp-app`. The main screen is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, which renders the shared create/edit event form used by both `CreateEventScreen.kt` and `EventDetailScreen.kt`. Division helper logic is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDivisionEditorLogic.kt`. Timeslot division controls are rendered from the event-detail form using reusable dropdown components under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/`.

"Single division" means the event uses one shared capacity and price for all divisions. In this mode the division editor still stores division identity fields such as gender, skill, and age, but the price and max team values should come from the event-level defaults. "Split-by-division scheduling" means individual timeslots can be restricted to specific divisions; when it is off, every timeslot should apply to all divisions without requiring a dropdown.

## Implementation Notes

Start by inspecting `EventDetails.kt` around the validation state, division editor confirmation function, Team settings section, and league/tournament timeslot editors. Preserve existing event payload structures unless the backend contract requires a change. Update tests in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail/` and `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/` where helper behavior is already covered.

## Validation

Run at minimum:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.EventDetailsDivisionEditorHelpersTest'

If changes touch create-event validation helpers, also run the relevant create-event test class:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.CreateEventSelectionRulesTest'

The final result should also compile the affected Android debug unit-test source set.
