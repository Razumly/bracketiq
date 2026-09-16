# Match Affiliate and authority behavior on mobile

This plan follows root PLANS.md. Keep its progress and evidence current.

## Purpose

An authorized organizer can edit and manage an Affiliate Event on mobile. An Affiliate Event uses External Registration but keeps its Event Type, Schedule, and Organization authority. Unclaimed Events stay read-only. Registration opens in the platform browser and records an outbound click without requiring a Tracking Pixel.

## Context Boundary

Use issue #49 and its comments, root and mobile AGENTS.md, CONTEXT.md entries for External Registration and Management Authority, and ADR-0004. The code boundary includes shared Event detail access, editor actions, registration URL opening, and Room persistence. The audit expanded this boundary into the site capability projection and editor schema. One optional HTTP response field is added: organizationOwnershipStatus. Room stores this field in the existing capability JSON. No Room schema migration is required.

## Progress

- [x] (2026-09-06) Read #49. Confirm its blockers are closed. Claim the issue and set Status to In progress.
- [x] (2026-09-06) Audit existing capabilities, registration browser opening, outbound analytics, and Room persistence.
- [x] (2026-09-06) Remove obsolete mobile editing restrictions. Add configuration preservation regressions.
- [x] (2026-09-06) Add registration-specific HTTP and HTTPS browser opening. Apply site limits for credentials and URL length.
- [x] (2026-09-06) Add authorization explanations, claim-state persistence, and restart tests.
- [x] (2026-09-06) Verify the fresh-authority gate after review found cached grants could expose controls.
- [x] (2026-09-06) Run affected complete suites, live verification, and both reviews. Complete final regressions, TypeScript, and Android lint.
- [x] (2026-09-06) Prepare the final implementation commit and issue completion record.

## Context and Orientation

The current branch is workstream/issue-42-schedule-diagnostics. The starting commit is c431195d1. EventAuthorityCapabilities binds canEdit and readOnly to the current viewer. Room stores the serialized capability result with each Event. Shared Compose code controls Android and iOS. EventEditActionHandler refreshes the editor snapshot before opening editing or schedule maintenance. MobileEventEditSupport still rejects split League/playoff and payment-plan configuration after that server check. UrlHandler currently accepts only HTTPS, while the registration input accepts HTTP too.

## Decision Log

Use the existing public editor action, shared UI interaction, URL opener policy, and Room repository test boundaries from this workstream. Preserve payment and Division configuration when changing External Registration. Remove obsolete restrictions only after proving preservation. Keep document, signing, payment, and app-update URL policies unchanged; registration has its own browser-opening context. Do not add Tracking Pixels or purchase attribution.

## Plan of Work

First add an editor-action regression for an authorized Event with payment plans and playoff Divisions. Confirm the old guard rejects it. Remove the guard and retain canonical values through the existing mapper. Replace old guard tests with authorization behavior at the shared presentation boundary.

Next compare site registration URL acceptance with mobile validation and platform opening. Use a registration-specific policy where required. Keep the existing outbound event capture. Show the server's authentication, unverified authority, and authorization reasons in both editor variants and rejected edit actions.

Finally reopen a file-backed Room database after fetching an unclaimed Event. Prove read-only state, provenance, destination, and Organization claim data survive. Exercise current server capability results for allowed and denied actions, including a revoked result after refresh. Run the complete affected mobile suites and lint in sequence. Run a client-to-site check if a contract or caller changes. Obtain explicit authorization before starting or reconfiguring a runtime for the isolated issue database.

## Concrete Steps

Run Gradle from apps/mobile with .\gradlew.bat :composeApp:testDebugUnitTest and focused --tests filters during each change. Run :core:repository-impl:testDebugUnitTest for Room and URL policy tests. Use --console=plain --offline --max-workers=1. At completion run the complete affected module suites and :composeApp:lintDebug. Store disposable reports outside tracked source paths. If site fixtures change, run TypeScript and the relevant site tests from apps/site.

## Validation and Acceptance

An authorized Event with preserved advanced configuration opens for editing. Server-denied Events do not expose management actions. An External Registration change alters only the destination and related registration applicability. Supported URLs open through Android Custom Tabs or iOS system opening. Outbound clicks remain recorded. A restarted Room database retains the unclaimed read-only state. Refresh replaces stale capabilities before edit or schedule operations. Shared tests cover Android and iOS logic; report any native iOS execution limit explicitly.

## Idempotence and Recovery

Preserve existing reports and session files. Never print session tokens. Use bracketiq_e2e_49_samue for any live fixture. Keep runtime changes within current explicit authorization. Do not push or deploy. Commit task source, tests, and this plan only.

## Interfaces and Dependencies

apps/site owns the HTTP contract. The added capability response field is capabilities.organizationOwnershipStatus, an optional nullable string. Event detail and Event editor snapshots use the shared server capability projection. The editor save snapshot uses the same schema. Mobile EventAuthorityCapabilities and EventEditorCapabilitiesDto decode it. EventEditorCapabilitiesDto.toDomain maps it into the Room capability JSON. Existing detail and editor repository callers retain it through their existing persistence paths. The web UI does not consume the added claim field, so its permission normalizer needs no change. Contract version 5 remains compatible because the field is optional. Missing values decode as null.

The public Event response now also returns the existing nullable sourceType field. It permits AFFILIATE_IMPORT, ORGANIZATION_CREATED, and USER_CREATED. Other values return null. GET /api/events/:eventId/detail reuses this Event projection. EventApiDto and Room already support sourceType, so no new mobile field is required. sourceId stays private. sourceUrl stays absent or null. The signed outbound URL stays intact. No request field or API path changes. Both response changes are additive and compatible. The live mobile repository test must verify claimed and unclaimed projections before completion.

EventAuthoritySession holds transient verification for the current Event and viewer. It uses the existing getEvent API refresh after that repository writes to Room. Management controls require this verification and the current Room capability result. A delayed, failed, or superseded request cannot unlock cached permissions. Templates start read-only and use the fresh editor snapshot before editing. Generic HTTPS policies remain unchanged for unrelated flows.

## Surprises & Discoveries

The first editor regression failed at the obsolete payment-plan guard. After guard removal, it found that a destination-only edit reapplied sport defaults. The edit action now preserves all other Event fields for this change. The claim-state server regression failed before the new optional response field was added. The three focused site suites then passed all 76 tests. TypeScript passed.

Review found that initial management controls used cached grants before API refresh. Review also found missing credential and length constraints in registration URL validation. Both findings have code changes and new regressions pending verification. The Standards review requires this contract record and live API evidence.

The user approved the local site on port 3109 and the isolated bracketiq_e2e_49_samue database on port 5543. All 224 migrations applied. The fixture contains five claimed Event Types and one unclaimed imported Event. The existing site on port 3108 remains separate. The test launcher uses a separate Next.js build directory.

Local main added complete-file complexity checks during this task. Merge 6cfca22b8 integrates that policy without conflicts. The authorization module now separates staff lookup, role permission checks, and capability projection. The focused source lint passes. These extractions retain the authorization rules. Generated Next.js output is excluded locally from Git. The disposable launcher is stored under the system temporary directory. Neither artifact is task source.

The second Spec review found cached host actions and active or pending Event Editor sessions outside the gate. Host actions now require fresh authority. Authority loss closes editing and invalidates pending request generations. Editor and Schedule responses validate the current viewer. The final Spec review has no remaining findings. Focused mobile tests passed the authority cases. One playoff fixture needed explicit capacity and playoff counts. The complete affected suites now run with that valid fixture and the live API environment.

The live matrix passed destination saves for all five Event Types, then found that the public unclaimed projection omitted sourceType. The fix exposes only its safe classification. Raw source identifiers and URLs remain private. The file-backed restart test hit the Windows path limit; its method and database names are now shorter. The full Compose suite found three older component fixtures without viewer-bound capability results. Those fixtures now model the current API and its Room write before emission. The focused server suites passed all 76 tests after the authorization helper extraction.

## Outcomes & Retrospective

The scoped implementation is complete. Mobile uses fresh server authority before it exposes management controls. External Registration changes preserve Event and Schedule state. Room retains claim state and safe provenance. Registration links use the platform browser. Outbound click tracking remains available. Tracking Pixels remain deferred.

The complete affected mobile run selected 1,914 tests. The network suite had no failures. The repository and Compose suites each had three failures. Fourteen conditional tests were skipped. Android lint passed. Follow-up runs resolved all six failures: public provenance, Windows database path length, an empty URL authority, and three component fixtures or refresh behaviors. The rerun also included the complete model suite.

The Event route needed helper extraction to satisfy the new complete-file complexity rule. The Standards review found no unintended behavior changes in response values, query order, authorization, or billing cleanup. Public sourceType is the only intentional Event projection change.

The follow-up run passed all 44 model tests. It passed 33 repository tests, including the live five-Event-Type API matrix, the unclaimed API projection, the file-backed Room restart, and URL validation. One unrelated live rental test was skipped because its separate fixture was not enabled. The changed-file complexity check passed. TypeScript passed.

The Compose rerun passed 20 of 21 tests. Its remaining call-count failure found duplicate management loads: the fresh-authority observer could start a bootstrap during initial hydration. The observer now waits for hydration, then checks the current target and fresh permission. Successful hydration marks the management target as loaded. Failed participant hydration permits a retry. Delayed-grant and failure regressions cover both paths. Both follow-up reviews have no findings. All 34 final mobile tests passed. Final TypeScript and Android lint passed. The final Gradle run completed in 4 minutes 29 seconds.

The full site run completed in 2,573 seconds: 899 suites passed, 30 failed, and 7 were skipped. It passed 6,116 tests, failed 55, and skipped 62. All 137 tests in the eight directly affected suites passed: access control, editor snapshot, editor save, Event deletion, split-Division scheduling, template privacy, outbound links, and Event detail bootstrap.

The broad run remains red outside those suites. Ten Playwright files were incorrectly discovered by Jest on Windows and failed during import. Other failures involve Unix sockets, file modes, symlinks, POSIX paths, shell commands, and newline-sensitive deployment or migration checks. The complexity-policy harness had two child-process timeouts; the actual changed-file lint passed. The family join-request fixture lacks the transaction client's $executeRaw method and failed two assertions. These failing files are unchanged by #49. Local full reports are apps/site/test-results/issue-49-full-site.txt and issue-49-full-site.json. They are disposable evidence, not committed source.

Native iOS execution is unavailable on this Windows host. Android and iOS share the tested capability fixtures and Compose logic. The platform browser adapters use their existing browser-opening implementations after shared registration URL validation.

Plan created on 2026-09-06 for the remaining #49 work.
