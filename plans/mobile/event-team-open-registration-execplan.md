# Preserve open team registration through event team snapshots

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It is stored under `plans/` as required by that file.

## Purpose / Big Picture

Open-registration teams can appear in event details as event-specific team snapshots. A snapshot is a team row used to represent the canonical parent team inside one event; it has its own id but points back to the canonical team through `parentTeamId`. Today those snapshots can serialize as closed-registration teams, so a user looking at the event participants list may not be offered the expected join action. After this change, event team snapshots inherit the parent team's registration state at serialization time, client join flows resolve the parent team before registering or charging, and future event snapshots are refreshed after a canonical roster change.

The observable result is that a user can open an event participants view, choose a registered event team whose parent team has open registration, see the team labeled as open with the correct price/signing requirements, and join through the canonical team. After the join, future event team snapshots for that canonical team reflect the updated roster.

## Progress

- [x] (2026-06-05 20:06Z) Created the living ExecPlan and recorded the cross-repository scope.
- [x] (2026-06-05 20:35Z) Updated backend serialization in `mvp-site` so event team snapshots inherit registration fields from their canonical parent without copying columns into the event team table.
- [x] (2026-06-05 20:35Z) Updated backend registration synchronization so canonical team roster changes propagate to future registered event team snapshots.
- [x] (2026-06-05 20:35Z) Updated the web site registration flow to resolve canonical parent teams before fetching templates, creating payment intents, and posting registration requests.
- [x] (2026-06-05 20:35Z) Updated the Kotlin app registration flow to resolve canonical parent teams before checking open registration, pricing, signing templates, and posting registration requests.
- [x] (2026-06-05 20:35Z) Added focused regression tests in the site repo and ran validation commands for both repos.

## Surprises & Discoveries

- Observation: `Get-Date -AsUTC` is not supported by the PowerShell version in this environment.
  Evidence: the command failed with `A parameter cannot be found that matches parameter name 'AsUTC'`; timestamps are taken from `[DateTime]::UtcNow` instead.

- Observation: Jest treats the bracketed route segment in `src/app/api/teams/[id]/__tests__/teamByIdCanonicalRoute.test.ts` as a pattern unless the path is passed through `--runTestsByPath`.
  Evidence: the first focused Jest run reported four suites even though five paths were requested; rerunning the route test with `--runTestsByPath` executed and passed it.

- Observation: The first Kotlin compile command needed more than the initial three-minute timeout.
  Evidence: `.\gradlew :composeApp:compileDebugKotlinAndroid` timed out after 184 seconds with no failure output; rerunning the same command with a longer timeout completed successfully.

## Decision Log

- Decision: Do not add open-registration fields to the event team table.
  Rationale: Event team rows are snapshots for event participation; registration openness, price, and required template ids belong to the canonical parent team and should be derived when serializing the snapshot. This avoids stale copied data and matches the user's explicit direction.
  Date/Author: 2026-06-05 / Codex

- Decision: Use the canonical parent team id as the registration target whenever a team has `parentTeamId`.
  Rationale: The canonical team owns open-registration rules, capacity, payment pricing, and signing templates. Posting to the event snapshot id risks using stale or deliberately incomplete data.
  Date/Author: 2026-06-05 / Codex

- Decision: Propagate canonical roster changes by re-claiming future registered event team snapshots.
  Rationale: `claimOrCreateEventTeamSnapshot` already knows how to rebuild an event snapshot from the canonical team and its active registrations. Reusing it keeps event teams consistent without duplicating roster-mapping rules.
  Date/Author: 2026-06-05 / Codex

- Decision: Put future event snapshot synchronization in `mvp-site/src/server/teams/teamEventSnapshotSync.ts`.
  Rationale: Team PATCH, free registration, document-gated registration, paid registration status transitions, leave, and refund paths all need the same future-event propagation. A shared helper avoids route-local duplication and centralizes the future-event filter.
  Date/Author: 2026-06-05 / Codex

## Outcomes & Retrospective

Implemented. Event-team snapshot responses now inherit parent open-registration metadata, registration and document/payment operations on web and mobile resolve the canonical parent team id, and canonical team roster changes now re-sync future registered event team snapshots. Focused site tests, site type checking, and an Android/Kotlin compile target passed.

## Context and Orientation

There are two repositories involved. The mobile app lives at `C:\Users\samue\StudioProjects\mvp-app`. The backend and web site live at `C:\Users\samue\Documents\Code\mvp-site`, which is the source of truth for API paths and response shapes.

In the backend, team response serialization and event team snapshot logic live in `mvp-site/src/server/teams/teamMembership.ts`. A canonical team is the parent team users actually join. An event team snapshot is a row in the event teams store that represents that canonical team inside a particular event and points back through `parentTeamId`. The route `mvp-site/src/app/api/teams/[id]/registrations/self/route.ts` handles the authenticated "join this team myself" request. Child registration and paid registration paths share helper logic in `mvp-site/src/server/teams/teamOpenRegistration.ts` and `mvp-site/src/server/teams/teamChildRegistration.ts`.

In the web client, `mvp-site/src/components/ui/TeamRegistrationFlow.tsx` fetches team templates, starts checkout, and posts self or child registration requests. In the Kotlin app, `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt` starts team registration from the event details participants flow, and `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/TeamDetailsDialog.kt` displays the join action based on the team fields returned by the API.

## Plan of Work

First, update `teamMembership.ts` so serialized event team snapshots can receive registration metadata from their parent team. The event team row will still store only snapshot fields. When `listTeamsByIds` returns an event team with a `parentTeamId`, it will load the canonical parent team and set `openRegistration`, `registrationPriceCents`, and `requiredTemplateIds` from that parent in the serialized response.

Second, add a reusable backend helper for future event snapshot synchronization. The helper will find event team snapshots for a canonical team, filter them to future events where the team is registered, and call `claimOrCreateEventTeamSnapshot` for each future event. Existing team PATCH behavior already does this in-route; registration paths need the same behavior after roster status changes.

Third, update registration flows. The web flow will compute `registrationTeamId` from `team.parentTeamId || team.$id` and use that id for refreshes, sign links, payment intents, and registration requests. The mobile flow will resolve the same canonical id through `TeamRepository` before checking open registration and continuing into signing or payment.

Fourth, add regression tests around the backend behavior and any practical client behavior test already supported by the repo. Validation will include focused site tests and at least a compile or focused test command for the app.

## Concrete Steps

Run repository state checks before editing:

    cd C:\Users\samue\StudioProjects\mvp-app
    git status --short
    cd C:\Users\samue\Documents\Code\mvp-site
    git status --short

Expected state at the start: the app repo has an unrelated untracked `hs_err_pid36364.log`, and the site repo is clean.

Edited backend files in `C:\Users\samue\Documents\Code\mvp-site`:

    src/server/teams/teamMembership.ts
    src/server/teams/teamEventSnapshotSync.ts
    src/server/teams/teamOpenRegistration.ts
    src/app/api/teams/[id]/route.ts

Edited client files:

    C:\Users\samue\Documents\Code\mvp-site\src\components\ui\TeamRegistrationFlow.tsx
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\eventDetail\EventDetailComponent.kt
    C:\Users\samue\StudioProjects\mvp-app\composeApp\src\commonMain\kotlin\com\razumly\mvp\eventDetail\composables\ParticipantsVeiw.kt

Added or updated focused tests:

    C:\Users\samue\Documents\Code\mvp-site\src\server\teams\__tests__\teamMembership.test.ts
    C:\Users\samue\Documents\Code\mvp-site\src\server\teams\__tests__\teamEventSnapshotSync.test.ts
    C:\Users\samue\Documents\Code\mvp-site\src\server\teams\__tests__\teamOpenRegistration.test.ts
    C:\Users\samue\Documents\Code\mvp-site\src\components\ui\__tests__\TeamDetailModal.test.tsx
    C:\Users\samue\Documents\Code\mvp-site\src\app\api\teams\[id]\__tests__\teamByIdCanonicalRoute.test.ts

Validation commands and observed results:

    cd C:\Users\samue\Documents\Code\mvp-site
    npm test -- --runInBand src/server/teams/__tests__/teamMembership.test.ts src/server/teams/__tests__/teamEventSnapshotSync.test.ts src/server/teams/__tests__/teamOpenRegistration.test.ts src/components/ui/__tests__/TeamDetailModal.test.tsx --runTestsByPath "src/app/api/teams/[id]/__tests__/teamByIdCanonicalRoute.test.ts"
    Result: 5 test suites passed, 28 tests passed.

    cd C:\Users\samue\Documents\Code\mvp-site
    npx tsc --noEmit --pretty false
    Result: exited 0.

    cd C:\Users\samue\StudioProjects\mvp-app
    .\gradlew :composeApp:compileDebugKotlinAndroid
    Result: exited 0 on the longer-timeout rerun.

## Validation and Acceptance

Backend acceptance: a test should create or mock a canonical open-registration team and an event team snapshot with `parentTeamId`. Calling `listTeamsByIds` for the event team id must return a team with `openRegistration: true`, the parent `registrationPriceCents`, and the parent `requiredTemplateIds`. Another test should exercise a canonical team registration status change and verify future event snapshots are refreshed. This acceptance was met by `teamMembership.test.ts`, `teamEventSnapshotSync.test.ts`, `teamOpenRegistration.test.ts`, and `teamByIdCanonicalRoute.test.ts`.

Web acceptance: when `TeamRegistrationFlow` receives an event team snapshot with `parentTeamId`, registration requests and payment/template calls use the parent team id, not the event snapshot id. This acceptance was met by `TeamDetailModal.test.tsx`, which verifies a join from `event_team_1` posts registration for `team_1`.

Mobile acceptance: when `EventDetailComponent.startTeamRegistration` receives an event team snapshot with `parentTeamId`, it resolves the parent team and uses the parent for open-registration checks, payment, signing, and the registration post. This acceptance was compile-validated with `.\gradlew :composeApp:compileDebugKotlinAndroid`.

All validation commands listed in `Concrete Steps` passed.

## Idempotence and Recovery

The edits are additive and can be retried safely. Serialization derives parent registration metadata on each response and does not mutate event team storage. The synchronization helper reuses the existing idempotent snapshot claim/update path, so running it multiple times should leave the same future event snapshots aligned with the canonical roster. If validation fails, inspect the focused test output and revise only the touched files; do not reset unrelated working tree changes.

## Artifacts and Notes

Initial repository state:

    mvp-app: ?? hs_err_pid36364.log
    mvp-site: clean

Final validation evidence:

    mvp-site focused Jest: 5 suites passed, 28 tests passed.
    mvp-site type check: npx tsc --noEmit --pretty false exited 0.
    mvp-app Kotlin compile: .\gradlew :composeApp:compileDebugKotlinAndroid exited 0 after retrying with a longer timeout.

## Interfaces and Dependencies

The backend helper will expose a function similar to:

    syncCanonicalTeamFutureEventSnapshots(params: {
      tx: TransactionClient
      canonicalTeamId: string
      canonicalTeam?: Team | null
      createdBy?: string | null
      now?: Date
    }): Promise<string[]>

The exact transaction client type will match existing server conventions. The function returns updated event team ids so callers can assert behavior in tests or perform follow-up chat synchronization if needed.

The mobile app will continue using `TeamRepository.requestTeamRegistration(teamId)` and `BillingRepository.createTeamRegistrationPurchaseIntent(...)`, but `teamId` and `team` will be canonical when `parentTeamId` is present.

## Revision Notes

- 2026-06-05: Initial plan created to guide implementation across the app and site repositories.
- 2026-06-05: Updated the plan after implementation to record touched files, validation commands, results, and the extracted future-event snapshot synchronization helper.
