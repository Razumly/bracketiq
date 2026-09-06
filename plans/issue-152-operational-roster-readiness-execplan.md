# Show complete operational rosters and document readiness

This plan follows PLANS.md. Keep its living sections current.

## Purpose / Big Picture


Event Hosts and assigned match officials must see each relevant Player and missing document signatures. A Player can be unaccepted or have no Account. Document completion must come from valid shared Satisfaction evidence. The change must not add a participation gate or expose manager-only invitation data.

## Context Boundary


Use issue #152 and its comments as the specification. Use ADR-0012 and ADR-0013 for document and roster rules. Read root and application AGENTS files, CODING_STANDARDS.md, and the database isolation guide. The implementation base is 550edacaa on codex/issue-146. Preserve the existing user changes in CONTEXT.md and untracked ADR-0013 and the signup specification.

Start at apps/site/src/app/api/events/[eventId]/teams/compliance/route.ts, src/lib/eventTeamCompliance.ts, src/server/documentEvidence.ts, and the match roster route and teamCheckIns module. Follow their exact site and mobile callers. Expand to signing, import, claim, or merge only to prove an acceptance criterion. Issue #148 remains open for native iOS verification; its recorded Windows, HTTP, Room, guardian, and browser checks pass. Its implementation is present on this branch. Do not report native iOS execution as complete.

## Progress


- [x] Read issue #152 and the open blocker record. Claim #152 and set In progress.
- [x] Find the existing compliance reader and identify its individual-registration filter and manager-only authorization.
- [x] Add complete roster reads and assigned-official authorization with backend filtering.
- [ ] Verify exact document Subject, Version, signer, validity, and scope rules through application reads.
- [x] Update site and mobile operational views. Keep durable remote state in Room.
- [ ] Run database and real mobile-to-site checks. Verify browser and native UI behavior.
- [ ] Run type checks, complete affected suites, and Standards and Spec reviews. Commit verified work and close #152 only when all acceptance criteria pass.

## Context and Orientation


An Event Team is one Event's roster snapshot. Its playerIds, pending array, and Player registration rows describe roster placement. Accepted Team Membership is a separate access decision. The current teams/compliance route uses playerIds and then removes anyone without an individual Event registration. That hides valid roster entries. Its billing and answer data remains Host-only. Assigned officials use the match roster endpoint.

Document Requirement Satisfaction records identify a Document Subject, immutable Template Version, scope, and completed signer roles. Existing import and signing paths create that evidence. Reuse those paths. Do not add a manual completion switch. The existing site and mobile compliance summaries already carry each Player's document counts and requirements.

## Plan of Work


First add a failing HTTP regression for an unaccepted roster Player without an individual registration. Include the Player and missing signatures after the fix. Then add scoped official access and prove that unrelated officials, ordinary members, and public viewers cannot read private roster identities. Keep invitation history outside operational responses.

Next inspect the existing Satisfaction reader and imports. Require the exact Subject, Version, permitted scope, and valid completed evidence. Add behavioral checks for wrong scope, sibling evidence, missing signer roles, void evidence, and profile continuity. Keep batch reads throughout.

Finally connect both operational views to the authorized reader. Reuse existing Room compliance persistence where possible. Document every changed query or response field before modifying mobile callers. Prove the live HTTP contract using a mobile-produced request, then check desktop and phone layouts and native state.

## Concrete Steps


Run site commands from apps/site. Use node node_modules/jest/bin/jest.js --runInBand --runTestsByPath with focused route tests. Run node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit. Use only database bracketiq_e2e_152_codex for new persistence tests. Apply npm run migrate:deploy and run npx prisma migrate status before seeding or testing.

Run Gradle from apps/mobile with JDK 17 and the Windows Android SDK. Use one worker. Run focused tests first, then the complete affected suite once. Do not run concurrent Gradle or Jest processes in this checkout. The requested issue 152 server on port 3152 and PostgreSQL runtime changes await user approval. Read-only runtime inspection and implementation can continue meanwhile.

## Validation and Acceptance


Use the shared HTTP boundary specified by #152 for test-first behavior checks. Verify Host and assigned-official reads for accepted, unaccepted, Managed, and guardian-managed Players. Verify missing and valid document evidence, each existing completion path, wrong Subject, signer, Version and scope, expired invitations, decline, and claim/merge continuity. Show that no new check-in or registration restriction appears. Use actual database state and authorized reads, not SQL text alone.

Compare full-suite failures with the saved issue 151 report. That report has 46 pre-existing site failures after focused rechecks resolve 17 new failures. The mobile baseline retains one TeamDetailsDialogUiTest label failure. Do not call a new failure baseline without matching evidence.

## Idempotence and Recovery


Reads must not create memberships, invitations, or document completion. Related writes remain atomic in their existing commands. Use unique fixture IDs and the dedicated issue database. Preserve all earlier test databases and production runtimes.

## Interfaces and Dependencies


The site owns the HTTP contract. Prefer compatible additions to existing compliance responses and optional query parameters. Record exact changes here when selected. Existing mobile compliance caches use Room; preserve Account and Event scope and avoid rendering one-off network results.

## Surprises & Discoveries


The Event compliance reader already uses shared Satisfaction, but still accepts Team Membership scope for Event requirements. The requirement permits Organization-wide or Event Participation scope. Verify this boundary before changing it.

## Decision Log


Continue on the current branch because the user requested the next slice in this workstream and the implement workflow requires current-branch commits. Keep #148's native iOS validation limitation separate from the implemented guardian prerequisites. Date: 2026-09-06. Author: Codex.

## Outcomes & Retrospective


Implementation and verification are in progress. Do not close the issue before the live checks pass.

Initial revision: Record the scope, observed gaps, test boundary, baseline, and runtime approval request.

## Implementation record — 2026-09-06

The Host compliance read includes pending Players and does not require an individual registration. It restricts evidence to Organization or Event Participation scope. The shared reader resolves stored Subject IDs and confirmed profile merge history. It requires complete signer roles, active source evidence, and a non-invalidated Satisfaction. Unknown or sentinel birth dates show possible missing requirements instead of an empty guardian requirement list.

The match roster GET reads both Teams in batches. Host access includes both Teams. Official access requires assignment to this match. Team managers and coaches see their own Team. Other viewers receive 403. The response has no invitation or billing fields. Missing referenced Teams, profiles, or Templates return a data error. The reader does not change registration or check-in policy.

HTTP changes are compatible additions to GET /api/events/{eventId}/matches/{matchId}/roster. Each roster adds optional canEdit and teamName. Each entry adds nullable documentReadiness with isMinorAtEvent, documents.signedCount, documents.requiredCount, and requiredDocuments. Each requirement uses the existing key, templateId, title, type, signerContext, signerLabel, signOnce, status, signedDocumentRecordId, and signedAt fields. Existing fields and POST request shapes stay compatible. Clients refresh GET after a mutation. The optional mobile DTO fields accept old responses. No required wire field changed.

Mobile stores the complete response in match_roster_cache, keyed by accountId, eventId, and matchId. Components observe Room. Access denial removes cached private data. Session cleanup clears this cache. Room schema 111 is generated through KSP and copyRoomSchemas; the documented roomGenerateSchema task is absent in this project.

Focused backend verification passes 23 tests. The tests cover assigned official and Host-compatible responses, pending Players, wrong Subject, Version, scope and signer roles, void evidence, confirmed merges, sentinel birth dates, and incomplete database references. Additional site UI, document import, Room, live HTTP, full-suite, and browser checks are in progress.

The Standards review found missing-reference handling, query chunking, and a dialog response race. The Spec review found the sentinel birth-date defect. Fixes and regressions were added. Request a final review after verification.

The issue #152 test-server request remains pending. Do not start port 3152 or change adjacent runtimes before the user answers. The fixture script is restricted to bracketiq_e2e_152_codex. Its satisfy action provisions projection test evidence; existing signing and import route tests separately verify allowed evidence creation paths. It does not prove an external signing provider flow.

Verification update: The focused Room persistence test passes. The full mobile suite ran 1,636 tests: 1,619 passed, one known TeamDetailsDialogUiTest label failure, and 16 skipped. The new live contract test is one of the skipped tests because MVP_TEST_BACKEND_URL is not set. Room schema comparison shows only the new match_roster_cache table. The final site type check passes. The full site suite is still running. Lint was restarted with --ignore-pattern '.next*/**' because an old test server's generated build directory was included by the default command. No server runtime was changed.

Both review axes cleared their confirmed findings. A further merge regression covers a current primary Profile while a protected history entry still references the source Profile. The readiness reader now keeps the complete confirmed merge graph for each Player.

Compatibility note: Existing signing writers create evidence with deterministic Subject IDs even when a merge retained an older stored Subject ID. The roster reader accepts that existing identity only when no stored Subject owns it. Stored ownership has priority. Confirmed merge links are read in both directions so protected source-profile history keeps its evidence. New regressions cover this compatibility boundary and reject evidence owned by another stored Subject.

Final review update: The final roster and dialog checks pass all 28 tests. The Spec reviewer cleared the off-roster Subject ownership fix. The changed-file lint check reports no errors and 10 warnings. The complete lint run has one error in the unchanged TeamInvitationManager.tsx file.

The existing import validator required an individual registration even for a rostered Player. The shared validator now accepts playerIds or pending placement on a currently eligible registered Event Team when no individual registration exists. Existing individual registrations retain membership validation. The same validator runs before storage and inside the transaction. Organization customer reads also include pending Players. All 45 import tests pass. The Spec reviewer cleared this fix. Staff authority, attestation, terminal registration, and removed membership tests still pass.

Closure remains pending. The full site suite is still running in session 6151 (log apps/site/test-results/issue-152-full.log). The live mobile-to-site and browser checks require the unanswered issue 152 test runtime request. Do not close issue 152 or claim those checks passed. The site type check passed before the import fix; the import follow-up type check is recorded in issue-152-typecheck-import.log.