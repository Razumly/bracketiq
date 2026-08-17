# Add comprehensive create-flow tests for Events, Leagues, and Tournaments
 
This ExecPlan is a living document. Maintain it per `PLANS.md` at repository root.
 
## Purpose / Big Picture
 
We need automated coverage that event creation enforces its rules and rejects invalid inputs across Event, League, and Tournament flows (including rental and sport-specific scoring). After implementing this plan, running the test suite will demonstrate the guards working by exercising validation, normalization, and payload assembly paths, including league scoring configs controlled by sport flags.
 
## Progress
 
- [x] (2026-02-13 18:10Z) Plan drafted.
- [x] (2026-02-13 21:08Z) Added shared create-flow test fixtures and fake repositories in `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventTestFixtures.kt`.
- [x] (2026-02-13 21:08Z) Expanded `CreateEventSelectionRulesTest` and added new suites: `LeagueSportRulesTest`, `ValidationHandlersTest`, `DefaultCreateEventComponentTest`, and `core/network/dto/EventDtosTest`.
- [x] (2026-02-13 21:11Z) Verified new test code compiles with `:composeApp:compileDebugUnitTestKotlinAndroid` when KSP tasks are excluded.
- [ ] (2026-02-13 21:11Z) Full unit test execution remains blocked by local build environment issues (`:composeApp:commonTest` task missing on this host and `:composeApp:testDebugUnitTest` requiring KSP, which fails with `sun.awt.PlatformGraphicsInfo` initialization failure).
 
## Surprises & Discoveries
 
- On this machine/Gradle graph, `:composeApp:commonTest` is not a valid task name even though the codebase has `commonTest` sources.
- Running `:composeApp:testDebugUnitTest` reaches KSP and fails before tests with:
  - `Execution failed for task ':composeApp:kspDebugKotlinAndroid'`
  - `Could not initialize class sun.awt.PlatformGraphicsInfo`
- `:composeApp:compileDebugUnitTestKotlinAndroid` succeeds when KSP tasks are excluded, confirming the new test sources compile, but full unit test execution still requires the KSP task graph.
- Gradle from WSL used Java 8 by default; Windows-side `gradlew.bat` with Android Studio JBR (Java 21) is required to get past the JDK compiler check.
 
## Decision Log
 
- Execute tests via `gradlew.bat` + `ORG_GRADLE_JAVA_HOME` on Windows JBR because Linux-side Java in this environment is JRE 8 and cannot compile Gradle project accessors.
- Proceed with implementation despite execution blocker so coverage is in place and ready to run once the KSP environment issue is resolved.
 
## Outcomes & Retrospective

- Implemented comprehensive create-flow coverage for event type normalization, sport-based scoring normalization, input validation guards, field/slot creation behavior, rental constraints, and DTO assembly.
- Remaining gap is environmental test execution (KSP runtime issue), not missing test code.
 
## Context and Orientation
 
Key create-flow code:
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`: maintains create state, validation handlers, rental constraints, sport normalization (`applyLeagueSportRules` / `applyTournamentSportRules`), league slot drafting, payload handoff.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventSelectionRules.kt`: normalizes event type, teamSignup, singleDivision, end date.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt` and `core/data/dataTypes/LeagueScoringConfig.kt`: `toUpdateDto` building create payloads, now carrying `leagueScoringConfig`; sport flags gate scoring fields.
- Existing tests: only `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventSelectionRulesTest.kt`, covering basic selection rules.
 
Environment note: `./gradlew` needs JDK 11+; if JDK 8 is default, set `ORG_GRADLE_JAVA_HOME` to a JDK 11+ path before running tests.
 
## Plan of Work
 
1) Map validation/normalization paths and expected behaviors:
   - `applyCreateSelectionRules` (rental coercion, end alignment).
   - Sport normalization (`applyLeagueSportRules`, `applyTournamentSportRules`): sets/points/durations when set-based vs timed.
   - Validators: `validateAndUpdatePrice`, `validateAndUpdateTeamSize`, `validateAndUpdateMaxPlayers`.
   - Rental constraints: `applyRentalConstraints`, field/time-slot/price locking, requiredTemplateIds.
   - Field count syncing and league slot cleanup (`selectFieldCount`, `buildLeagueSlotDrafts`).
   - Payload assembly: `Event.toUpdateDto` inclusion/omission of `leagueScoringConfig`.
 
2) Add unit tests for pure helpers:
   - Expand `CreateEventSelectionRulesTest` for rental + league/tournament combinations and end alignment.
   - New sport-rules test file to assert set/timed normalization and pointsToVictory sizing.
   - Validator tests ensuring negative/zero inputs are rejected and valid inputs accepted.
 
3) Add component-level tests with lightweight fakes:
   - Build in-test fakes for repositories needed by `DefaultCreateEventComponent` (event/field/sports/images/user/match).
   - Cover rental constraints (eventType forced to EVENT, start/end/price/fields/timeSlots locked, requiredTemplateIds passed).
   - Field count resizing and clearing invalid `scheduledFieldId` in league slots.
   - League slot drafting dropping invalid slots and mapping temporary field IDs to created ones.
   - League inputs: require timeslot presence, gamesPerOpponent >= 1, playoffs gating, set-based vs timed based on sport flags.
   - Tournament inputs: winner/loser set counts constrained; double elimination toggling resets loser config.
 
4) Payload/DTO tests:
   - `toUpdateDto` includes `leagueScoringConfig` only for leagues and preserves requiredTemplateIds; omitted/cleared for other event types.
 
5) Fixtures:
   - Sports: one set-based (`usePointsPerSetWin = true`), one timed (`usePointsPerSetWin = false`).
   - Rental context with start/end, fieldIds, timeSlotIds, price, requiredTemplateIds.
   - League slots: valid slot plus variants missing day/start/end/field and end<=start.
 
## Concrete Steps
 
- Working directory: repository root.
- Write tests under `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/` and DTO tests under `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/`.
- Commands:
  - Ensure JDK 11+: `export ORG_GRADLE_JAVA_HOME=/path/to/jdk11` (if needed).
  - Run tests: `./gradlew :composeApp:commonTest`.
- Add fakes inside test files to keep scope local and state reset per test.
 
## Validation and Acceptance

- `./gradlew :composeApp:commonTest` (or host-equivalent test task) passes with new tests.
- Deliberately breaking a guard (e.g., allow negative price) should make the corresponding new test fail; restoring the guard makes it pass.
 
## Idempotence and Recovery

- Tests are additive and safe to rerun. Keep fakes stateless or reset in `@BeforeTest` to avoid cross-test leakage.
- If Gradle fails due to JDK version, set `ORG_GRADLE_JAVA_HOME` to JDK 11+ and rerun; no other recovery steps are needed.
- If Android test execution fails in KSP with `sun.awt.PlatformGraphicsInfo`, run the suite on the standard project machine/CI image where Android/KSP toolchain is already known-good.
 
## Artifacts and Notes
 
- New test files to create:
  - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/CreateEventSelectionRulesTest.kt` (expanded).
  - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/LeagueSportRulesTest.kt`.
  - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/ValidationHandlersTest.kt`.
  - `composeApp/src/commonTest/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponentTest.kt`.
  - `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/EventDtosTest.kt`.
 
## Interfaces and Dependencies
 
- Use existing interfaces: `IEventRepository`, `IFieldRepository`, `ISportsRepository`, `IImagesRepository`, `IUserRepository`, `IMatchRepository`; implement minimal fake methods invoked by `DefaultCreateEventComponent` in tests.
- Functions to exercise:
  - `Event.applyCreateSelectionRules`, `Event.withSportRules` and league/tournament branches.
  - `DefaultCreateEventComponent.validateAndUpdatePrice|validateAndUpdateTeamSize|validateAndUpdateMaxPlayers`.
  - `DefaultCreateEventComponent.selectFieldCount`, `buildLeagueSlotDrafts`, `createEvent` (stub network inside fake repos).
  - `Event.toUpdateDto` for `leagueScoringConfig` handling and template IDs.
