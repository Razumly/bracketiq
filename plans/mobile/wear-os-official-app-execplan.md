# Build the Wear OS official match app

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. Store this file under `plans/` and keep it self-contained so a contributor can resume the work from this document alone.

## Purpose / Big Picture

Officials should be able to use a Wear OS watch during games instead of pulling out a phone. After this work, a signed-in official can open a watch app, see upcoming assigned matches, check in, start or reset the active segment timer, end a segment or match, and record team-first incidents. The user-visible proof is a buildable `wearApp` Android module whose first screen is the actual officiating experience, not a marketing or placeholder screen.

The first milestone intentionally targets Wear OS only. watchOS and Garmin are separate follow-up surfaces because they use different app targets and distribution pipelines.

## Progress

- [x] (2026-06-08T17:45:10Z) Read `PLANS.md`, root Gradle files, the existing mobile auth and match-operation code, and the paired `mvp-site` match/profile schedule routes.
- [x] (2026-06-08T17:45:10Z) Confirmed the current mobile app logs in with `POST api/auth/login`, stores a bearer token, fetches `GET api/profile/schedule`, and mutates matches through `PATCH api/events/{eventId}/matches/{matchId}` plus `POST api/events/{eventId}/matches/{matchId}/score`.
- [x] (2026-06-08T19:10:00Z) Scaffolded a standalone `wearApp` module with Wear OS manifest metadata, Compose for Wear OS dependencies, resources, and a buildable `MainActivity`.
- [x] (2026-06-08T19:10:00Z) Implemented direct watch login and encrypted bearer token storage with a shared-preferences fallback.
- [x] (2026-06-08T19:10:00Z) Implemented schedule loading, batch user hydration, team/player mapping, and assigned-official match filtering.
- [x] (2026-06-08T19:10:00Z) Implemented the team-first incident flow: select team, select incident type, select player when required or optional, edit the default match minute, then confirm. If a scoring type does not require a player, the selected team score is incremented immediately through the score endpoint.
- [x] (2026-06-08T19:10:00Z) Implemented timer controls: check in, start/reset current segment, end current segment, start next segment or overtime, and end match.
- [x] (2026-06-08T19:10:00Z) Ran the focused Wear OS build successfully with `./gradlew :wearApp:assembleDebug`.
- [x] (2026-06-08T19:55:00Z) Reworked the Wear UI to be match-list-first and round-screen specific instead of generic app-style screens.
- [x] (2026-06-08T19:55:00Z) Added a phone-app launch guard so `composeApp` redirects to `wearApp` when accidentally launched on a Wear OS device.
- [x] (2026-06-08T19:55:00Z) Rebuilt, installed, launched, and screenshot-checked the Wear app on a 384x384 watch emulator.
- [x] (2026-06-08T21:20:00Z) Reworked the in-match Wear flow into dedicated no-scroll watch routes: pre-start match summary, full-screen timer, split team score picker, incident list, and compact incident editor.
- [x] (2026-06-08T21:20:00Z) Added incident edit support through backend `UPDATE` incident operations and changed incident creation/editing to store exact `clockSeconds` from the running timer.
- [x] (2026-06-08T21:20:00Z) Fixed player-recorded scoring match timer starts by omitting segment score maps from non-scoring segment lifecycle operations.
- [x] (2026-06-08T21:20:00Z) Validated with `./gradlew :wearApp:testDebugUnitTest :wearApp:assembleDebug --console=plain` and a 384x384 Wear emulator route check through match detail, timer, split score picker, and add-incident editor.
- [x] (2026-06-08T21:45:00Z) Renamed the center score-picker pill to `Action` and made that route an action hub with incident history plus fixed `Reset` and `End <segment unit>` controls.
- [x] (2026-06-08T21:45:00Z) Changed watch reset to return to match detail with a single `Start` button, and added tied-tiebreak logic so completed tied regulation matches can offer both `Finish` and `Start`.
- [x] (2026-06-08T21:45:00Z) Validated the action screen on the 384x384 Wear emulator: `Action` pill, `Reset`, `End Half`, and reset returning to the start-match view.
- [x] (2026-06-08T22:12:00Z) Split the `Action` route into a first-level vertical menu with `Incidents`, `Reset Time`, and `End <segment unit/overtime>`, then moved current incident rows behind the `Incidents` option.
- [x] (2026-06-08T22:12:00Z) Increased action/list screen top and side padding so the back button no longer clips against the round watch bezel.
- [x] (2026-06-08T22:22:00Z) Added a 5-second auto-return from the split score screen back to the full-screen timer; verified on the Wear emulator.
- [x] (2026-06-08T22:30:00Z) Added an inset back button to the match detail/start screen and verified it on the Wear emulator.
- [x] (2026-06-08T22:42:00Z) Shrunk and moved the match detail/start back button deeper into the round safe area, nudged the match summary down, and verified the corrected screenshot on the Wear emulator.
- [x] (2026-06-08T22:48:00Z) Shifted the match detail/start back button left and reduced it again so it has clearer separation from the `Match` label while remaining inside the round viewport.
- [x] (2026-06-08T22:55:00Z) Removed the check-in success status pill from the match detail/start screen so checking in changes the single action from `Check in` to `Start` without adding clipped content at the bottom.

## Surprises & Discoveries

- Observation: The existing backend already has the atomic match-operation route needed for watch actions. It accepts `lifecycle`, `segmentOperations`, `incidentOperations`, `officialCheckIn`, `finalize`, and `time`.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt` defines those operations, and `mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts` applies them.

- Observation: The backend currently rejects scoring incidents when the match does not require player-recorded scoring.
  Evidence: `sanitizeIncidentOperationsOrThrow` throws `Scoring incidents are only allowed when match rules require player-recorded scoring.` when `linkedPointDelta` is nonzero and `pointIncidentRequiresParticipant` is false. The watch UI can still be team-first and incident-type-first, but non-player scoring must call the score endpoint instead of creating a scoring incident.

- Observation: `GET api/profile/schedule` returns events, matches, teams, and fields, but not user display names for team rosters.
  Evidence: The route response is `events`, `matches`, `fields`, and `teams`. The watch app must batch-fetch user profiles from `GET api/users?ids=...` for player labels.

- Observation: The direct score endpoint requires an existing match segment.
  Evidence: `mvp-site/src/app/api/events/[eventId]/matches/[matchId]/score/route.ts` returns `Match segment not found` when neither `segmentId` nor `sequence` resolves to an existing segment. The watch repository creates/starts the next segment before playerless scoring when needed.

- Observation: `api/profile/schedule` includes events where the user is an event official, but its match query is still scoped to legacy `officialId` and team-related matches.
  Evidence: `mvp-site/src/app/api/profile/schedule/route.ts` builds `officialEventIds` for event involvement, but `matchFilters` only include `officialId`, team participant ids, and `teamOfficialId`. The watch repository now fetches `api/events/{eventId}/detail` for official/host events and filters those matches locally so multi-slot `officialIds` assignments can appear.

- Observation: The screenshot that showed bottom navigation was the phone app package running in the watch viewport, not the Wear app.
  Evidence: `dumpsys window` showed both `com.razumly.mvp` and `com.razumly.mvp.wear`; after launching the Wear package directly, the focused app was `com.razumly.mvp.wear/.MainActivity` and the UI tree contained only the watch login controls.

- Observation: The first Wear login layout used controls that were too tall for a 384x384 round watch after density scaling.
  Evidence: The initial emulator screenshot had the sign-in chip touching the circular edge. The tightened layout screenshot at `/tmp/mvp-wear-ui-tight.png` fits the header, fields, and sign-in chip within the round viewport.

- Observation: Segment lifecycle operations that include a `scores` map can be rejected on matches requiring player-recorded scoring, even when the watch is only trying to start the timer.
  Evidence: The Wear emulator returned `Player-recorded scoring must use the match incident endpoint.` when starting a test match before the watch repository stopped sending `scores` for player-recorded scoring rules.

- Observation: On a 384x384 round watch emulator, standard field rows and footer buttons are too tall for a four-field incident editor with fixed Cancel/Finished actions.
  Evidence: The initial editor screenshot had the Time row covered by the footer. The compact editor now shows Type, Team, Player, and Time above the footer in `/tmp/mvp-wear-editor-final-2.png`.

- Observation: Ending a segment needs to write the segment winner when scores are available so set-based tie checks have useful data.
  Evidence: The backend resolves match winners from `winnerEventTeamId` on completed segments. The watch now sends that value when completing an active segment.

## Decision Log

- Decision: Build a new `wearApp` Android application module instead of modifying `composeApp`.
  Rationale: `composeApp` is the existing phone/tablet KMP app and is currently dirty in the working tree. A separate module avoids disturbing user changes and matches the Wear OS packaging model.
  Date/Author: 2026-06-08 / Codex

- Decision: Use direct watch login and direct BracketIQ API calls for the first Wear OS milestone.
  Rationale: Wear OS can run standalone or hybrid. Direct API calls make the first version usable without implementing phone-to-watch session transfer first. Phone-mediated login can be added later as a convenience layer.
  Date/Author: 2026-06-08 / Codex

- Decision: Keep the watch workflow team-first for all incident entry.
  Rationale: The product decision is that officials select team, then incident type, then player only when needed. Separate score-increment buttons are not part of the watch UX.
  Date/Author: 2026-06-08 / Codex

- Decision: For scoring types that do not require player selection, use the score endpoint after the official selects team and scoring incident type.
  Rationale: This preserves the requested UX while respecting the current backend rule that non-player scoring is a direct score update, not an incident with `linkedPointDelta`.
  Date/Author: 2026-06-08 / Codex

- Decision: Make match detail a single-action pre-start screen and move live match work to dedicated timer and score-picker screens.
  Rationale: The watch goal is to avoid scrolling during officiating. Match detail now shows only match number, teams, start time, field, and either Check in, Start, or Timer.
  Date/Author: 2026-06-08 / Codex

- Decision: Tapping the full-screen timer opens a split home/away score picker; tapping a team starts incident creation and the centered pill opens the current incident list.
  Rationale: This matches the requested tree: timer first, then team choice, with incident history accessible without adding another scrolling control to the timer screen.
  Date/Author: 2026-06-08 / Codex

- Decision: Use the centered score-picker pill as an `Action` hub instead of an incident-only entry point.
  Rationale: Officials need one no-scroll place to access incident history, end the current half/quarter/period, and reset the current segment.
  Date/Author: 2026-06-08 / Codex

## Outcomes & Retrospective

The first Wear OS milestone is implemented as a new `wearApp` Android application module. The debug APK target builds successfully with `./gradlew :wearApp:assembleDebug`.

The implemented app supports direct sign-in, assigned-match list loading, official check-in, timer segment actions, end-match finalization, team-first incident entry, player selection where required or useful, minute adjustment, and direct team-score increments for playerless scoring rules.

Follow-up UI pass: the Wear app now opens to a compact watch-specific flow where authenticated users land on `Upcoming`, a simple vertically scrollable list of assigned matches. Match detail uses compact score/timer strips and short action chips. Team, incident type, player, and minute confirmation screens are single-purpose watch screens. If the phone `composeApp` is launched on a watch device, `MainActivity` redirects to `com.razumly.mvp.wear/.MainActivity` so the phone bottom navigation is not rendered in the watch viewport.

Second in-match UI pass: selected matches now open to a non-scrolling summary with only match number, teams, start time, field, and one action. Starting or opening an active match shows a full-screen timer. Tapping the timer opens a split home/away scoreboard with a centered incident-list pill. Tapping either team opens a compact incident editor with Type, Team, Player, and Time fields plus fixed Cancel/Finished actions. Incident create/edit payloads now include clock seconds captured from the running timer, and existing incidents can be edited through the backend `UPDATE` operation.

Action-screen pass: the centered pill now reads `Action`. The action route lists existing incidents and keeps fixed bottom controls for `Reset` and `End <segment unit>`, where the unit comes from match rules such as Half, Quarter, Period, or Segment. Reset returns to the match detail start state. When regulation is complete, tied, and overtime/shootout/tiebreak rules allow continuation, match detail can show both `Finish` and `Start`; otherwise completed matches do not show a misleading restart action.

Action-menu pass: tapping `Action` now opens a vertical option list first. `Incidents` is the top option and opens the existing incident list; `Reset Time` and `End <unit>` remain direct actions on that first screen. The back button/header padding was increased for round screens.

Timer-return pass: the split score screen now automatically returns to the full-screen timer after five seconds if the official does not choose a team or open Action.

Match-start navigation pass: the match detail/start screen now has a small top-left circular back button inset from the round bezel and shifted left so it does not crowd the centered `Match` label.

Check-in layout pass: successful check-in no longer emits or renders a `Checked in` status pill on the match detail/start screen. The verified post-check-in state shows only match number, teams, start time, field, back, and `Start`.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-app`. The existing shared mobile application is in `composeApp/`. The paired backend and database contract live in `/Users/elesesy/StudioProjects/mvp-site/`, and this repository's `AGENTS.md` instructions require API paths and payloads to match that backend.

The important existing mobile files are:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AuthDtos.kt`, which defines `LoginRequestDto` and `AuthResponseDto`.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/UserRepository.kt`, where email login calls `api/auth/login`.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`, where `getMySchedule()` calls `api/profile/schedule`.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt`, which defines match lifecycle, segment, incident, check-in, and score payloads.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`, which sends match updates to `api/events/{eventId}/matches/{matchId}` and score updates to `api/events/{eventId}/matches/{matchId}/score`.

The important backend files are:

- `/Users/elesesy/StudioProjects/mvp-site/src/app/api/profile/schedule/route.ts`, which returns the profile schedule payload.
- `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts`, which validates and applies match updates.
- `/Users/elesesy/StudioProjects/mvp-site/src/app/api/events/[eventId]/matches/[matchId]/score/route.ts`, which applies direct score updates.

Terms used in this plan:

- Wear OS means the Android-based smartwatch platform. In this repo it will be a separate Android application module named `wearApp`.
- Segment means one set, quarter, period, inning, or other configured slice of a match. The API stores segments in `match.segments`.
- Incident means a recorded match event such as a goal, point, card, discipline item, note, or admin event. The API stores incidents in `match.incidents`.
- Player-recorded scoring means scoring rules require selecting a roster participant before a scoring incident can increment the score.

## Plan of Work

Create `wearApp/` as a new Android application module. Add it to `settings.gradle.kts`. Add version-catalog entries for the Kotlin Android plugin and Wear Compose dependencies in `gradle/libs.versions.toml`, then use those aliases from `wearApp/build.gradle.kts`.

The watch module will contain a compact, self-contained implementation rather than depending on `composeApp`, because `composeApp` is an Android application module rather than a reusable Android library. Later, shared DTOs and API code can be extracted into a library module if duplication becomes a maintenance problem.

Implement a small network layer in `wearApp/src/main/java/com/razumly/mvp/wear/data/`. It will use Ktor OkHttp, Kotlin serialization with `ignoreUnknownKeys = true`, and bearer-token authorization matching the phone app. It will read default API URLs from `secrets.properties` or `local.defaults.properties` at build time, prefer the remote URL on physical watches, and use the local emulator URL on emulators.

Implement a `MvpWearViewModel` that owns the screen state. It will log in, store the token, bootstrap `api/auth/me`, load `api/profile/schedule`, batch-fetch player names through `api/users?ids=...`, filter to matches assigned to the signed-in official, and expose timer and incident actions.

Implement `MainActivity` with Compose for Wear OS Material 3. The main navigation states are login, match list, match detail, full-screen timer, team score picker, incident list, incident editor, incident type picker, team picker, player picker, and time picker. Lists should use Wear-appropriate vertically scrollable UI only where a list is unavoidable. The timer and score-picker routes must not require scrolling.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`, run:

    ./gradlew :wearApp:assembleDebug

When the module exists and compiles, Gradle should finish with `BUILD SUCCESSFUL`. If Gradle fails because the Android SDK or JDK is misconfigured, use the environment guidance in `AGENTS.md`: use JDK 17 and the configured Android SDK.

For backend route tests, if the profile schedule route is edited, run from `/Users/elesesy/StudioProjects/mvp-site`:

    npm test -- src/app/api/profile/schedule/__tests__/route.test.ts

## Validation and Acceptance

The first milestone is accepted when `./gradlew :wearApp:assembleDebug` succeeds and a developer can install/open the Wear app target from Android Studio. On launch, unauthenticated users see an email/password sign-in screen. After sign-in, the app loads upcoming assigned-official matches. Selecting a match shows check-in, score, active segment, timer controls, and team buttons. Tapping a team opens incident types. Scoring types that do not require players increment the score immediately; player-required scoring asks for a player, then minute confirmation, then creates an incident.

## Idempotence and Recovery

All Gradle and source edits are additive except for adding the module include and version-catalog aliases. Running the build multiple times is safe. If an API call fails at runtime, the watch UI should surface the server message and keep the user on the current screen. Token logout clears only the watch app's local token.

The repo already has unrelated dirty files, especially under `iosApp/` and `composeApp/build.gradle.kts`. Do not revert or overwrite those changes. Keep Wear OS edits scoped to `wearApp/`, `settings.gradle.kts`, `build.gradle.kts` if needed, `gradle/libs.versions.toml`, and this plan unless the backend route must be updated.

## Artifacts and Notes

Important source evidence already gathered:

    Mobile login path: api/auth/login
    Mobile schedule path: api/profile/schedule
    Match mutation path: api/events/{eventId}/matches/{matchId}
    Direct score path: api/events/{eventId}/matches/{matchId}/score

Current working tree note:

    The repo is ahead of origin/master and has unrelated dirty iOS/CocoaPods files plus a version bump in composeApp/build.gradle.kts. The Wear OS work should not revert them.

## Interfaces and Dependencies

The new module should expose these project-local classes:

    com.razumly.mvp.wear.MainActivity
    com.razumly.mvp.wear.MvpWearApp
    com.razumly.mvp.wear.MvpWearViewModel
    com.razumly.mvp.wear.data.WearApiClient
    com.razumly.mvp.wear.data.WearMatchRepository
    com.razumly.mvp.wear.data.WearAuthTokenStore

Use these remote API contracts:

    POST api/auth/login
      body: { email: string, password: string }
      response includes token and user/profile data.

    GET api/auth/me
      response includes user/profile data for an existing token.

    GET api/profile/schedule
      response includes events, matches, teams, and fields.

    GET api/users?ids=a,b,c
      response includes user profiles used for player labels.

    PATCH api/events/{eventId}/matches/{matchId}
      body may include officialCheckIn, lifecycle, segmentOperations, incidentOperations, finalize, and time.

    POST api/events/{eventId}/matches/{matchId}/score
      body: { segmentId: string?, sequence: number, eventTeamId: string, points: number }

Revision note 2026-06-08: Created this plan before implementing the first Wear OS module so the significant feature follows `PLANS.md` and records the initial product/API decisions.
Revision note 2026-06-08: Completed the first Wear OS module implementation and validated it with `./gradlew :wearApp:assembleDebug`.
Revision note 2026-06-08: Reworked the Wear UI around a compact upcoming-match list, added a composeApp-to-wearApp redirect guard for watch devices, and validated with `./gradlew :composeApp:assembleDebug :wearApp:testDebugUnitTest :wearApp:assembleDebug --console=plain`, direct emulator launch of `com.razumly.mvp.wear/.MainActivity`, and a composeApp launch redirect test.
