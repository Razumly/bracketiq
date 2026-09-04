# Connect terminal Match actions to atomic Reflow


This ExecPlan follows root `PLANS.md`. Keep its progress, findings, decisions, and outcome current.

## Purpose / Big Picture


Completion, forfeit, cancellation, and no-contest must use one terminal Match operation. The operation saves the result, bracket advancement, affected Schedule changes, and any schedule-set Event end together. A failure saves none of these changes. A retry uses the same operation identity and does not repeat changes or notifications. Android and iOS observe one committed Room refresh.

Issue: https://github.com/Razumly/bracketiq/issues/46. Its only native blocker, issue 45, is closed. The user approved implementation as the next slice in this Workstream batch. The user confirmed three test boundaries: the atomic terminal API, notification delivery after commit, and the mobile action-to-Room flow.

## Progress


- [x] (2026-09-04) Read issue 46 and all comments. Confirm that it is open and unblocked. Claim it. Set Status to In progress and Area to Shared.
- [x] Inspect the current terminal action, operation receipt, Reflow, notification, and mobile mutation paths.
- [x] Confirm the three test boundaries with the user.
- [x] (2026-09-04) Implement the terminal operation and canonical result through failing API tests. Include legacy terminal lifecycle writes.
- [x] Prove completion, forfeit, cancellation, no-contest, disabled automation, protected state, rollback, and replay in an isolated database.
- [x] Implement post-commit change notifications for participants and officials. Prove replay deduplication.
- [x] Update the mobile request, decoding, action gates, stable operation identity, and atomic Room refresh. Run a real client-to-site contract check.
- [x] (2026-09-04) Run affected checks and complete the site and Android/JVM suites. Record the existing failures.
- [x] (2026-09-04) Review against the fixed issue baseline on both Standards and Spec axes. Fix all hard and specification findings.
- [x] (2026-09-04) Commit the verified change. Set the project item to Done. Close issue 46 with verification context.

## Surprises & Discoveries


The existing Match PATCH route already locks the Event and records durable client operation receipts. Its finalization path still calls `finalizeMatchWithTeamOfficialCapacityFallback`, which uses the broad rescheduler. The forfeit action sets `COMPLETE` before the legacy finalizer can advance Teams. Cancellation has no Reflow call. The route saves every hydrated Match and returns only one Match.

Mobile `MatchRepository.updateMatchOperations` currently queues all operations with an optimistic Room write. The Match screen also writes an optimistic terminal state. A rejected terminal action can therefore show partial state before reconciliation. Terminal operations need a separate confirmed-save path while non-terminal scoring can keep its existing queue.

## Decision Log


Decision: Keep the current Match PATCH route as the canonical terminal API. Extend it with a versioned terminal result and reuse its authorization, scoring validation, Event lock, and operation receipt. Do not add a second competing lifecycle route. Reason: completion can include final segment confirmation, which must remain in the same transaction. Date: 2026-09-04.

Decision: Call the issue 45 planner from the caller-owned transaction. Preserve published times on the terminal Match. Use actual end only for released capacity. Reject the complete operation if required Reflow cannot finish. Do not retain the legacy capacity fallback for terminal Tournament operations. Date: 2026-09-04.

Decision: Reflow is unavailable when Automated Scheduling is disabled. Terminal results and valid bracket advancement still save, but placements and Event end remain unchanged. Cancellation and no-contest free independent capacity without resolving winner/loser dependencies. Date: 2026-09-04.

Decision: Reuse the current branch because the user added issue 46 to this Workstream batch. Baseline is `43aa0d3c1`. Local main is `a877f70c8` and is already an ancestor of the branch. Do not push, integrate into main, deploy, or start any runtime without separate current authorization. Date: 2026-09-04.

Decision: Send one post-commit push per terminal operation. Include a preview that stays below 1,800 JSON characters. Include the total and omitted change counts. Recipients load the complete committed Schedule in the application. Reason: a large Reflow must not exceed push payload limits or send one push per changed Match. Date: 2026-09-04.

Decision: Use the Event terminal Match collection endpoint for the atomic domain command. The request names one source Match. The response and Room save contain the complete affected Match batch and Event end. Keep the old item route compatible for existing versioned commands. Reason: this satisfies the bulk-save rule without splitting one result action across endpoints. Date: 2026-09-04.

Decision: Store one durable in-app notification per recipient inside the terminal transaction. Store the complete previous and new values. Send the bounded push only after commit as an alert. Reason: a push failure must not lose the Schedule update, and a replay must not create duplicate notifications. Date: 2026-09-04.

Decision: Expose the latest typed terminal result from the mobile repository. Match detail observes this result. A background replay remains visible after the outbox operation is acknowledged. Reason: replay must not become an ordinary success or rely on write-only outbox metadata. Date: 2026-09-04.

## Outcomes & Retrospective


Implementation and verification are complete. Nineteen real database/API and notification tests passed. They cover all four outcomes, legacy lifecycle writes, site and server replay, rollback and retry, disabled automation, protected advancement, the Event end rule, bypass rejection, input validation, durable notification values, and push failure. Sixty route and site client tests passed. Fifty-one Reflow tests passed. TypeScript and lint passed. Three real Kotlin-to-site route tests prove one Room transaction, recovery after a Room write failure, replay after a lost response, and an observable typed replay result. Seventy-six Match component tests passed. The complete Android/JVM run has the same five issue 45 Event Editor parity failures and no issue 46 failure. The complete site run passed 885 suites. It had the known baseline failures and two issue 46 failures in files that changed while the run was active. Both current issue 46 suites then passed with 60 tests. The final review reports no specification findings and no hard standards findings. The implementation is committed on the Workstream branch. Issue 46 is closed, and its project Status is Done. All 224 migrations are applied in `bracketiq_e2e_46_563b`. The issue 45 full-suite reports remain untracked and are not part of either issue 46 commit.

## Context and Orientation


`apps/site/src/app/api/events/[eventId]/matches/[matchId]/route.ts` owns authenticated Match mutations and final segment operations. `apps/site/src/server/matches/clientOperationReplay.ts` claims durable operation identities inside the transaction. `apps/site/src/server/scheduler/updateMatch.ts` contains the old completion logic. `apps/site/src/server/scheduler/reflow/` contains the bounded affected-only planner and atomic save from issue 45. `apps/site/src/server/matchScheduleNotifications.ts` now captures placement and assignment deltas. It includes Team participants and named Officials in the recipient set.

`apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt` owns mobile wire types. `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` owns remote writes and Room persistence. `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt` and its screen own terminal action controls. Both Android and iOS use this code.

A terminal action ends a Match. An operation identity is a stable client-generated value reused on retries. An operation receipt proves that the server already committed that identity and payload. A canonical result contains server-authoritative values that the mobile application can persist together. A protected Match cannot be moved or reassigned by Reflow.

## Context Boundary


Use issue 46 and its comments, root and child AGENTS policies, site coding standards, the Schedule and Automated Scheduling entries in `CONTEXT.md`, this plan, and the named files above. Read exact helper implementations when the terminal path calls them. Read the database isolation guide before database setup. Read the current Prisma receipt and notification definitions if durable response or notification state needs a schema change. Read mobile database and Event DTO code only for the atomic refresh. Do not inspect unrelated affiliate or billing code.

## Plan of Work


First, write one failing terminal API test against a fresh issue database. Use the real transaction, canonical models, and Reflow planner. Keep external push delivery behind the application's notification function. Add only the terminal result and persistence behavior needed by that test. Extend coverage one behavior at a time.

Next, separate advancement from legacy rescheduling. Apply completion and forfeit to the correct winner and loser links, including protected dependency checks. Treat cancelled or no-contest dependencies as unresolved while releasing their independent Resource and official commitments. Use current state under the Event and Resource locks. Compare before and after values and save only changed Matches. Update a schedule-set Event end only if the latest scheduled end changes.

Then, create a post-commit notification plan with previous and new times and assignments. Include affected playing Teams, Team Duty Teams, and named Officials. Dispatch only for a newly committed changed operation. Replays must not rerun planning or delivery. Use durable application receipts; do not test a hand-built push provider.

Finally, update current site and mobile callers together. Terminal mobile actions retain the old Room state during the request. Keep one stable operation identity for retry. Decode typed failure, no-op, replay, and changed results. Persist all returned Match changes and Event end inside one Room transaction. Do not write optimistic terminal state or apply a second per-Match save after the transaction.

## Concrete Steps


Run site commands from `apps/site`:

    npx tsc --noEmit
    npx jest --runInBand --testPathPatterns=terminalMatch
    npx jest --runInBand
    npm run lint

Use the already-running local PostgreSQL server on port 5543. Create only the logical database `bracketiq_e2e_46_563b`. Read local credentials without printing them. Scope the database URL to each test process. Run `npm run migrate:deploy`, then `npx prisma migrate status`. Run database tests only after all migrations are applied. Do not start or restart the database or backend.

Run Gradle from `apps/mobile`. Select the exact terminal Room and Match component tests after adding them. Run the complete Android/JVM suite once with `./gradlew testDebugUnitTest --continue`. Do not run native iOS tests on Windows. Do not run two Jest or two Gradle invocations concurrently in this checkout.

## Validation and Acceptance


A completed or forfeited bracket Match advances the correct Teams and repairs only affected Schedule state. A cancelled or no-contest Match releases independent capacity but leaves its winner and loser dependencies unresolved. Disabled Automated Scheduling causes no placement change. A required staffing or placement failure leaves result, advancement, Schedule, and Event end unchanged. A replay causes no Schedule write and no repeated notification.

Notifications run after commit and contain old and new placement or assignment values. They reach the affected participants and officials. Mobile sends a client-serialized command through the real site parser or route. One successful action writes all canonical changes in one Room transaction. Failure and replay do not rewrite the Room Schedule. Controls do not offer an action forbidden by Match state or account capability.

## Idempotence and Recovery


Preserve all existing files and commits. Do not reset or clean the worktree. A failed server transaction rolls back the receipt and Match writes. Retry an uncertain operation with its original identity. Do not create a new identity merely because a response was lost. If the server commits but Room fails, keep a typed synchronization failure and reconcile through the authoritative result without repeating terminal effects. Record any delivery limit explicitly.

## Artifacts and Notes


Current branch: `workstream/issue-42-schedule-diagnostics`. Implementation baseline: `43aa0d3c1`. Issue project item: `PVTI_lADOEvQGEc4BgoWrzg23a4U`. The local walkthrough on port 3100 remains stopped and is not part of issue 46.

## Interfaces and Dependencies


Use the existing TypeScript, Zod, Prisma, Kotlin serialization, Room, and application notification modules. Do not add a solver or queue runtime. Keep request parsing owned by `apps/site`. Record each changed request and response field here before the mobile parser consumes it. Use a new version for required terminal response fields. Keep the existing unversioned parser compatible where it can safely use the same atomic behavior.

The terminal Match collection PATCH request contains `matchId` and `update`. The update adds optional `terminalContractVersion: 1`. Every terminal update requires `clientOperationId`. `matchAction.action` adds `NO_CONTEST`. Existing `finalize`, `segmentOperations`, `time`, and operation metadata keep their shapes. Legacy terminal lifecycle writes use the same atomic operation.

The PATCH response keeps `match` and `replayed`. Terminal responses add `terminalResult`. Its required version 1 fields are `contractVersion`, `operationId`, `eventId`, `matchId`, `status`, `event`, `matches`, `affectedMatchIds`, `protectedMatchIds`, `placementChanges`, `assignmentChanges`, `warnings`, and `exploredStates`. `event` contains `id`, `end`, and nullable `generatedScheduleEnd`. `status` is `CHANGED`, `NO_OP`, or `REPLAYED`. Match values use the existing canonical graph Match shape. Reflow deltas and warnings use the existing Reflow version 1 shapes. Replay has no Match or Schedule deltas. HTTP 409 Reflow failures return `code`, `error`, and `warnings` and save no terminal state.

Plan revision: 2026-09-04. Updated after final verification. The revision records the bulk command endpoint, durable notification delivery, mandatory operation identity, bounded pushes, completed Room recovery proof, observable replay results, and full-suite baselines.
