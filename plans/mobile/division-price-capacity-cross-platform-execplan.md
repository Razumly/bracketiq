# Add Division-Level Price and Capacity Behavior to Mobile Event Flows

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at repository root and must remain compliant with its requirements.

## Purpose / Big Picture

Mobile users should see and obey the same event participation rules as web: single-division events use event-level price/capacity, and multi-division events use division-level price/capacity. After this change, mobile event detail and join flows resolve effective capacity by division, and form/edit surfaces mirror the same source-of-truth behavior used on web.

## Progress

- [x] (2026-02-21 20:16Z) Audited existing mobile capacity checks in `EventDetailComponent` and `EventRepository`.
- [x] (2026-02-21 20:18Z) Created this ExecPlan and aligned single-vs-multi semantics with backend/web implementation.
- [ ] Update mobile event/division models and mapping to include division price/capacity fields.
- [ ] Update capacity resolution logic to use division-level max participants for multi-division events.
- [ ] Update event form/edit UI behavior to reflect disabled/gray states and mirrored values as applicable.
- [ ] Add repository/component tests for edge cases (missing division, division full while event total not full, single-division fallback).
- [ ] Run targeted Gradle tests and capture evidence in this plan.

## Surprises & Discoveries

- Observation: Mobile capacity checks currently compare total participants against `event.maxParticipants` regardless of divisions.
  Evidence: `EventRepository.isEventAtCapacity` and `EventDetailComponent.checkEventIsFull` rely on event-level max only.

## Decision Log

- Decision: Mirror backend/web source-of-truth: multi-division capacity checks are division-specific, single-division uses event-level capacity.
  Rationale: Keeps join and waitlist decisions consistent across platforms and prevents mismatched availability states.
  Date/Author: 2026-02-21 / Codex

## Outcomes & Retrospective

Implementation in progress. Outcome details and final validation evidence will be added after code and tests complete.

## Context and Orientation

Shared mobile models and repositories are in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core`. Event detail presentation and participant action logic live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail`. Any data contract updates must remain aligned with backend source-of-truth in `/home/camka/Projects/MVP/mvp-site`.

## Plan of Work

After backend contract updates are in place, extend mobile models and serialization to carry division price and capacity fields. Then refactor capacity helper logic to compute effective capacity from selected division when event is multi-division, with safe fallbacks for legacy events lacking division values. Finally add tests for join behavior and waitlist routing across edge cases.

## Concrete Steps

Run from `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Update event/division data models and JSON mapping for new fields.
2. Update capacity helpers in repository/component logic.
3. Add/adjust unit tests in relevant test packages.
4. Run targeted Gradle tests.

Expected command examples:

    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepository*"

## Validation and Acceptance

Acceptance is met when:

1. Mobile reads division-level `price` and `maxParticipants` from API responses.
2. Multi-division join/waitlist logic keys off selected division capacity.
3. Single-division join/waitlist logic still keys off event-level capacity.
4. Targeted tests pass with explicit coverage for fallback and edge cases.

## Idempotence and Recovery

Changes are additive and safe to reapply. If test failures are unrelated to touched code, rerun targeted suites and isolate regressions with file-scoped tests before broad test runs.

## Artifacts and Notes

Validation output snippets will be appended as implementation proceeds.

## Interfaces and Dependencies

Use existing shared Kotlin modules and repository interfaces. Do not introduce new dependencies. Keep payload/property names aligned with backend event/division contracts from `/home/camka/Projects/MVP/mvp-site`.

Revision note (2026-02-21 / Codex): Initial mobile ExecPlan created before implementation to satisfy PLANS.md requirements for cross-cutting feature work.
