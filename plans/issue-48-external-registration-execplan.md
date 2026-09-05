# Preserve Event operations with External Registration

This ExecPlan follows `PLANS.md`. Keep its progress, decisions, discoveries, and outcomes current.

## Purpose / Big Picture

An authorized organizer can use or change an external registration link without losing competition, Schedule, Resources, or staff. An Affiliate Event is any Event with External Registration. It is not an Event Type. Web and mobile keep authorized operations available. An unclaimed Event remains readable but has no unauthorized management actions. Outbound clicks remain tracked. Tracking Pixel integration, pixel verification, and purchase attribution are deferred by the user's decision on 2026-09-05.

## Progress

- [x] (2026-09-05) Read the revised issue and comments. Confirm zero open native blockers. Claim issue #48 and set In progress with Area Shared.
- [x] (2026-09-05) Audit existing web normalization, server authority, mobile DTOs, Room state, and outbound tracking.
- [x] (2026-09-05) Prove and fix preservation through the web Event Editor command. Both Simple and Advanced toggle regressions passed.
- [x] (2026-09-05) Preserve external Event configuration and provenance through server saves. Remove conflicting Affiliate Event Type handling from supported paths.
- [x] (2026-09-05) Retain server authority and provenance through mobile DTOs, Room, and shared Compose actions.
- [x] (2026-09-05) Verify mobile commands with the site parser. Verify destination changes, registration switches, offline reads, and click tracking.
- [ ] Execute the prepared mobile-to-site HTTP and database test after local runtime approval.
- [x] (2026-09-05) Run affected suites and type checks. Review Standards and Spec. Resolve code findings.
- [x] (2026-09-05) Commit the implementation on the current workstream branch. Keep the live integration gate open.
- [ ] Record completion evidence and close issue #48 when all scoped acceptance criteria pass.

## Context and Orientation

`apps/site` owns the HTTP contract. `src/contracts/eventEditor.ts` defines editor commands and results. Web input passes through `src/app/events/[id]/schedule/components/eventForm/buildEventDraft.ts` and `editorContractAdapters.ts`. `src/server/events/eventEditorSave.ts` saves a command in a transaction. `src/server/repositories/events.ts` currently clears operational values when `affiliateUrl` is present. `src/server/accessControl.ts` already projects server authority. Public responses use signed outbound links from `src/server/affiliateOutbound.ts`.

Mobile `core/network/.../dto/EventDtos.kt` hydrates the Room `Event` entity. `EventEditorDtos.kt` holds editor responses. `core/repository-impl/.../EventEditorSessionMapper.kt`, `EventDetailRemoteGateway.kt`, `EventRepository.kt`, and `EventRoomStore.kt` map and persist remote state. Shared Compose Event detail and editor code lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail`. Room is the source of rendered fetched state.

Management Authority identifies who can operate an Event. Event Provenance records how the Event entered BracketIQ. Registration destination must not change either concept. Existing imported source fields must remain independent from `affiliateUrl`.

## Context Boundary

Use revised issue #48 and its comments, root and app AGENTS instructions, the workstream and issue tracker runbooks, the database isolation runbook, the External Registration and authority glossary entries, and ADR-0004. The preceding user review already traced these exact sources. Read direct callers and tests when a changed field exposes another supported path. Read other issues only if a required contract decision remains unresolved. Do not read unrelated historical plans.

## Decision Log

The user explicitly requested issue #48 in this existing worktree after issue #44. Continue this approved workstream on `workstream/issue-42-schedule-diagnostics`. The issue base is `f7b389fa6`. Local `main` is already an ancestor, with no commits absent from this branch. Preserve the two unrelated untracked issue-45 reports. Include the user's uncommitted glossary and ADR pixel deferral in this issue.

Use the test boundaries already approved by the parent specification and issue acceptance criteria: the current Event Editor command/result, offline Room persistence, and thin visible UI actions. Use test-first slices at these boundaries. No new scheduler or pixel integration is required.

Retain current authorization requirements. A removed pixel gate does not grant management access. Preserve outbound click tracking without representing clicks as purchases.

## Plan of Work

First change the web draft regression that currently expects staff and Match rules to be stripped. Prove the failure. Remove Affiliate-only resets and visibility restrictions for operational configuration. Keep transaction controls conditional on External Registration. Verify both editor variants and the command emitted after toggling or changing a link.

Next trace the saved command through the real server. Remove operational normalization that depends on registration destination. Preserve Event identity, Event Type, source metadata, and Schedule. Validate external URLs without a pixel dependency. Reuse existing authority gates and canonical transactions. Reject obsolete Affiliate Event Type values at current command boundaries. Record any changed wire fields and compatible parser behavior here before mobile consumes them.

Then extend mobile hydration and Room storage for the server's provenance and authority state. Use the server result for external Event management actions. Keep the external registration action available on public listings. Carry fields through editor save, reload, and graph updates. Increase the Room schema version and generate its snapshot. Use the established destructive cache migration policy.

Finally send mobile-produced commands to the real site parser. Use a real HTTP client and site API for the required integration gate. Prove destination changes and switching registration preserve state. Test unclaimed and claimed authority after reload and offline Room reads. Run existing outbound click tests and affected editor, repository, and Compose suites. Run independent Standards and Spec reviews through the code-review skill before the final commit and issue completion.

## Concrete Steps

Run site commands from `apps/site`. Use `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath <affected tests>` for focused tests. Use `node node_modules/typescript/bin/tsc --noEmit --pretty false` for type checks. At the final gate run the complete affected site suites once and report actual failures.

Run Gradle from `apps/mobile`. Use `.\gradlew.bat :core:network:testDebugUnitTest :core:repository-impl:testDebugUnitTest :composeApp:testDebugUnitTest :core:database:copyRoomSchemas --offline --continue --console=plain` for the final mobile gate. Select focused test classes while iterating. Use escalation when the normal Gradle cache or SDK is required.

## Validation and Acceptance

For each of the five Event Types, a valid external registration URL determines Affiliate classification without changing the Event Type. Authorized link changes and registration switches retain identity, competition, Schedule, Resources, provenance, and staff. Unclaimed public Events reload from Room and expose an external registration action but no unauthorized management action. A claimed Organization Event uses server capabilities. Outbound clicks still emit the existing analytics event. No pixel result or purchase-attribution field is required.

The client-to-site integration check must use a mobile serializer, a real HTTP client, and the site API. The separate parser matrix is useful regression coverage. It does not satisfy the live API gate. Room tests use an in-memory database. Native iOS device verification requires macOS; report that limit if unavailable.

## Idempotence and Recovery

Do not deploy or start application services without separate explicit authorization. Reuse an already authorized local test database server if database integration is available. Use a separate issue database and prepare migrations according to the isolation runbook. Do not access production for test data. Preserve unrelated files and runtime state.

## Surprises & Discoveries

The first draft and server tests failed because an external link cleared Team duties, staffing priority, officials, Match rules, and Time Slots. The fixes passed both editor toggle cases and three server destination cases. A focused web run passed 227 of 228 tests. Its remaining expectation used division capacity 99 while Shared Division Settings specified 24. Shared capacity now follows the same rule for both registration destinations; external listing prices remain per division.

The first mobile hydration test failed because source fields were absent from the stored Event. It passed after adding provenance and authority hydration for all five Event Types. The focused access suite passed all nine cases. The accessible registration input test also passed. The five-type Room/real-site-parser matrix passed, including combined name and link edits.

Docker is not running on this host. No native Postgres process was found. No application or database service was started. A live database API check still needs an available authorized test runtime. The parser checks do not claim to verify a live database transaction.

Existing `eventFormHelpers.test.ts` expects Affiliate drafts to remove staff, Team duties, and Match rules. The preceding audit ran four site suites with 86 passing tests, including that conflicting expectation. Passing existing tests does not establish issue acceptance.

## Interfaces and Dependencies

The request shape stays unchanged. `affiliateUrl` remains a string in editor commands. All released mobile Event Type enums already contain the five supported types. The current parser still accepts the same string wire shape. The save boundary rejects the obsolete Affiliate Event Type and invalid external URLs as configuration errors.

Mobile now sends and reads `schedule.isAutomatedScheduling`, the current site field. It also reads the older `schedule.automatedScheduling` key. The site parser already accepts both keys. No required field or contract version changes. The old mobile serial name caused explicit `false` to become the default `true` after a site response. The new hydration test and the five-type matrix cover that defect. The parity tests now read the shared site fixture without renaming its scheduling field.

Responses add optional `capabilities.viewerUserId` and optional editor snapshot `provenance` with nullable `sourceType`, `sourceId`, and `sourceUrl`. Existing capability fields keep their shape. Mobile now retains the existing Event source fields and capability object. Room version 107 stores them. Viewer-scoped capabilities prevent a cached grant from granting access to another signed-in user. Old responses without a viewer ID cannot grant external Event management.

New Events record `ORGANIZATION_CREATED` or `USER_CREATED` only in the database create operation. Existing source fields are not written during editor updates. Imported provenance remains `AFFILIATE_IMPORT`. The dormant Prisma `AFFILIATE` enum value is not offered or emitted by current clients. No production row conversion is performed.

Prefer existing `affiliateUrl`, source metadata, authority capabilities, editor contracts, signed outbound action, and analytics modules. Add no purchase-attribution schema. Do not make a response field required under an unchanged contract version. Document exact field changes and compatibility decisions here as implementation proceeds.

## Review and Remaining Verification

The independent Spec review found two defects. A partial participant refresh removed External Registration and cached authority. Imported availability also replaced BracketIQ registration counts after a registration switch. Both code paths now preserve the intended state. The reviewer confirmed both fixes. The offline regression includes participant refresh and replacement of a cached grant with an explicit server denial.

The Standards review requested a real playoff input interaction and removal of obsolete server flags. The UI test now edits the actual Playoff Division Name input. Fifteen server helpers no longer accept unused registration flags. The live client-to-site API gate remains open.

The five-type matrix also found unconditional mobile normalization during a registration change. The mapper now retains unchanged Event Type configuration when the destination changes and the Event Type stays the same. The matrix includes a combined name and link change. Explicit Event Type transitions still use the existing normalization.

The complete mobile run passed 105 network tests and 1,636 executed Compose tests (10 skipped). The first complete repository run reported two site subprocess timeouts and a failing new matrix. A later run passed the two reflow checks. The five-type matrix passed after the scheduling field fix. The final network run passed 106 tests. The repository run executed 147 tests, with three old wire assertions failing. Those three assertions passed in the subsequent nine-test parity suite. Four repository tests were skipped, including the prepared live API test. Android lint reported 13 errors and 83 warnings. All errors are in untouched Android map/test files or the local SDK path configuration.

The final site type check passed. ESLint on the changed site files reported zero errors and one existing image warning in the EventCard test. The full site run was interrupted after repeated failures and 32 reported suite results. Failures included Windows socket permissions, POSIX mode expectations, and unrelated assertions. Do not report that run as a clean full-suite result. Focused review fixes passed 107 tests. Authority, snapshots, outbound protection, and outbound route checks passed 56 tests. The changed-file run passed 416 tests, failed eight, and skipped six. Six editor failures reproduced against the pre-issue commit `f7b389fa6`. The manual-payment review failure passed on rerun. The remaining external-registration UI assertion was updated for shared capacity and the League label. All four selected external-registration UI cases then passed. The test results do not establish a clean full-suite run.

The prepared live test is `given_live_site_when_registration_destination_changes_then_api_and_room_preserve_the_event`. Set `MVP_ISSUE48_API_URL` to the authorized local site. Set `MVP_ISSUE48_EVENT_IDS` to five issue-48 fixture IDs, one for each Event Type. Set `MVP_ISSUE48_TOKEN` to a temporary local test session. The test uses the real HTTP client and site endpoints. It checks saves, reloads, Room state, provenance, authority, competition, Resources, and staffing. It restores each registration link after the check. It skips when these fixtures are absent. Do not count a skipped test as executed API verification.

The public source URL remains redacted by the existing outbound protection. Mobile stores the source metadata that each authorized response supplies. Partial participant responses do not carry destination or authority state. Only the complete detail projection replaces those fields during that merge.

## Outcomes & Retrospective

The code is implemented. The Standards review has one open verification gate: execute the prepared real HTTP and database test. The Spec review has no remaining code findings. The user has not yet approved starting Docker Desktop, the local Postgres service, and the local site on port 3108. No test runtime was started. Issue #48 remains open until the live integration gate is complete. Native iOS execution also remains unverified on this Windows host.

The implementation removes registration-dependent operational resets. It retains provenance and viewer-scoped authority in Room. It keeps outbound clicks and requires no pixel. The registration switch and destination-change matrix covers all five Event Types. The full-site and Android lint limits above remain part of the validation record.

Plan created on 2026-09-05 from the revised issue and the completed read-only audit.
