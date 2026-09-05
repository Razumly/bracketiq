# Preserve invitation outcomes and enforce recipient blocks

This ExecPlan follows `PLANS.md`. Keep its progress, decisions, discoveries, and outcome current.

## Purpose / Big Picture

Issue 149 lets Team managers remind, cancel, and reinvite Players without changing earlier outcomes. Players and authorized guardians can decline an invitation and block its sender or Team in one save. Expiry retains roster placement without granting Team access. Site and mobile use the same HTTP behavior and labels.

## Progress

- [x] (2026-09-05) Read issue 149 and all comments. Review the existing site, backend, mobile, and persistence paths. Record the implementation base as `0d99fd1c0` on `codex/issue-146`.
- [x] (2026-09-05) Select the issue's shared HTTP API and recipient and manager client actions as the test boundaries.
- [x] (2026-09-05) Add attempt audit fields, Team Blocks, delivery receipts, request receipts, a partial pending-attempt index, and a final-outcome guard. Add command tests. Database verification remains open below.
- [x] (2026-09-05) Add atomic decline and blocking. Add shared restrictions for canonical roster saves, invitations, reminder delivery, and share-link acceptance. Route the legacy email invitation endpoint through the same command.
- [x] (2026-09-05) Add site recipient and manager actions, Team Block removal, current-attempt labels, delivery history, and share-link decline options. Add user-action tests.
- [x] (2026-09-05) Add mobile DTOs, Room state, actions, and labels. Generate schema 109. Compile the application and tests. Pass the focused Room, block dialog, and Account repository tests.
- [ ] Run migration, focused checks, client-to-site checks, and complete affected suites.
- [x] (2026-09-05) Run the standards and specification reviews. Correct the confirmed findings. Both second reviews report no remaining confirmed findings.
- [x] (2026-09-05) Commit the scoped implementation on `codex/issue-146`. Keep issue 149 in progress while database and live HTTP checks remain pending.

## Context Boundary

Use issue 149 as the requirement boundary. Its 17 acceptance criteria cover attempt identity and history, one current pending attempt, reminders, immediate reinvitation, terminal outcomes, roster-preserving expiry, atomic decline and block, active Account targets, Team Block removal, guardian scope, explicit chat leave, direct API enforcement, unblocking, stale actions, delivery failure, client parity, and behavioral checks. Retention cleanup and independent evidence holds belong to slice 5.

The minimum repository sources are the root and application `AGENTS.md` files, `apps/site/CODING_STANDARDS.md`, `docs/agents/issue-tracker.md`, `docs/agents/workstream-execution.md`, `docs/agents/workstream-database-isolation.md`, the invitation and blocking terms in `CONTEXT.md`, and ADR-0012 and ADR-0013. Read the invitation routes and their tests, `teamGuardianInvites.ts`, `teamMembership.ts`, `teamInviteEventSync.ts`, `managedPlayers.ts`, `inviteEmails.ts`, `inviteListing.ts`, `guardianAuthority.ts`, and social blocking. Read the matching site components and mobile model, DTO, repository, Room, and profile and Team UI files. Expand to callers when a shared function or HTTP field changes. Read a parent or blocker issue only if a required contract or decision remains unresolved.

## Context and Orientation

The shared API lives in `apps/site`. `Invites` currently mixes invitation outcomes with delivery failure. The main Team acceptance and decline service retains outcomes, but some cancellation paths delete invitations. Creation usually reuses pending attempts. The member-invite retry lookup can also reopen a closed attempt. Signed links expire, but current invitation readers do not expose expiry. Sender blocking exists under `api/users/social/blocked`; it has no active Account target check and invitation delivery does not enforce it.

Team roster placement uses canonical Team registrations. An invited registration reserves a slot. Accepted membership permits Team and chat access. Event roster snapshots and invitation synchronization rows have their own lifecycle. Removing a pending placement must preserve completed Event history.

Mobile code lives in `apps/mobile`. `core/model` holds the Room invitation entity. `core/network` holds request and response DTOs. `core/repository-impl` calls the shared API and writes fetched state to `core/database`. Compose screens live under `composeApp`. Keep the npm and Gradle build graphs separate.

## Plan of Work

First extend `apps/site/prisma/schema.prisma` with delivery history, Team Blocks, and action audit fields. Keep one live pending Team and Player attempt. Normalize legacy delivery failures without inventing lost history. Add shared lifecycle functions and route-level behavior tests. A closed attempt must stay closed. An expired attempt must retain roster placement and get a stable outcome time. A new allowed invitation gets a new ID. A reminder uses the existing ID and records a separate delivery.

Next extract the existing User Block transaction for reuse by the decline command. Require a live, enabled AuthUser for its target. A guardian sender block belongs to the acting guardian Account. A Team Block belongs to the named child and Team. Add block reads and authorized removal. Apply block checks before roster addition and delivery, including direct Team writes and alternate managers. Serialize outcome and block changes with the existing Team lock and suitable Account locks.

Then update site invitation inboxes, Team manager actions, and share-link entry points. Keep plain Decline. Add a scope choice for Decline and block. Keep chat leave unchecked. Add reminder, cancellation, expired state, and history reads. Display committed save state separately from failed delivery.

Finally update mobile requests, responses, repository calls, Room entities and schema version, and Compose actions. Reuse the existing real mobile-to-site test session for lifecycle checks. Run the complete affected suites once. Review the implementation against the recorded base and issue 149 before the final commit.

## Interfaces and Dependencies

Preserve existing invitation paths. Extend decline with optional `blockScope` (`sender` or `team`) and `leaveSharedChats` fields. An omitted scope remains plain Decline. Return the saved invitation, selected block state, and removed chat IDs. Expose reminder delivery through an invitation-ID route with a request idempotency key. Keep existing resend callers compatible. Add a recipient Team Block collection and authorized delete path. Add optional invitation response fields for outcome actor, final time, expiry, delivery history, current-attempt state, sender block eligibility, and manager invitation label. Record the exact final wire shape here as implementation settles. Do not require new fields from old callers under an unchanged contract.

### Final HTTP contract inventory

- `Invites` adds optional `actedBy`, `actingGuardianId`, `declineBlockScope`, `finalizedAt`, `linkExpiresAt`, `sentAt`, `canBlockSender`, `isCurrentAttempt`, `invitationLabel`, `senderName`, `actingGuardianName`, and `deliveries`. Existing fields retain their types. Each delivery has `id`, `inviteId`, `kind`, `status`, `createdAt`, and optional completion and sent times.
- `POST /api/invites/:id/decline` accepts optional `blockScope` (`sender` or `team`) and `leaveSharedChats`. Empty input remains plain Decline. It returns the saved `invite`, optional `block`, `teamBlock`, `user`, and `removedChatIds`. A failed transaction returns `saved: false`.
- `POST /api/invites/:id/remind` and `/reinvite` require `idempotencyKey`. They return the saved attempt and separate delivery state. These are new routes. Existing resend remains an adapter.
- Team member creation accepts optional `idempotencyKey` and `reinviteId`. The request receipt binds each Team, sender, and key to one payload and attempt. A retry of a terminal attempt returns that outcome.
- Team invitation DELETE now returns a retained `invite`. Recipient DELETE means decline. Manager DELETE means cancel. Collection DELETE refuses Team invitations; both clients use invitation IDs.
- `GET /api/users/team-blocks` returns authorized blocks with Player and Team names. `DELETE /api/users/team-blocks/:teamId?playerId=...` removes one authorized block only.
- Authorized Team reads add optional `invitationId` and `invitationLabel` to invited player registrations. User reads add optional `hasActiveAccount`. Mobile treats missing Account eligibility as false.
- Profile claim accepts optional `reviewGuardianInvitation`. It can establish an authorized guardian relationship and return `GUARDIAN_READY` before a separate decline action. Signed Team claim accepts optional `action: review` without accepting membership.
- Team creation uses the existing request `id` as its retry identity. `TeamCreationRequests` binds that ID to the creator and payload. Repeating the same request returns the saved Team. A changed payload returns 409. A removed Team returns 410. The HTTP request shape is unchanged.
- Mobile Room version is 109. `InvitationOperation` stores request keys before remote invitation creation. Team builder steps use the draft Team ID and stable step keys. Invitation history, delivery records, Account eligibility, and Team Blocks pass through Room. `viewerId` is local cache ownership. It is not a new required HTTP field.

## Concrete Steps

Run site commands from `apps/site`. Use local `node_modules` executables. Generate Prisma after schema edits. Run focused Jest files with `--runInBand --runTestsByPath`. Run `npx tsc --noEmit` during implementation. Use one logical database named `bracketiq_e2e_149_codex` on an authorized local Postgres runtime. Run `npm run migrate:deploy` and `npx prisma migrate status` against that database before database tests. Never print database credentials.

Run Gradle commands from `apps/mobile` with JDK 17. Increment `MVP_DATABASE_VERSION` for Room changes. Run the documented Room schema generation task and inspect its output. Run focused repository and UI tests, then the complete affected suites. Real API checks must use the isolated issue database and current backend code. Inspect existing runtimes first. Request an exact local runtime operation only when it is required and the implementation is ready to validate.

## Validation and Acceptance

Use tests at the shared HTTP boundary and client actions. Prove that decline frees the current slot and a closed Team can immediately create a distinct attempt. Prove reminders preserve attempt identity and record delivery once per request key. Prove expiry retains Team and Event rosters, denies unaccepted access, and displays Invitation expired. Prove cancellation retains history and does not change completed Event data. Test old IDs after reinvitation and competing terminal actions.

Prove sender and Team blocks have different scopes. Cover the same sender on another Team, another manager on the same Team, guardian invitations for two siblings, unclaimed and disabled targets, direct Team additions, and reminders. Verify that default blocking keeps chats and explicit chat leave removes them. Inject a related save failure and confirm authorized reads show a full rollback. Unblock must permit a later explicit action without reviving membership, resending, or erasing invitation history.

Run mobile-produced requests against the current site parser or API. Verify Room observes the returned state. Unit tests with a mocked network do not replace this check. Keep providers behind the application's email and notification boundary; do not fabricate provider interfaces.

## Idempotence and Recovery

Use additive database migrations and preserve existing identifiers. Keep terminal timestamps stable. Retrying an old creation key returns its saved result and never reopens it. Delivery retry has its own identity. Avoid automatic resend on registration resume. Do not change the user's existing uncommitted documents or artifacts. Commit only issue 149 files on the current branch, as the implement skill requires. Do not deploy or change production runtime state.

## Surprises & Discoveries

The implementation base includes issue 148 at commit `264739534`, but issue 149 still has an open native dependency. The user explicitly selected issue 149 and the current branch contains its guardian code. Continue this scope without closing unrelated issues. The current checkout also has user-owned uncommitted context, ADR, specification, and screenshot files.

The existing focused baseline passed five site suites and 18 tests during the prior inspection. These tests do not prove issue 149's new behavior.

## Decision Log

Use the current branch and record `0d99fd1c0` as the review base. The invoked implement skill requires a commit on that branch. Use the issue's explicitly named HTTP and client boundaries for TDD; no new test boundary is needed.

Keep delivery state separate from invitation outcome. This prevents a late transport failure from replacing an accepted, declined, cancelled, or expired outcome.

## Outcomes & Retrospective

Implementation is in progress. Focused creation tests pass (11 tests). The delivery tests pass, including current guardian routing. The lifecycle tests pass. The focused site action run passes eight tests. Fourteen database tests are skipped until the isolated runtime is approved. The related Team route, registration, and service run passes 62 tests; the two files with updated assertions then pass all 18 tests. The five authority suites pass all 39 tests. The site typecheck passes. The initial mobile application compile passed. Later model and cache changes require another compile.

Runtime approval is pending. Do not start Ubuntu, PostgreSQL, or the site test server before the user approves. The isolated database name is `bracketiq_e2e_149_codex`. The migration and real database and mobile-to-site tests are written but have not run. Do not mark the issue complete before these checks pass.

## Artifacts and Notes

The prior review identified deletion-based cancellation, missing Team Blocks, missing block enforcement, incomplete expiry, missing delivery history, and stale retry hazards. This plan tracks their implementation and verification.

The documented `:composeApp:roomGenerateSchema` task does not exist. Use `:core:database:kspDebugKotlinAndroid`. The Windows compiler cannot reuse incremental cache paths produced in WSL. Use `-Pkotlin.incremental=false` for these checks.

Plan created on 2026-09-05 to implement issue 149 through the approved shared API boundary.

The second review corrected two builder paths. Mobile retries now use the original draft pending IDs. They do not convert saved managed Players into new Account invitations. Site builder jobs keep delivery results for existing Accounts as well as new people. Native guardian claims now offer review and decline actions. Room applies current-attempt flags in one transaction. New Room tests cover a late response and request keys after restart.

The full site suite is still running. It has reported event schedule and organization UI failures. Those failures are not yet classified as baseline or introduced. No database or live HTTP result is claimed from this run.

The three Room persistence tests and two native block dialog tests pass. Mobile source and test compilation pass. The Account repository tests exposed three old assumptions: pending-only reads, deletion of a final invitation, and a decline without signed-in state. Those tests now check saved history and authenticated actions. Their repeat run passes all 27 tests. Together with the Room and block dialog suites, 32 focused mobile tests pass.

The full site run has not finished. It reports UI timeouts, including a Team builder test that passes in the focused repeat run. Keep the full-suite result separate from the focused passes. Keep issue 149 in progress until the migration and real mobile-to-site tests pass.

The final site typecheck passes. The implementation and focused checks are committed. The full site run remains active. Runtime approval is the remaining input needed for migration and live HTTP validation.
