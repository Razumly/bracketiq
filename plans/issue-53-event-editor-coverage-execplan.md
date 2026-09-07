# Guard Event Editor field coverage

This plan follows `PLANS.md`. Keep the progress and evidence current.

## Purpose / Big Picture

Issue #53 requires a shared field inventory and complete wire fixtures. A wire fixture is a reviewed JSON example of an HTTP command or result. The guard must fail when a field changes without a reviewed classification. It must also detect values that a web or mobile encoder loses.

## Progress

- [x] (2026-09-07) Read issue #53 and its comments. Confirm that all blockers are closed. Claim the issue and set its project status to In progress.
- [x] (2026-09-07) Audit the existing League and Tournament fixtures, strict site schemas, and mobile DTOs.
- [x] (2026-09-07) Add the 301-leaf command inventory. Add 1,669 source property classifications across 129 declarations. Prove addition, removal, and single-command draft drift detection.
- [x] (2026-09-07) Add eight complete context fixtures, nine command envelopes, and eighteen typed results. Pass the web and mobile round trips and the client-to-site parser check.
- [x] (2026-09-07) Add 26 pairwise cases and nine boundary cases. Exclude unsupported Tryout officiating combinations. Pass 113 focused site checks, including the existing save and revision failure paths.
- [x] (2026-09-07) Fix canonical Tryout assistant-host invitation loss. Fix fractional timed Match duration loss in the web adapter. Pass both regression checks.
- [x] (2026-09-07) Pass the focused site coverage command: 297 tests across eight suites. The source inventory then gained four UI state declarations.
- [x] (2026-09-07) Apply 224 migrations to the isolated `bracketiq_e2e_53_563b` database. Confirm that the schema is current. Run six database checks: five pass and one existing Playoff-count assertion fails.
- [x] (2026-09-07) Fix review findings for result branches and nested graph DTOs. Add Create revision fields and canonical graph retention. Pass 57 site result and identity checks. Pass TypeScript and the full-file lint check for the issue slice.
- [x] (2026-09-07) Add a Create acceptance Room regression for nested incident metadata. Use the existing canonical persistence conversion. Keep legacy Create graph decoding compatible.
- [x] (2026-09-07) Complete both independent review axes. Standards: no remaining findings. Spec: no remaining actionable findings.
- [x] (2026-09-07) Pass the full Android checks with one Gradle worker: 2,016 tests pass and 17 are skipped. Android lint passes. The Create metadata Room regression and the existing Reflow client-to-site check pass.
- [x] (2026-09-07) Pass the final `npx tsc --noEmit` check. Pass full-file lint for all nine changed site files against the issue base commit.
- [ ] Run the full checks, review both axes, commit, and update GitHub.

## Context Boundary

Start with issue #53, root and application `AGENTS.md` files, `apps/site/CODING_STANDARDS.md`, and the issue workflow documents. Use `CONTEXT.md` Event, registration, and staffing entries and ADR 0010. Read the strict schemas in `apps/site/src/contracts/eventEditor.ts`, the web adapters and round-trip tests under `apps/site/src/app/events/[id]/schedule/components/eventForm`, and `test-fixtures/event-editor`. On mobile, read `core/network` Event Editor DTOs, the `core/repository-impl` session mapper and tests, and the Event Editor state owners in `composeApp`. Expand to a model or Room entity only when the inventory names it. Expand to server save, proposal, and transaction tests to prove the failure-path criteria. Do not read other issue plans unless a missing decision requires one.

## Context and Orientation

The site is the HTTP contract authority. Mobile uses Kotlin serialization. The common mobile test source set also runs on iOS. The existing shared fixtures cover League and Tournament commands. Web tests cover other Event Types but use a separate TypeScript fixture set. No authoritative classification currently connects these examples to every strict command leaf. A leaf is a scalar, a collection element, or an explicitly open JSON value. The base commit for this issue is `2de76a5c811c016423dcb12df93d3fa283b6e0b7` on `workstream/issue-42-schedule-diagnostics`.

## Plan of Work

First add a guard at the issue-defined public schema boundary. Store reviewed classifications beside the shared JSON fixtures. Enumerate schema leaves at test time and compare the complete set to the stored inventory. Include mutation tests that add and remove fields. Store reasons and mobile owners. Do not generate expected classifications during tests.

Next add complete non-default examples for One-Time Event, Weekly Event, League, Tournament, and Tryout. Cover rental, Organization authority, staffing, payments, questions, documents, and External Registration. Check exact canonical JSON through the site parser and the mobile command encoder. Use the same checked-in JSON in common mobile tests. Send Android-produced JSON to the actual site parser in a command-line integration test. Add a macOS test gate for the shared iOS tests if no existing gate runs them.

Then check boundary and selected pairwise cases through the same public command interfaces. Retain and run existing save and proposal tests for rollback, retry identity, changed intent, stale revisions, proposal invalidation, and effect deduplication. Add only missing behavior checks.

## Concrete Steps

Run site commands from `apps/site`. Use `npx jest --runInBand --runTestsByPath` for focused tests. Run `npm run lint:changed` and `npx tsc --noEmit`. Run the complete site Jest suite once after implementation. Store local logs under `apps/site/test-results`.

Run Gradle from `apps/mobile`. Use `./gradlew.bat :core:network:testDebugUnitTest` for shared DTO checks. Use the repository and compose test tasks for any changed mapper or state behavior. Run `:core:network:iosSimulatorArm64Test` on macOS. Windows cannot execute an iOS binary.

## Validation and Acceptance

An added or removed strict field must fail with its path. A changed fixture value must reach both site and mobile without loss. Both platforms must use one canonical fixture file. Each classification must name a reason and a mobile owner. Every supported Event Type and the named independent contexts must have a complete example. Boundary cases must include offsets, daylight-saving dates, empty and multiple collections, fractional durations, payment amounts, phase rules, End Policies, and immutable authority values. Failure-path tests must check observable results and side-effect counts.

## Idempotence and Recovery

Tests and inventory checks can run again. Preserve unrelated files under `apps/site/test-results`. Do not change a runtime state. The earlier authorization for the issue #52 server on port 3052 does not authorize a new issue #53 runtime. A client-to-site parser process is a bounded test command and needs no persistent server. No persisted entity change is planned. If one becomes necessary, add the required Room migration policy and schema snapshot before completion.

## Surprises & Discoveries

The mobile command encoder preserves required null values but removes null values from optional strict rows. Exact fixture checks must use this production encoder. Plain Kotlin serialization is not an equivalent command encoder.

The Tryout mapper accepted only the legacy `HOST` staff type. It discarded canonical `ASSISTANT_HOST` invitations. The complete fixture failed before the fix. A separate regression checks an invitation with only canonical roles.

The web adapter changed a timed Match duration from 42.5 minutes to 42 minutes. The boundary test failed before the fix and passed after the adapter retained the finite duration.

The database suite passed five of six checks. The same-type PRESERVE test still expects every stored Playoff count to equal four. It failed before the site production adapter changed in this issue. The proposal rollback and create retry checks passed. The failure is separate from the field coverage work.

The Spec review found missing Create and maintenance result fixtures. The added Create result fixture exposed four missing mobile fields: `createOperationId`, `editorRevision`, `staffRevision`, and `scheduleRevision`. They now remain in the result DTO. These fields already exist in the site contract. No field became required on mobile.

Create proposal graphs now retain the canonical graph through the existing maintenance graph codec. Create persistence uses that canonical graph. The legacy Match conversion could discard incidents with object or array metadata. The shared fixture now contains such an incident. The Room regression checks its stored metadata. Existing legacy Create graph payloads keep their prior decoder when the canonical `officialSchedulingMode` field is absent.

Concurrent builds in another checkout increased memory pressure. An earlier Reflow check timed out while starting its site parser. The serial mobile run passed that check. Use `--max-workers=1` on this host when other builds are active. The final command was `./gradlew.bat testDebugUnitTest :composeApp:lintDebug --continue --max-workers=1`.

## Decision Log

Use the schema, encoder, and save/proposal boundaries named by issue #53 as the test seams. The user's issue instruction already authorizes these checks. Use test-driven development at these seams without an extra scope confirmation. Date: 2026-09-07.

Keep the inventory independent from production schemas. Tests may enumerate actual fields, but they must not regenerate their expected classifications. Date: 2026-09-07.

## Outcomes & Retrospective

Final validation is in progress. The guards and review exposed losses in Tryout invitations, fractional timed Match durations, Create revision fields, and Create graph metadata. No site HTTP field or contract version changed. No Room entity changed. No new application runtime was started. Native iOS execution remains in the macOS CI job because this host runs Windows.

## Artifacts and Notes

The GitHub issue is https://github.com/Razumly/bracketiq/issues/53. Final evidence and commands will be recorded here.

## Interfaces and Dependencies

Use the existing Zod and Kotlin serialization dependencies. Add no shared application runtime dependency. Shared JSON files are test data only. Keep the npm and Gradle graphs separate.
