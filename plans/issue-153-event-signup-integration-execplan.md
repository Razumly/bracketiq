# Verify Event signup and prepare cutover

This living ExecPlan follows `PLANS.md`. Keep progress and evidence current.

## Purpose

Prove the complete Event signup flow across the site and Android emulator. A manager can create a Team, add Players, resume on another client, and explicitly confirm registration. Verify identity, guardian authority, invitation outcomes, privacy, document readiness, and retention before release.

## Context Boundary

Read issue #153 and its comments. Issue #145 supplies the required 67 User Stories and 28 behavioral checks. Read ADR-0013 and ADR-0012 for identity and document rules. Inspect the earlier slice tests and completion evidence to map coverage. Expand into implementation files only when a mapped check lacks evidence or fails. Read root, site, and mobile AGENTS.md, the workstream runbook, and database isolation rules. The user requested the implement skill, emulator testing, and a production browser build.

## Progress

- [x] (2026-09-06) Read #153 and parent requirements. Claim #153 and set In progress. Direct blockers #150, #151, and #152 are closed.
- [x] (2026-09-06) Map all 67 User Stories and 28 behavioral checks to candidate evidence. Record remaining integrated proof in `docs/event-signup-integration-evidence.md`.
- [x] (2026-09-06) Prepare isolated PostgreSQL database `bracketiq_e2e_153_codex`. Apply all 234 migrations. Build the initial production site and serve it on port 3153. Boot the Pixel phone emulator.
- [x] (2026-09-06) Merge local main at `c4036b05ea0270209fc066d78ef597a399b805de` without conflicts.
- [x] (2026-09-06) Save a Team and no-email Player in the production desktop browser. Reach explicit registration review at desktop and narrow widths. Preserve the unfinished draft for native resume.
- [x] (2026-09-06) Add conversion regressions for identity preservation, Event scope, retry, stale email-only attempts, independent registration preservation, and complete batch rollback.
- [x] (2026-09-06) Build and install Android. Resume the site draft through native Discover. Confirm registration in Android. Verify the completed registration in the site browser.
- [x] (2026-09-06) Build the metadata and nullable-field fixes. Install the APK. Verify Indoor Volleyball, Teams of 8, and 1/16 registered Teams.
- [x] (2026-09-06) Rehearse existing-data conversion. Pass all four live mobile-to-site suites, including operational signing, imported evidence, merge, and Room refresh.
- [x] (2026-09-06) Complete new and returning manager journeys. Verify resume in both directions and explicit final confirmation.
- [x] (2026-09-06) Complete narrow first-guardian and desktop returning-guardian acceptance. Verify separate child identity and reuse of the active relationship.
- [x] (2026-09-06) Complete native claim acceptance, returning guardian acceptance, decline, both block scopes, chat-leave selection, and both unblock paths. Verify full-row control selection in the installed APK.
- [x] (2026-09-06) Build the final label, normalization, and refresh-race fixes. Verify the guardian label and accepted rows in the emulator.
- [x] (2026-09-06) Fix observed gaps with regression tests at the approved boundaries.
- [x] (2026-09-06) Synchronize local main, run full suites, and complete code/spec review.
- [x] (2026-09-06) Prepare the verified changes, evidence record, and cutover checklist for the completion commit. Report completion through #153 only.

## Context and Orientation

The current branch is `codex/issue-146`. The issue base is `6c2ca158ed916c76888e40a9d89a0f9bb6364417`. It contains slices #146 through #152. The backend lives in `apps/site`. Mobile consumes its HTTP API and stores fetched data in Room. Existing fixtures under `apps/site/scripts/test-*-fixtures.ts` and database tests are locked to earlier issue databases. Extend their local isolation checks for #153 before reuse. Preserve unrelated user changes in CONTEXT.md and untracked domain documents.

## Plan of Work

First map each parent requirement to a test and supported entry point. Reuse earlier tests without replacing their assertions. Build the real site with production optimization and serve it locally. Install the Android debug application with its API directed to port 3153. Use real browser and emulator interactions for new and returning managers, identity and guardian flows, and cross-client resume. Use application HTTP reads for persisted outcomes. Add integration coverage where separate slice tests do not prove the complete behavior.

Rehearse migrations on dedicated test data. Verify rollback and competing commands with PostgreSQL. Verify cleanup through the existing controlled-clock boundary. Audit supported entry points for destructive invitation handling and incorrect membership assumptions. Fix only behavior that conflicts with this feature.

Finally synchronize the current local main branch, run the complete affected suites, and conduct Standards and Spec reviews. Record actual failures and their evidence. Prepare a cutover checklist with migration order, client compatibility, privacy wording, and verification gates. Deployment remains a separate operation.

## Concrete Steps

Run site commands from `apps/site`. Set DATABASE_URL to local PostgreSQL port 5433 and database `bracketiq_e2e_153_codex`. Run `npm run migrate:deploy`, `npx prisma migrate status`, and `npm run prisma:check`. Set `MVP_NEXT_DIST_DIR=.next-issue153` and `MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1`. Run `npm run build`. Start `node server.mjs --port 3153` with NODE_ENV production for the requested local browser tests.

Run Gradle from `apps/mobile` with JDK 17 and the installed Android SDK. Build `:composeApp:assembleDebug`. Install the APK on `Pixel_9_Pro_XL_API_35`. Use adb UI trees to select controls. Capture screenshots and inspect them. The Browser plugin is not available; use regular Playwright with installed Chrome for desktop and narrow browser tests.

## Validation and Acceptance

Maintain a requirement mapping with evidence for every User Story and behavioral check. A passed slice test alone does not prove the complete cross-platform journey. Complete new and returning manager registration in the actual rendered clients. Show that closing and resuming preserves saved state without duplicate delivery. Verify denied reads and mutations through the HTTP API. Run focused tests during fixes and the full site and mobile suites once after integration. Do not claim native iOS validation from Android or JVM tests.

## Idempotence and Recovery

Use only the issue database for fixture writes. Use unique fixture IDs and retain database guards. Do not stop or change adjacent runtimes. Keep build outputs separate. Preserve unrelated working tree changes. Do not publish a production image or deploy production.

## Interfaces and Dependencies

The site remains the HTTP contract owner. No contract change is planned. If a test exposes a contract defect, list changed fields and update each mobile caller with a compatible parser. Preserve ADR-0013 identity separation and ADR-0012 immutable document evidence. Use existing signing and imported-evidence boundaries.

## Surprises & Discoveries

Integrated checks found four gaps: forwarded Player links could use the generic claim path; partial Event refresh could discard cached metadata; invitation refresh could discard retained outcomes; membership normalization could discard invitation labels. Each fix has a regression test. The Android emulator also exposed small roster and control defects. Local main was merged without conflicts.

## Decision Log

The user explicitly requested emulator tests and a production browser build. Use a local production server, not a production deployment. The parent specification already approves the test boundaries required by the TDD skill. No new test-boundary approval is needed.

## Outcomes & Retrospective

The final production build and explicit TypeScript check passed. The affected site run passed 170/170 tests. The full site run passed 5,970 tests and skipped 128; its two email environment failures passed on recheck. New and returning manager journeys passed in the browser and Android. Both resume directions passed. First and returning guardian browser acceptance, native returning-guardian acceptance, profile claims, lifecycle actions, and imported document evidence passed. The final mobile run passed 1,917 tests and skipped 16 separate live-environment tests. Android lint and APK packaging passed. All four feature-specific live suites passed against the final production bundle. The final Android and browser label captures passed. Both review axes have no remaining findings. The cutover checklist records production authorization and platform limits.

## Artifacts and Notes

Store durable coverage and cutover records under docs. Keep temporary browser scripts and screenshots outside the repository. Link final evidence from the child issue. Do not edit or close parent #145 as a side effect.

Plan created on 2026-09-06 to implement the final integration slice and the user's explicit emulator and production-build requirements.
