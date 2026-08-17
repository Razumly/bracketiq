# Add the match segment break countdown

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while the work proceeds. Maintain this file in accordance with `PLANS.md`.

## Purpose / Big Picture

Timed matches can contain a configured break between regulation segments. The web scheduler will store this duration in each generated match rule snapshot. The mobile match screen will then show a countdown break phase after one scoring segment finishes and before the next scoring segment starts.

The break must not become a scoring segment. Scores, incidents, and segment sequence values must keep their current meaning. The app will derive the active break from the previous segment end time and the immutable match snapshot.

## Progress

- [x] (2026-08-03 21:35Z) Inspected the shared match rule models, timer state, segment confirmation flow, and match screen.
- [x] (2026-08-03 22:04Z) Added the segment-break field to shared mobile match rule models and normalization.
- [x] (2026-08-03 22:04Z) Added a pure break countdown resolver with tests.
- [x] (2026-08-03 22:04Z) Rendered the break label and countdown in the match timer surface. Prevented the next scoring timer from starting until the break ends.
- [x] (2026-08-03 22:04Z) Ran the focused Android unit test and compile path with JDK 17.
- [x] (2026-08-04 00:18Z) Added confirmed Skip Break and Restart Break actions. Persisted both actions through segment metadata and the shared match-operation request. The focused Android run passed 78 match tests. The focused network run passed 11 operation serialization tests.

## Surprises & Discoveries

- Observation: Match completion already persists the exact segment end time.
  Evidence: `DefaultMatchContentComponent.completeCurrentSet` writes `endedAt` before it advances to the first incomplete segment.

- Observation: The selected segment advances from persisted status.
  Evidence: `resolveCurrentSegmentIndex` selects the first segment whose status is not `COMPLETE`.

- Observation: The current match rule model has regulation segment duration but no break duration.
  Evidence: `ResolvedMatchTimekeepingConfigMVP` contains `segmentDurationMinutes` and per-sequence durations only.

## Decision Log

- Decision: Add `segmentBreakDurationMinutes` to both optional and resolved match timekeeping models.
  Rationale: The field is additive and keeps old payloads compatible through default values.
  Date/Author: 2026-08-03 / Codex

- Decision: Treat the break as a virtual timer phase.
  Rationale: Interleaving break rows with scoring segments would change score, incident, and segment sequence behavior.
  Date/Author: 2026-08-03 / Codex

- Decision: Use the previous completed segment `endedAt` as the break start.
  Rationale: This value is already persisted and shared across devices. It supports reload and reconnect without new storage.
  Date/Author: 2026-08-03 / Codex

- Decision: Store manual break changes on the next scoring segment metadata.
  Rationale: The next segment owns the pending break state. A restart timestamp replaces the derived start. A skip timestamp ends the break without changing the prior segment end time.
  Date/Author: 2026-08-04 / Codex

- Decision: Confirm both Skip Break and Restart Break.
  Rationale: Both actions change the shared match clock. Confirmation prevents an accidental tap from changing the live match state.
  Date/Author: 2026-08-04 / Codex

## Outcomes & Retrospective

The mobile match runner now reads `segmentBreakDurationMinutes` from the resolved match snapshot. After a completed segment, it derives a virtual break from the saved `endedAt` value and shows a countdown labeled Break. It does not add a scoring segment or change incident ownership. The start action remains disabled until the countdown reaches zero. Officials can skip or restart the break after a confirmation. Both actions persist through the shared segment-operation endpoint. Missing or zero break values preserve the old behavior. The focused Android test run passed 78 tests. The focused network test run passed 11 tests.

## Validation and Acceptance

1. Old match payloads without a break field still decode.
2. A zero or missing break duration shows no break phase.
3. A positive break duration shows a countdown after a segment completes.
4. The next scoring timer cannot start while the break countdown is active.
5. The countdown survives a screen reload because it uses the persisted segment end time.
6. Scoring segments, scores, and incident ownership remain unchanged.
7. Skip and Restart each require confirmation and survive reload.
8. Focused common tests and the Android Kotlin compile pass.

## Idempotence and Recovery

The mobile model change is additive. Default a missing break duration to zero. The countdown does not write a new row. Skip and Restart update metadata on the next scoring segment. Re-running the resolver with the same match snapshot and current time returns the same result.
