# Retain invitation evidence for open reports

This plan follows `PLANS.md`. Keep its progress and decisions current.

## Purpose / Big Picture

Closed invitation history must disappear after 90 days from the final outcome. An open abuse report must keep only the evidence needed for review. Account deletion and unblock must not remove that evidence. Cleanup must leave Player identity, roster placement, and accepted membership intact.

## Context Boundary

Use issue 150 and its comments, root and application AGENTS files, the issue workflow, database isolation rules, and the invitation sections of CONTEXT.md and ADR-0013. Use `apps/site/src/server/inviteListing.ts`, moderation routes and service, Account deletion, Team invitation commands and views, and their tests. Read the site and mobile history callers because cleanup changes their observed results. Read other routes only when they delete invitations or expose retained evidence. The issue confirms tests at the shared HTTP API, existing cleanup boundary with a controlled clock, and Room. No new test seam needs approval.

## Progress

- [x] Read all issue requirements and audit current code. Claim issue 150.
- [x] Implement routine retention and minimal report evidence storage.
- [x] Integrate report creation, review, closure, Account deletion, and unblock.
- [ ] Verify site and mobile history after erasure.
- [ ] Run focused checks, database checks, full suites, and independent reviews.
- [ ] Commit issue 150 on the current branch.

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

The user approved the issue 150 test runtimes. Reuse existing `mvp-site-db` on port 5433. Create `bracketiq_e2e_150_codex`. All 230 migrations applied and migration status is current. The issue site server runs on port 3150. No production runtime changed.

The first cutoff test failed with HTTP 200 at the 90-day boundary, then passed with HTTP 404. Six initial PostgreSQL behavioral tests pass. The first typecheck passes. The focused suite had 16 passing tests and two old Account deletion mock failures. Update those mocks with an empty invitation collection, then repeat. Native compilation is in progress. The old SQL-text retention tests were removed; the database tests cover their intended behavior.

HTTP inventory: `/api/invites` and `/api/invites/[id]` keep their request and response shape. Their results omit closed attempts at the retention cutoff. `isCurrentAttempt` now uses a stored supersession marker so deletion cannot promote an old attempt. Prisma adds optional `supersededAt`; raw invitation action records may include that additive field. Existing site mapping and mobile JSON parsers accept extra fields. No field becomes required and no Room field changes. `/api/invites/[id]/decline` keeps its existing block payload and response. A block now also creates an independent invitation report in the same transaction.

`POST /api/moderation/reports` adds the optional target choice TEAM_INVITATION under the existing `targetType` field. `targetId` identifies one attempt. Existing optional `category` and `notes` fields remain valid. This branch ignores caller metadata and captures evidence on the server. Existing response fields `report`, `hiddenEventIds`, and `removedChatIds` remain. No existing mobile report serializer needs a new required field. The native invitation decline-and-block serializer is exercised against the site.

`GET /api/admin/moderation/[id]/evidence` is new and uses existing Razumly admin authorization. It returns `evidence`, which is null after cleanup. Otherwise it contains `reportId`, `inviteId`, `capturedAt`, `attemptCreatedAt`, `senderId`, `playerId`, `teamId`, `status`, `finalizedAt`, `sentAt`, `actedBy`, `actingGuardianId`, `declineBlockScope`, `deliveries`, and current display names `teamName`, `senderName`, `playerName`, `actingGuardianName`. Delivery records contain only `id`, `kind`, `requestedBy`, `status`, `createdAt`, `sentAt`, `completedAt`, and `failureCode`. The admin PATCH contract is unchanged; reopening a report after evidence erasure returns 409. The admin interface refreshes evidence when report status changes.

## Outcomes & Retrospective

Implementation is in progress. Database validation and runtime authorization are not yet complete.

Initial revision: record scope, existing behavior, test boundaries, and the evidence snapshot design.
