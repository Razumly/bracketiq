# Complete safe Event Type transitions

This plan follows PLANS.md. Keep its progress and decisions current.

## Purpose / Big Picture

Organizers must keep compatible Event settings when changing Event Type. A destructive change must identify what it removes and require explicit confirmation. Registration and protected Match history must block an invalid transition before either server or Room writes occur. Protected Match deletion needs its own confirmation and must preserve the Event end.

## Progress

- [x] (2026-09-06) Read issue #51, its comments, ADR-0009, ADR-0010, and the relevant site and mobile paths. Claim #51.
- [x] (2026-09-06) The user requires graph preservation. Only explicit Rebuild can replace an incompatible graph.
- [x] Complete protected Match deletion confirmation in the shared mobile flow and HTTP client.
  - [x] Add the shared confirmation dialog and bind consent to the reviewed Match payload.
  - [x] Add the optional HTTP confirmation field and atomic Room response writes.
  - [x] Pass focused coordinator, HTTP, and Room tests. The first regression test failed as expected.
- [x] Align the site behavior and both editors with the accepted transition behavior. Preserve the existing warning response contract.
- [x] Prove preservation, cancellation, locks, and atomic Room replacement through existing tests and a live client-to-site fixture.
- [x] Run affected complete suites, type checks, lint, and two review axes. Prepare the completed issue for commit and reconciliation.

## Context Boundary

Use issue #51 and its comments, root AGENTS.md, apps/site/AGENTS.md, apps/mobile/AGENTS.md, CONTEXT.md definitions of Event Type, Division, Participant Registration, Match Graph, and protected history, and ADR-0009 and ADR-0010. The site contract owner is apps/site/src/contracts/eventEditor.ts. Read eventEditorSave.ts, eventEditorSnapshot.ts, the Event Match routes, and their named dependencies when changing their behavior. Mobile owners are EventEditActionHandler, EventEditDraftCoordinator, EventMatchEditActionHandler, EventMatchEditingCoordinator, EventEditorSessionMapper, EventRepository, and eventDetail/data/MatchRepository. Expand into their DTOs, UI bindings, and existing tests only when a changed interface requires it.

## Context and Orientation

The current worktree is C:/Users/samue/.codex/worktrees/563b/BracketIQ on workstream/issue-42-schedule-diagnostics. The #51 base is 9bbad4d8a. Local main is c4036b05e and is already merged into this branch. The user explicitly requested the next issue in this existing workstream. The prior #49 commit remains local.

Both editors already warn that a type change preserves the Schedule. Mobile always encodes scheduleTransition.mode=PRESERVE. The server also accepts RECONCILE, which can Build, Rebuild, or Delete during Save. Snapshot immutable fields enforce registration and protected-history locks. Room already writes canonical editor results and replacement Matches in a transaction. The server Match mutation endpoints support a confirmation field for protected deletion; mobile does not send it or offer that confirmation.

## Decision Log

ADR-0009 makes Divisions independently capable of registration and competition. Preserve a Division's remaining responsibilities; do not remove it merely because it once belonged to a phase.

The user clarified ADR-0010: an Event Type change preserves the Match Graph, including an incompatible graph. Warn that the graph has not been rebuilt and does not conform. Only explicit Rebuild can replace it. Preserve registration and protected-history locks. This decision replaces the issue acceptance criteria that require type-transition graph deletion. The legacy RECONCILE parser remains recognizable so the server can return a clear intent rejection before writes. Normal clients already send PRESERVE. Keep the NOT_REQUESTED wire response unchanged with empty warnings. Both editors derive the preserved-graph warning from the previous Event Type, the saved Event Type, and the existing Match count. This avoids a decode failure in existing mobile clients after a remote commit. The contract version remains unchanged.

Reuse the previously established workstream test boundaries: editor actions, public route/client calls, and Room repository behavior. The separate protected-Match confirmation path uses separate consent from the Event Type transition.

## Plan of Work

First complete protected deletion as one vertical slice. Exercise the existing Match mutation boundary. The UI must show the server's protected-history warning, retain edits on cancel or rejection, and send confirmation only after acceptance. Keep the Event end unchanged.

Next implement the accepted type-transition rule in the site contract and both clients. Explain configuration loss before save. Preserve compatible Resources, Time Slots, staff, public details, registration configuration, and Division responsibilities. Apply immutable locks both before submission and inside the authoritative transaction.

Finally verify a real mobile-produced command against the site in an isolated #51 database. Confirm Room replacement, failure rollback, stale confirmation handling, and all five Event Types. Run complete affected suites once, then focused checks after fixes. Obtain Standards and Spec reviews before committing.

## Concrete Steps

Run site tools from apps/site. Run Gradle from apps/mobile with --console=plain --offline --max-workers=1. Use existing Event Editor save, Match route, Match repository HTTP, Room persistence, and shared editor action tests. Run TypeScript with node node_modules/typescript/bin/tsc --noEmit. Run node scripts/lint-changed.mjs and :composeApp:lintDebug.

## Validation and Acceptance

An unprotected, unregistered Event can change type with compatible values intact. Cancellation sends no command and leaves the reviewed state intact. Registration or protected-history changes discovered at submission produce typed rejection and no local deletion. Confirmed protected Match deletion removes only the reviewed Matches and does not change Event boundaries. Event Type changes preserve every Match and warn before and after Save. Every changed request or response receives a live client-to-site check.

## Idempotence and Recovery

Use a fresh bracketiq_e2e_51_samue database for live verification. The user authorized backend starts and stops for this work on 2026-09-06. Use only the isolated #51 backend on port 3110 and database on port 5543. Preserve the existing sites and databases. Do not push or deploy. Keep session tokens and disposable reports out of commits.

## Interfaces and Dependencies

The protected Match batch route already accepts an optional confirmation string. IMatchRepository.updateMatchesBulk now accepts optional confirmation. PreparedMatchBulkUpdate carries it after review. EventMatchEditActionHandler passes it to the repository. The PATCH body includes confirmation only with deletions. No response field or required server field changes. EventDetailComponent exposes the warning and explicit confirm and dismiss actions. The Event Editor transition contract follows the accepted preservation decision. Any changed required shape needs a version increase or a supported compatible parser. Room is the local source of truth; remote results must be written before UI observation.

## Surprises & Discoveries

The issue's structural transition requirements predate ADR-0009 and ADR-0010. Existing tests still assert the legacy RECONCILE behavior, while both clients now preserve the Schedule. This is a real contract mismatch, not evidence that the issue is complete.

## Outcomes & Retrospective

Implementation and both review axes are complete. The user decision is recorded in ADR-0010 and issue #51. Save preserves the complete Match Graph. Both editors warn before and after the Event Type change. Protected Match deletion has separate consent bound to the reviewed payload.

The initial protected-deletion test failed at the intended assertion. Review found early Time Slot deletion and Room phase-loss paths. The fixes preserve Time Slots during type changes and preserve graph phases during editor saves, detail refreshes, and local cache updates.

A live test exposed a proposed response incompatibility: older mobile clients require empty NOT_REQUESTED warnings. The proposed wire change was removed. Both editors now derive the warning from the successful type change. The strict original mobile DTO and site contract remain unchanged. The mobile Match PATCH caller now sends the server's existing optional confirmation field only for reviewed deletions.

Verification:
- The complete mobile run passed: 107 network tests; 153 repository tests with five skips; 1652 shared UI tests with ten skips; Android lint.
- After final fixes, 78 editor, coordinator, HTTP, and Match Room tests passed. Android lint passed again. The fresh complete Room suites passed 35 tests with three unconfigured live-fixture skips.
- The live client-to-site test passed with the original strict response decoder. Save preserved Matches. Protected history blocked the type change. Protected deletion required consent. The Event end stayed unchanged.
- The database comparison passed. Every Match, Phase Division, source link, and phase roster stayed unchanged after Save.
- TypeScript and changed-file lint passed. Lint reported zero errors and 25 advisory warnings. After the final test-fixture correction, TypeScript and page test-file lint passed again.
- The first full site run ended without a final report after a tool session reset. It completed 27 suites. The remaining 909 suites then ran with one worker and a 512 MB recycling limit. The remaining run passed 891 suites and skipped seven.
- Across both runs, 29 failed suites also failed in the prior #49 baseline. They include Windows tooling, migration fixtures, and Playwright files discovered by Jest. No #51 regression remains.
- Two Event Form assertions failed in the broad run and passed in isolation. The new page warning assertion was moved from the adjacent test to the type-change test. Its mock NOT_REQUESTED outcome was corrected to report the preserved Match count. The complete page suite then passed all 100 tests.
- The mocked email suite failed because the broad run disabled outbound providers. Both tests passed with their normal test environment. No real email was sent.
- Both source reviews found no remaining material issue. Native iOS execution was not available on Windows. Shared mobile behavior was checked through the Android test target.

The isolated database is bracketiq_e2e_51_samue on port 5543. All 224 migrations are applied. The authorized backend on port 3110 was stopped after live verification. PostgreSQL remains running. The user approved stopping idle Gradle daemon 34644 after the mobile tests. No other build process was stopped.

Keep all test-results files, session tokens, and disposable runtime helpers out of the commit. Commit the source, tests, ADR, plan, and reusable fixture scripts. Reconcile the issue after the final commit. Delivery remains separate; do not push or deploy.