# Retain invitation evidence for open reports

This plan follows `PLANS.md`. Keep its progress and decisions current.

## Purpose / Big Picture

Closed invitation history must disappear after 90 days from the final outcome. An open abuse report must keep only the evidence needed for review. Account deletion and unblock must not remove that evidence. Cleanup must leave Player identity, roster placement, and accepted membership intact.

## Context Boundary

Use issue 150 and its comments, root and application AGENTS files, the issue workflow, database isolation rules, and the invitation sections of CONTEXT.md and ADR-0013. Use `apps/site/src/server/inviteListing.ts`, moderation routes and service, Account deletion, Team invitation commands and views, and their tests. Read the site and mobile history callers because cleanup changes their observed results. Read other routes only when they delete invitations or expose retained evidence. The issue confirms tests at the shared HTTP API, existing cleanup boundary with a controlled clock, and Room. No new test seam needs approval.

## Progress

- [x] (2026-09-05 22:33Z) Read the issue and comments. Claim issue 150.
- [x] (2026-09-05 22:33Z) Implement routine retention and minimal report evidence.
- [x] (2026-09-05 22:33Z) Integrate reports, review, closure, Account deletion, and unblock.
- [x] (2026-09-05 22:33Z) Verify site and mobile history after erasure with PostgreSQL and Room.
- [x] (2026-09-05 22:33Z) Commit the initial implementation as `14f2d5bc1`.
- [x] (2026-09-05 22:33Z) Complete independent Standards and Spec reviews. Implement their fixes.
- [x] (2026-09-05 22:33Z) Merge current clean local main as `2f8ea55b6`. Pass typechecking and 101 focused tests.
- [x] (2026-09-05 22:43Z) Pass all 14 database tests, the live mobile-to-site test, three Room tests, and final typechecking after review fixes.
- [x] (2026-09-05 23:05Z) Finish the full site suite. Compare its failures with the prior report. Pass all 17 focused regression checks after fixture updates.
- [x] (2026-09-05 23:05Z) Commit the reviewed production fixes as `abae20dad`. Record the final verification and test fixture updates in the completion commit.

## Context and Orientation

The implementation base is `b05876333`. The current isolated branch already contains issue 149. Its GitHub issue remains open for validation. The user explicitly requested this next slice on that code. Continue implementation without treating that administrative state as missing code. Do not close either issue before its checks pass. Preserve the user's existing CONTEXT.md edits, untracked ADR and specification, scratch files, and prior test artifacts.

`Invites.finalizedAt` stores the final outcome time. Issue 149 protects final outcomes in PostgreSQL. `InviteDeliveries` stores delivery attempts. `inviteListing.ts` owns bounded cleanup. `ModerationReport` has admin review status. Unblock deletes BLOCK_USER reports. The Account deletion route deletes sender invitations. Site and mobile share `/api/invites`; mobile replaces fetched history in Room.

## Decision Log

Use separate minimal evidence snapshots linked to dedicated TEAM_INVITATION moderation reports. Keep only attempt identity, participants, Team, delivery events, outcomes, and times. Do not copy contact addresses, birthdates, claim tokens, or unrelated profile data. Routine invitation erasure can then proceed while authorized review keeps the snapshot. Keep report holds independent from BLOCK_USER reports. Closing one report cannot release another report's hold. This avoids exposing held records through routine history.

Keep the existing HTTP shape compatible. Add TEAM_INVITATION as an accepted moderation report target. Existing decline-and-block requests create the dedicated report in the same transaction. Add an authorized admin evidence read. Both clients keep their existing history model and Room schema unless implementation proves a required field change.

## Surprises & Discoveries

The cleanup outcome list omits CANCELLED and EXPIRED and treats FAILED as terminal, while Team delivery failure remains pending. Listing currently reads before cleanup. Account deletion attempts to overwrite terminal received outcomes. Existing retention tests check SQL structure rather than stored behavior.

## Plan of Work

First exercise the cleanup boundary with an issue database and controlled time. Add minimal evidence and report links in Prisma and a migration. Capture evidence during an authorized report. Keep final times stable as pending reports reach an outcome. Update cleanup to remove closed history and eligible evidence with bounded operations. Integrate safe Account deletion. Add reviewer evidence access to the existing admin interface. Verify client refresh removes erased history and preserves current-attempt semantics.

## Concrete Steps

Run site commands from `apps/site`: `npm run prisma:generate`, `npx tsc --noEmit`, and focused `npx jest --runInBand --runTestsByPath <path>` commands. Use database `bracketiq_e2e_150_codex`. Run `npm run migrate:deploy` and `npx prisma migrate status` before database tests. The database and site runtime need explicit current user authorization before startup. Run mobile checks from `apps/mobile` with JDK 17. Run full affected suites once after focused checks pass. Review against base `b05876333`. Stage only this issue's files and commit on the current branch as required by the implement skill.

## Validation and Acceptance

Prove cutoff behavior immediately before and after 90 days. Prove pending protection without starving eligible records. Read held evidence as an authorized reviewer. Deny other viewers. Prove multiple reports, report closure, sender deletion, unblock, and reinvitation. Prove cleanup does not change profiles, rosters, or accepted access. Run a mobile-produced request against the site and inspect Room after history refresh. Use real database outcomes; SQL text alone is not evidence.

## Idempotence and Recovery

Keep all test writes in the named issue database. Do not change production. Use transactions for reports, related evidence, and deletion. Duplicate report requests must not create duplicate open reports for the same reporter and attempt. Do not remove the issue database until integration. Runtime changes remain subject to explicit authorization.

## Interfaces and Dependencies

Use Prisma and existing authentication, moderation, and Team authority services. The site owns the request and response contract. Preserve existing invitation fields. New report target and admin evidence fields are additive. Keep evidence persistence separate from Room, which stores only ordinary invitation results.

## Artifacts and Notes

The user approved the issue 150 test runtimes. Initial checks used `bracketiq_e2e_150_codex` in existing `mvp-site-db` on port 5433. All 230 migrations applied. The interruption ended the test processes and Docker. Recovery uses a separate PostgreSQL 16 instance in Ubuntu, with the same database name and port. Its files are under `/home/camka/.cache/bracketiq-issue150`. The new UTC migration brings the count to 231. All 231 migrations applied. Migration status reports that the database is current. No production runtime changed.

The first cutoff test failed with HTTP 200 at the 90-day boundary, then passed with HTTP 404. Eight PostgreSQL behavioral tests passed before review. The live mobile-to-site retention test and three Room tests passed. Account deletion mocks were updated, and all nine existing route tests passed. After merge resolution, typechecking and 101 focused tests passed. The old SQL-text retention tests were removed. The database tests cover their intended behavior. The final 14 database tests pass. They include bounded expiry, concurrent delivery capture, and selected-target expiry outside the batch for both creation routes, reinvitation, and request replay. The live mobile-to-site test and three Room tests pass again against the recovered server. Final typechecking passes.

HTTP inventory: `/api/invites` and `/api/invites/[id]` keep their request and response shape. Their results omit closed attempts at the retention cutoff. `isCurrentAttempt` now uses a stored supersession marker so deletion cannot promote an old attempt. Prisma adds optional `supersededAt`; raw invitation action records may include that additive field. Existing site mapping and mobile JSON parsers accept extra fields. No field becomes required and no Room field changes. `/api/invites/[id]/decline` keeps its existing block payload and response. A block now also creates an independent invitation report in the same transaction.

`POST /api/moderation/reports` adds the optional target choice TEAM_INVITATION under the existing `targetType` field. `targetId` identifies one attempt. Existing optional `category` and `notes` fields remain valid. This branch ignores caller metadata and captures evidence on the server. Existing response fields `report`, `hiddenEventIds`, and `removedChatIds` remain. No existing mobile report serializer needs a new required field. The native invitation decline-and-block serializer is exercised against the site.

`GET /api/admin/moderation/[id]/evidence` is new and uses existing Razumly admin authorization. It returns `evidence`, which is null after cleanup. Otherwise it contains `reportId`, `inviteId`, `capturedAt`, `attemptCreatedAt`, `senderId`, `playerId`, `teamId`, `status`, `finalizedAt`, `sentAt`, `actedBy`, `actingGuardianId`, `declineBlockScope`, `deliveries`, and current display names `teamName`, `senderName`, `playerName`, `actingGuardianName`. Delivery records contain only `id`, `kind`, `requestedBy`, `status`, `createdAt`, `sentAt`, `completedAt`, and `failureCode`. The admin PATCH contract is unchanged; reopening a report after evidence erasure returns 409. The admin interface refreshes evidence when report status changes.

## Outcomes & Retrospective

The issue 150 implementation is complete. Its focused acceptance checks pass. The complete suites still contain pre-existing failures, as recorded below. The user approved the test runtimes. Initial database and live mobile checks passed. The post-merge full mobile suite ran 1629 tests: 1614 passed, one failed, and 14 were skipped. Its remaining failure is the existing TeamDetailsDialogUiTest pending-player label check. The original full site run was interrupted before it produced a final report. The replacement full run completed in 1211 seconds. It ran 6028 tests: 5869 passed, 59 failed, and 100 were skipped. Of the 59 failures, 45 also failed in `issue-149-full.json`. The other 14 exposed old query assertions, missing mock operations, stale expiry dates, and an old exact response assertion. These test fixtures are corrected. All 17 focused regression checks pass after the corrections. Both independent reviewers have no remaining findings after the fixes.

Initial revision: record scope, existing behavior, test boundaries, and the evidence snapshot design.

Review revision: share terminal-status and Team-type lists between visibility and cleanup. Move the admin evidence HTTP call into a client service. Bound pending expiry to 100 records in a stable order. Hide unprocessed expired attempts from pending results. Lock the invitation before all delivery writes so report capture cannot miss a concurrent result. Preserve explicit UTC offsets in delivery snapshots.

Merge resolution: keep both public bracket helper imports and the Node test environment. Keep the runner UID and gateway fields required by the current cutover contract. Keep the Windows-safe path expression in the logo test. Remove the static CI configuration test, as current main intentionally removed it. The three retained conflict suites pass.

Final target-expiry revision: resolve the selected attempt before reuse, reinvitation, and request replay. Compute roster expiry labels from the deadline even when the attempt is outside the background batch. Four database cases use a target after 300 earlier expired recipients. All four pass.

Final verification artifacts: `apps/site/test-results/issue-150-full-final.json` records the full site run. `apps/site/test-results/issue-150-final-regressions.log` records the 17 passing follow-up checks. `apps/site/test-results/issue-150-database-final.log` records all 14 passing PostgreSQL tests. `.scratch/issue-150-mobile-final.log` records the passing live mobile and Room checks. `.scratch/issue-150-mobile-after-merge.log` records the full mobile run. The remaining mobile UI test and component have no diff from base `b05876333`.

The runtime interruption required a fresh issue database in Ubuntu. All 231 migrations applied there. The test server uses port 3150 with outbound providers disabled. The final test-only corrections do not change production behavior or the HTTP contract. Public privacy wording and full Event signup rollout remain under the final integration gate.
