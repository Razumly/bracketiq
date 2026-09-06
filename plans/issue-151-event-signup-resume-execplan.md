# Guide Event signup and resume across devices

This plan follows `PLANS.md`. Keep all living sections current.

## Purpose / Big Picture


An Account can create a Team during Event signup, optionally add Players, and return to the original Event review. An Account can also resume on another device. Saved Teams, Players, and invitations remain saved. Only explicit registration confirmation can complete registration. The last Team used for a completed registration supplies the default for the same sport.

## Context Boundary


Use issue #151 and its comments as the specification. Use the Event journey rules in `docs/adr/0013-separate-user-profiles-rosters-and-invitations.md` and `docs/event-signup-team-roster-spec.md`. Read `AGENTS.md`, both application AGENTS files, and the workstream and database isolation guides. The implementation starts at commit `9fc04d457` on `codex/issue-146`.

The site boundary includes `apps/site/src/app/discover/components/EventDetailSheet.tsx`, its `eventDetail` controllers, `apps/site/src/components/ui/TeamBuilderModal.tsx`, the Team and Event service modules, and their HTTP routes. The backend boundary includes `apps/site/prisma/schema.prisma`, `apps/site/src/server/events/eventRegistrations.ts`, and the canonical Team and invitation modules. Expand to billing only to prove which committed state means completed registration. Preserve ADR-0012 document evidence rules.

The mobile boundary includes `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail`, the Team builder, and the repository, network, model, and Room modules used by those screens. Read other code only when an affected caller, authority check, or database association requires it. Do not stage the existing user changes in CONTEXT.md, ADR-0013, or the specification.

## Progress


- [x] (2026-09-05 23:10Z) Read issue #151. Claim it and set the project status to In progress.
- [x] (2026-09-05 23:25Z) Confirm that both clients use local drafts. Confirm that the site sends Team creation to the full management flow.
- [x] Add shared Event draft reads and explicit step saves. Validate authority, sport, occurrence, division, and registration references.
- [x] Persist the completed-registration Team preference per Account and sport.
- [x] Add the short site journey with optional adult and guardian Player forms. Keep creation and invitation retries idempotent.
- [x] Add the corresponding mobile journey. Persist remote draft data in Room before UI observation.
- [x] Prove database behavior, both cross-device directions, UI behavior, and failure recovery.
- [x] Run type checks and full suites. Run the required Standards and Spec reviews. Resolve new failures with focused rechecks. Prepare the verified work for commit and issue closure.

## Context and Orientation


`RegistrationProgressDraft` currently means local progress. The site stores it in localStorage. Mobile stores it in DataStore. Both keep Team, Division, answers, and checkout context. The site hook also discards an entire draft when its checkout hold expires. This loses useful preparation state.

A canonical Team is the reusable Team. An Event Team is the roster snapshot for one Event. `EventRegistrations` contains the registration lifecycle. An accepted Participant Registration uses ACTIVE or BLOCKED with an acceptance time. Team creation already has a receipt keyed by Team ID. Team invitations already accept idempotency keys. Reuse these contracts. A draft is preparation state and must never grant authority, complete required documents, or start a charge.

## Plan of Work


First add an Account-scoped Event draft endpoint under `apps/site/src/app/api/events/[eventId]/registration-draft`. Store the Event, occurrence, selection, answers, saved step, and registration reference in an additive Prisma model. Return eligible Teams and the selected default from the server. A valid draft selection has priority. Otherwise use the last completed Team for that sport, then the sole eligible Team. Several eligible Teams require a compact picker. Revalidate stored context on each read and write. Preserve answers when a hold expires. Use revision checks to prevent a stale device from overwriting newer progress.

Then record the last completed Team in the same transaction as registration completion. Do not update it for a draft save, Team save, or invitation save. Repeated completion requests must not reorder preferences. Add tests through the application HTTP boundary against a fresh issue database.

Next connect the site progress hook to the shared service. Show saved progress and save errors. Add an Event mode to the existing Team form. Save required Team details before the optional Player step. Keep a stable Team ID and invitation request keys through retry. Return to the original Event review with the saved Team selected. Preserve Division and occurrence context. Reuse the adult and guardian fields. Preparation must not change another Event roster.

Then implement the same HTTP contract in mobile DTOs and repositories. Store the response in Room in a transaction. Observe Room from the Event flow. Add the short Team form mode and retain normal Team management. Resume the next incomplete step without repeating successful saves. Final confirmation continues to use existing questions, signing, payment, and eligibility checks.

## Concrete Steps


Run site commands from `apps/site`. Run focused Jest tests with `npx jest --runInBand --runTestsByPath <path>`. Set `RUN_DATABASE_INTEGRATION=1` and use only `bracketiq_e2e_151_codex` for the new database suite. Apply all migrations with `npm run migrate:deploy`. Confirm `npx prisma migrate status` reports no pending migration. Run `npx tsc --noEmit` during implementation.

Run mobile commands from `apps/mobile`. Use JDK 17 and `ANDROID_HOME=C:/Users/samue/AppData/Local/Android/Sdk`. Run the focused repository and UI tests first. Run `./gradlew.bat :composeApp:testDebugUnitTest` at the final gate. Regenerate and inspect the Room schema after changing Room entities.

Use the existing isolated PostgreSQL data directory at `/home/camka/.cache/bracketiq-issue150/data`, port 5433, after current runtime authorization. Create a separate logical database named `bracketiq_e2e_151_codex`. Use a site test server on port 3151 with outbound providers disabled. The restricted inspection could not list listeners. Elevated inspection confirmed that PostgreSQL 5433 and the issue 150 server 3150 were already running. The user gave full approval for the requested issue 151 test runtimes. The issue 151 server now runs on port 3151. It uses a separate .next-issue151 build directory. All three migrations passed on the fresh issue 151 database. Do not operate production.

## Validation and Acceptance


The first failing test must show that a saved draft is available to another authenticated client of the same Account. Then cover a different Account, a different sport, a stale revision, an expired hold, removed Team authority, and a closed Event. Verify that preparation creates no completed Participant Registration and no charge. Verify that only completed registration changes the remembered Team.

Exercise new and returning Team journeys at desktop and phone site sizes. Exercise the native mobile flow. Cover Change team, optional Add players, back navigation, duplicate submissions, and saved invitations with failed delivery. Prove a site draft can resume through the real mobile HTTP client and Room. Prove a mobile save can be read through the site service. A mocked transport is insufficient for that proof.

The site baseline has 45 known failures from prior work. Its last full output is `apps/site/test-results/issue-150-full-final.json`; 14 additional fixture failures in that raw output were fixed in commit 9fc04d457. The mobile baseline has one unrelated TeamDetailsDialogUiTest label mismatch. Compare failures by test name. Record new results here. Do not classify a new failure as baseline without evidence.

## Idempotence and Recovery


Each explicit save is its own server transaction. A failed related write rolls back that save. A delivery failure does not roll back saved identity or invitation state. A resume read never creates a Team or sends an invitation. A stale revision returns the current saved state for review. Never use a long transaction across the complete journey.

## Interfaces and Dependencies


The new registration-draft endpoint uses version 1. GET and DELETE accept optional slotId and occurrenceDate. PATCH accepts version, baseRevision, scope, and patch. Patch fields are selectedTeamId, selectedDivisionId, selectedDivisionTypeKey, answers, step, completedSteps, registrationId, and teamCreationId. The response contains version, draft, eligibleTeams, selectedTeamId, selectionSource, available, unavailableReason, and invalidations. Draft fields also include id, eventId, scope, revision, holdExpiresAt, completedAt, and updatedAt. Team creation accepts optional registrationDraft scope and baseRevision. Member invitations accept optional eventRegistration scope. A Team creation draft error can return optional state with the actual saved draft. Mobile stores that state in Room before retry. Existing callers remain valid. Both clients must use that contract. Existing Team and invitation APIs retain their supported fields; any new preparation context must be optional or use a new version. Room is the local source for fetched mobile draft data. Use existing application services for signing and billing.

## Surprises & Discoveries


The current site Team builder creates the Team only at the end of a multi-step wizard. It can therefore lose unsaved preparation on close. The Event progress hook stores a step but does not restore that step. The existing Team creation endpoint already has a stable-ID receipt, which can prevent duplicate Team creation.

## Decision Log


Use shared HTTP state for Event drafts and retain the separate local Team-registration flow. This keeps the change within issue #151. Use the current branch because the implement skill requires it and the preceding slices are present here. Date: 2026-09-05. Author: Codex.

## Artifacts and Notes


Issue: https://github.com/Razumly/bracketiq/issues/151. Project status is In progress. Test launchers and logs belong in `.scratch` or `apps/site/test-results` unless a reusable committed test fixture requires a source file.

## Outcomes & Retrospective

The implementation, browser checks, and full suite comparison are complete. Type checking and lint pass. All acceptance criteria have test or browser evidence. Commit the verified work on codex/issue-146. Close issue #151 after the commit succeeds.

All 14 PostgreSQL tests pass. They cover Account and sport isolation, draft selection priority, multiple Teams, invalid defaults, Division normalization, stale revisions, denied authority, expired holds, closed Events, completion-only preferences, atomic Team creation, retries, rollback, and saved invitations with failed delivery. Preparation creates no completed registration or charge. All three migrations are applied to bracketiq_e2e_151_codex.

The real mobile HTTP integration test passes in both resume directions. It checks Room state, stale revision recovery, and Account isolation. All three native Team builder UI tests pass. All 45 registration coordinator tests pass. The full native run has 1,634 tests: 1,617 passed, 2 failed, and 15 skipped. One failure is the existing TeamDetailsDialogUiTest label mismatch. The other failure used a fake repository without the new draft API. That fixture is corrected and its 21-test recheck passes. All 16 native presentation-host tests pass, including Continue registration action precedence.

The desktop browser check created River Juniors through one Team-details step. It reached optional Add players and returned to the original River City Cup Event with the new Team selected. The phone check at 390 pixels showed explicit final confirmation, Back, Change team, and a compact two-Team picker. It selected River Crew without repeating Team creation. A canonical Player invitation saved with HTTP 201. Registration remained incomplete during preparation.

Browser checks found three defects. An empty failed Team batch showed no Teams instead of an error. A late invitation refresh could replace another signup scope. The reused guardian form read expired browser events from three state updates. Each defect has a regression test. The Team batch and scope tests passed after their fixes. The guardian test passes in the full site run. The form also uses a stable empty invitation-list default to prevent a render loop. The final browser recheck passes.

The Standards review has no unresolved hard findings. It retains one optional Data Clumps observation in TeamRepository. The Spec review has no unresolved findings after the resume-action, scope-guard, and guardian-input fixes. Local proof files include .scratch/issue-151-live-pass.xml, .scratch/issue-151-native-ui-pass.xml, and .scratch/issue-151-mobile-full-summary.json.

The Next.js development server reached both its initial 4 GB and later 6 GB heap limits during repeated compilation. The approved issue 151 runtime was restored for the final browser check. The database remains available. The live fixture uses Indoor Volleyball because the sports endpoint migrates the deprecated Volleyball name. A Team created later with the old name correctly fails sport eligibility.

The completion preference uses a deferred EventRegistrations trigger. This keeps free, manual-payment, and paid completion updates in the same transaction. It reads final transaction state and ignores repeated accepted-state updates. Account deletion removes drafts and preferences. Event Player preparation records the exact registration ID on TeamInviteEventSyncs. Acceptance and rollback use that ID for weekly scope.

Room schema 110 is generated. The documented roomGenerateSchema task is absent. The configured KSP and copyRoomSchemas path generated the schema instead.

Player search suggestions are an explicit transient flow. They belong to the current query and Account. The component cancels the previous query and clears suggestions when the form closes or its Account, Event, or Occurrence changes. The invitation save writes the saved Player and Team to Room. Drafts and saved rosters use Room subscriptions.

Main was clean and current at 86283ca5e before final validation. The issue branch already contained it.

The phone browser completed a free registration only after explicit confirmation. It showed one registered Team. A fresh Event then selected the same completed Team from two eligible Teams and went directly to review. The saved Player step survived a server restart. Desktop and 390-pixel browser checks passed. The guardian checkbox and form layout passed the phone recheck. Both Event form tests that failed in the full site run passed in a focused recheck.

The full site run completed 822 suites and 6,048 tests. It reported 5,871 passed, 63 failed, and 114 skipped. Of the failures, 46 match tests in the issue 149 or 150 baseline. The other 17 pass focused rechecks. Three were transient Event form and calendar failures. The signup fixtures now provide shared draft state and use the new Team controls. Payment tests retain Division, ownership, cancellation, conflict, and checkout assertions. They verify no registration, bill, or payment intent before final confirmation. The expired-hold test now requires a draft patch that preserves saved answers and Team selection.

The schema guard found a stale embedded Prisma schema for TeamInviteEventSyncs.registrationId. Regeneration corrected it. The final database, schema guard, and checkout recheck passed all 20 tests. The payment and Team-panel recheck passed all 16 tests. The Event details recheck passed all 10 tests. The three transient UI failures passed focused rechecks. No new site failure remains unresolved. Local comparison evidence is .scratch/issue-151-site-comparison.json. The full suite retains unrelated baseline failures and is not green.

The final type check passed with a 4 GB Node heap. The earlier 2 GB attempt exhausted its heap. All 17 new site failures have matched passing recheck evidence in .scratch/issue-151-resolved-failures.json.
