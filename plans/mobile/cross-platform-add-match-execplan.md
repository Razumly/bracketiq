# Cross-Platform Add-Match (Schedule + Bracket)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained according to `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, hosts can stage and add matches on both web and mobile from schedule and bracket surfaces, then persist all changes in one atomic bulk save. Tournament creations can be unscheduled (`start/end = null`), auto-create a placeholder team, and increment participant capacity in the same server transaction. Bracket link editing gains winner/loser next selectors with graph-safe filtering and save-time guards against invalid structures (missing refs, over-capacity targets, duplicate winner/loser target, and cycles).

## Progress

- [x] (2026-02-27 00:00Z) Added backend mixed create+update bulk route support in `mvp-site` and null-time serialization/repository handling.
- [x] (2026-02-27 00:00Z) Added backend schedule-route tests for create flows, invalid schedule creates, incoming-capacity guard, and cycle guard.
- [ ] Complete `mvp-site` schedule page wiring: tournament schedule tab visibility, schedule/bracket add actions, staged create payload assembly, modal wiring, and bracket anchor callbacks.
- [ ] Complete `mvp-app` nullable match-time model/DTO/network plumbing and bulk request DTO support for `creates` + `created` mapping.
- [ ] Add mobile edit-mode add-match flows (schedule dock action + bracket anchor plus controls) and staged create lifecycle.
- [ ] Add mobile winner/loser next-link filtering, graph validation, and save-time guards in dialog/component.
- [ ] Run targeted verification in both repos and resolve regressions.

## Surprises & Discoveries

- Observation: Web/backend groundwork was already partially implemented before this pass, including a reusable graph validator and bulk route create transaction path.
  Evidence: Existing modified files in `mvp-site` (`src/server/matches/bracketGraph.ts`, `src/app/api/events/[eventId]/matches/route.ts`, and related tests).

## Decision Log

- Decision: Reuse one graph validator contract concept across server and clients rather than introducing divergent ad-hoc checks.
  Rationale: Prevents “UI allows invalid state that backend rejects” drift and keeps filtering/validation behavior aligned.
  Date/Author: 2026-02-27 / Codex

- Decision: Keep create operations staged in client state until Save instead of immediate network persistence.
  Rationale: Matches existing edit-session behavior and allows a single atomic server transaction for event+match graph updates.
  Date/Author: 2026-02-27 / Codex

## Outcomes & Retrospective

In progress. Backend and tests are substantially in place; remaining work is UI integration completion on web and full KMP/mobile parity wiring. The biggest risk area is nullable `start` propagation in mobile schedule/calendar views and maintaining predictable bracket round rendering while staged client-id nodes are present.

## Context and Orientation

`mvp-site` hosts both backend route logic and the web event schedule/bracket editor. Key files are `src/app/api/events/[eventId]/matches/route.ts`, `src/server/matches/bracketGraph.ts`, and `src/app/events/[id]/schedule/page.tsx` with modal and bracket subcomponents.

`mvp-app` hosts the Kotlin Multiplatform mobile app. Key files are `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`, `EventDetailScreen.kt`, `eventDetail/composables/TournamentBracketView.kt`, `MatchEditDialog.kt`, `ScheduleView.kt`, and match model/network files under `core/data/dataTypes` and `core/network/dto`.

A “staged create” means a not-yet-persisted match with a client-generated id (`client:<id>` on web and equivalent local id on mobile), saved only when the host commits edits.

## Plan of Work

Finish web page wiring first so existing backend additions are exercised end-to-end. Then update mobile model/network layers for nullable `start` and mixed bulk create/update payloads. Next, add mobile add-match entry points and anchor controls in bracket UI with card padding adjustments. Finally, enforce graph-safe dropdown filtering and save-time validation in mobile dialog/component and verify with targeted tests/builds.

## Concrete Steps

From `mvp-site`:

    npm test -- --runInBand src/app/api/events/__tests__/scheduleRoutes.test.ts
    npm run lint

From `mvp-app`:

    ./gradlew :composeApp:testDebugUnitTest

If local iOS/macOS tasks are unavailable, run at least Kotlin/JVM tests and compile checks used in CI-equivalent paths.

## Validation and Acceptance

Acceptance is met when:

1. Web schedule tab appears for tournament and supports Add Match in edit mode.
2. Web bracket edit mode shows left anchor add controls and final-extension add control.
3. Web match modal supports winner/loser next selectors with invalid targets filtered out.
4. Saving staged creates sends a single bulk payload with `matches + creates`, persists correctly, and returns no graph validation errors for valid graphs.
5. Mobile schedule tab can add match from floating dock in edit mode.
6. Mobile bracket view shows tappable left-side add controls with enough left padding.
7. Mobile dialog enforces schedule-required fields/time for schedule context and tournament link requirement for creates.
8. Mobile commit blocks invalid graphs (cycles, over-capacity incoming refs, invalid refs) and succeeds for valid graphs.
9. Unscheduled matches remain renderable in bracket and do not break schedule grouping.

## Idempotence and Recovery

All code changes are additive/compatible with existing update-only clients. If a partial implementation leaves staged client matches inconsistent, exiting edit mode/canceling edit clears staged state and rehydrates from persisted event data. Backend bulk route remains backward-compatible when `creates` is omitted.

## Artifacts and Notes

Initial backend status already present before this pass:

    mvp-site modified files include:
    - src/app/api/events/[eventId]/matches/route.ts
    - src/server/matches/bracketGraph.ts
    - src/server/repositories/events.ts
    - src/server/scheduler/serialize.ts
    - src/app/api/events/__tests__/scheduleRoutes.test.ts

## Interfaces and Dependencies

`mvp-site` route contract for PATCH `/api/events/:eventId/matches` must support:

- `matches: BulkMatchUpdateEntry[]` (existing updates)
- `creates: BulkMatchCreateEntry[]` (staged creates with `clientId`, `creationContext`, nullable schedule fields, and links)
- response `{ matches: Match[], created: Record<clientId, persistedId> }`

`mvp-app` network DTOs must represent this route with explicit create/update lists and optional `created` mapping response. `EventDetailComponent` should call a single repository method to persist both updates and creates atomically.

---

Revision note (2026-02-27): Created this ExecPlan at implementation start to track cross-repo, cross-platform add-match delivery and keep decisions/progress explicit per `PLANS.md`.
