# Mobile event lifecycle API E2E matrix

This ExecPlan is a living document. Maintain it per `PLANS.md` at repository root.

## Purpose / Big Picture

The mobile app needs backend-backed E2E coverage that proves native repositories can create, schedule, join, load, and update matches across the real event shapes organizers use. After this work, an Android integration suite will create one weekly event, four tournaments, four leagues, and one normal event against the local `mvp-site` backend, varying single vs split divisions, playoffs/pools vs none, named officials, no officials, team officiating, set-based sports, timed sports, multi-field scheduling, and match updates with and without incidents.

## Progress

- [x] (2026-05-13 17:20Z) Audited current mobile tests and confirmed existing coverage has create DTO/unit tests plus one backend league playoff integration, but not the requested lifecycle matrix.
- [x] (2026-05-13 17:20Z) Mapped mobile repository calls to the `mvp-site` source of truth for event create, schedule, join, match score, and match incident endpoints.
- [x] (2026-05-13 18:06Z) Added `EventLifecycleMobileApiIntegrationTest` under `composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/`.
- [x] (2026-05-13 18:12Z) Ran the targeted Android integration test against local `mvp-site`; it passes with backend fixtures and cleanup.

## Surprises & Discoveries

- `LeaguePlayoffMobileApiIntegrationTest` creates and schedules a single playoff league, loads fields/time slots/matches/staff invites, and joins as a participant. It is useful coverage, but it only covers one event type and one division shape.
- Current common tests cover create validation and DTO mapping for leagues/tournaments, but they use fakes and do not prove the mobile client contract against the backend routes.
- The backend match score endpoint rejects direct score updates for sports whose match rules require player-recorded point incidents. The first test pass should use direct scoring on a sport that allows score writes and incident writes on a separate match; true player-recorded scoring incidents may require dedicated event-team roster setup.
- Raw `GET /api/fields` responses do not carry division assignments. Event create persists field-to-division ownership through event division details, so the E2E assertion must check `Event.divisionDetails.fieldIds` plus time-slot divisions instead of `Field.divisions`.
- Weekly/non-schedulable events can persist field ids and time-slot divisions without division-detail field mappings. The strict field-to-division assertion belongs to league/tournament variants where the scheduler consumes those mappings.
- Weekly/non-schedulable time-slot divisions may be normalized by the backend independently of event division-detail ids. The E2E keeps the exact coverage assertion on schedulable leagues/tournaments and only requires explicit non-empty slot divisions for weekly/normal events.
- Weekly occurrence dates are validated against the slot's Monday-indexed `daysOfWeek`; the test occurrence must land on one of the selected weekdays, not merely within the start/end range.
- `assistantHostIds` in create payload are not a reliable persisted staff assertion for this integration fixture set. The matrix validates multiple staff through multiple named `officialIds` on named-official variants.
- Mobile `toUpdateDto` expects tournament pool-play bracket details to live in `divisionDetails` with `poolCount`; it moves those details to `playoffDivisionDetails` on the wire. Adding a second synthetic playoff detail produces an invalid backend shape.
- Pool-play tournaments need fields/time slots assigned to the generated pool division ids (`event__division__open_pool_a`, etc.), not only the parent bracket division id, because the scheduler schedules the pool divisions.
- For mobile-created pool-play tournaments, the event `divisions` also need to reference generated pool ids so `singleDivision` slot canonicalization does not rewrite slots back to the bracket id before the scheduler runs.
- The match incident route depends on hydrated event teams while validating point incidents. `mvp-site`'s match mutation loader had to keep event-team registration hydration enabled while still skipping user/player detail, otherwise current DB rows with no persisted `Events.teamIds` leave `team1`/`team2` unresolved.

## Decision Log

- Create a new plan instead of modifying `event-create-tests-execplan.md` because that plan is complete and scoped to create-flow unit/component coverage, while this task is a backend-backed lifecycle matrix.
- Use the existing `MobileApiTestSession` integration harness so the suite exercises real repositories, auth, route payloads, Room persistence, and the local backend.
- Treat the user's requested count as ten events total: one weekly, four tournaments, four leagues, and one normal event. The "six events" phrase conflicts with the explicit breakdown, and the explicit breakdown is the acceptance target.
- Distribute unrelated variables across the ten events instead of creating every Cartesian combination. The acceptance condition is that each requested axis is represented in a meaningful create/schedule/join path, not that every possible combination exists.

## Outcomes & Retrospective

Implemented a backend-backed Android integration test that creates ten mobile events: weekly, normal, four tournaments, and four leagues. The schedulable events vary single vs split divisions, playoffs/pools vs none, named/no/team officials, set-based and timed sports, multiple staff, multiple fields, and explicit division-assigned time slots. The test reloads events through a participant session, joins each event, schedules leagues/tournaments, verifies match creation, writes a direct score update on a non-incident event, writes a scoring incident on an incident-enabled event, and proves batch event fetch works for the created ids.

The final mobile validation command passed:

`MVP_TEST_ALLOW_DB_SEED=1 ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.eventDetail.EventLifecycleMobileApiIntegrationTest`

During validation, the incident endpoint exposed a backend loader bug in `mvp-site`: match mutation loading skipped event-team registration hydration, so match teams could be null during point-incident validation. The source-of-truth backend was patched with a focused regression in `src/server/repositories/__tests__/events.matchMutationLoad.test.ts`, and that Jest test passed.

## Context and Orientation

Mobile files:

- `composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt` creates backend-backed sessions, logs in fixtures, and can seed the local `mvp-site` database when `MVP_TEST_ALLOW_DB_SEED=1`.
- `composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/LeaguePlayoffMobileApiIntegrationTest.kt` is the current closest integration example.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` creates events, schedules events, and joins users/teams.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` fetches matches, writes direct scores, writes match incidents, and sends bulk match updates.

Backend source of truth:

- `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/route.ts` accepts `POST /api/events` with `event`, `newFields`, and `timeSlots`.
- `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/schedule/route.ts` schedules leagues and tournaments.
- `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/matches/[matchId]/score/route.ts` writes direct score updates when match rules allow it.
- `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts` validates match incident operations.
- `/Users/elesesy/StudioProjects/mvp-site/prisma/seed.e2e.ts` and `e2e/fixtures/seed-data.ts` provide host/player credentials, seeded teams, sports, fields, organization, and image records.

## Plan of Work

1. Add a matrix-driven Android integration test using `MobileApiTestSession`.
2. Build ten event variants:
   - One weekly event with occurrence-aware joining.
   - One normal event with non-team participant joining.
   - Four tournaments: two with pools/playoffs and two without; one single-division and one split-division in each pair.
   - Four leagues: two with playoffs and two without; one single-division and one split-division in each pair.
3. Give every schedulable event at least two fields and explicit time slots whose division assignments are non-empty and cover every event division.
4. Spread official modes across the matrix: named officials, no officials, and team-officiated scheduling.
5. Spread sports across the matrix so set-based and timed/match sports are both exercised.
6. For each created event, reload it through participant repositories, verify persisted field/time-slot/division coverage, join where appropriate, and schedule/load matches for leagues/tournaments.
7. Run one direct score update on an event without match point incidents and one incident update on a separate match. If backend roster constraints block true scoring-point incidents, preserve the incident endpoint test and record the remaining scoring-incident fixture gap in this plan.

## Concrete Steps

- Working directory: `/Users/elesesy/StudioProjects/mvp-app`.
- Add `composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/EventLifecycleMobileApiIntegrationTest.kt`.
- Ensure local backend is running on `MVP_TEST_BACKEND_URL`, `127.0.0.1:3000`, or `127.0.0.1:3010`.
- Run targeted test:
  - `MVP_TEST_ALLOW_DB_SEED=1 ./gradlew :composeApp:testDebugUnitTest --tests com.razumly.mvp.eventDetail.EventLifecycleMobileApiIntegrationTest`

## Validation and Acceptance

- The targeted Android test compiles.
- With local backend fixtures available, the test creates all ten events and cleans them up after execution.
- The test asserts every schedulable event has multiple fields, explicit time slots, and division coverage across fields and slots.
- The test asserts all league/tournament variants return scheduled matches.
- The test asserts participant join succeeds for weekly and normal events, and exercises the mobile team/free-agent join code path for team-signup events.
- The test asserts match score updates persist for a non-incident scoring event.
- The test asserts match incident updates persist for an incident-enabled event, or records why true point incidents require a separate roster fixture.

## Idempotence and Recovery

- Event ids should include a timestamped run id. Cleanup deletes all created events in reverse order.
- Team ids from backend seed data can be reused for schedulable variants; unique fields and time slots prevent collisions across runs.
- If a run fails before cleanup, later runs use new ids, and stale events can be removed by id prefix from the backend database.
- If fixtures are missing and `MVP_TEST_ALLOW_DB_SEED` is not set, the suite should skip with a clear assumption message instead of mutating the backend unexpectedly.

## Artifacts and Notes

- Expected new test file:
  - `composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/EventLifecycleMobileApiIntegrationTest.kt`
- Existing related test file:
  - `composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/eventDetail/LeaguePlayoffMobileApiIntegrationTest.kt`
