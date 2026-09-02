# Create Weekly Events and Tryouts with Correct Lifecycle Rules

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. This plan follows the repository rules in `PLANS.md` and is written so a contributor with no prior conversation can continue the work.

## Purpose / Big Picture

Event organizers need two predictable event types in the web application. A Weekly Event should automatically repeat from canonical weekly time slots, allow either a Planned End or No Planned End, show its next occurrence, and stop producing future occurrences when archived. A Tryout should collect individual registrations through a required Planned End and must not expose or persist league/tournament match-generation settings. Both forms must send complete current commands, keep the values that failed validation or saving, and make an unchanged retry idempotent.

After this work, a contributor can verify the behavior in the web and mobile applications. The web editor exposes type-specific controls, the site search returns Weekly parents with next-occurrence metadata, and the mobile create and cached-search flows preserve the same lifecycle rules. The explicitly authorized updated local backend served the real mobile-to-site integration proof.

## Progress

- [x] (2026-06-09) Read Issue #35, its comments, `PLANS.md`, the site and mobile guidance, the editor contracts, the named lifecycle seams, and the focused tests before editing.
- [x] (2026-06-09) Preserve site editor contract version 3 and canonical repeating `daysOfWeek` slots. Make Weekly automation and end-mode rules type invariants.
- [x] (2026-06-09) Enforce site Tryout individual registration, finite Planned End, hidden match-generation controls, and non-bracket payload sanitization.
- [x] (2026-06-09) Enforce site Weekly search overlap, next-occurrence metadata, archive stopping, canonical timestamp preservation, and bounded action occurrences.
- [x] (2026-06-09) Implement mobile Weekly and Tryout create/edit parity, strict CLUB_TEAMS Tryout bootstrap validation, complete resource and source-division assignments, and unchanged retry identity.
- [x] (2026-06-09) Implement mobile Room-backed Weekly occurrence projection, archive stopping, separate occurrence metadata, and canonical timestamp preservation.
- [x] (2026-06-09) Run final site proof: participant route 1 suite and 41 tests, payment 1 suite and 5 tests, search/editor/registration/repository 4 suites and 194 tests, refund/bill/checkout 3 suites and 21 tests, full webhook 1 suite and 19 tests, isolated webhook occurrence proof, and checkout rerun 1 suite and 6 tests; `npx tsc --noEmit` also passed.
- [x] (2026-06-09) Run mobile targeted Gradle proof for billing, participant management, create payloads, search occurrence state, Weekly occurrence selection, access rules, occurrence rules, and retained event-detail options; the task completed with `BUILD SUCCESSFUL`.
- [x] (2026-06-09) Complete final Standards and Specification re-review from the working-tree fixed point. All four axes returned PASS after the final archive, billing, refund, webhook, and fixture fixes.
- [x] (2026-06-09) Run the required real mobile-to-site API integration proof against the explicitly authorized updated backend at port 3000. The full lifecycle class completed with `BUILD SUCCESSFUL`: 6 tests, 0 skipped, 0 failures.

## Surprises & Discoveries

- Observation: Weekly Event already used editor contract version 3 with `daysOfWeek`, `dayOfWeek`, `scheduleEndConstraint`, and `generatedScheduleEnd`. No version bump or compatibility alias was needed.
  Evidence: `apps/site/src/contracts/eventEditor.ts` and the existing slot adapters use the canonical repeating-slot shape.
- Observation: The site form invariant and draft builder both reset Weekly No Planned End to false. Removing both resets was required for the selected end policy to survive a draft round trip.
  Evidence: `useEventFormInvariantSynchronization.ts` and `buildEventDraft.ts` contained Weekly-specific false assignments before this change.
- Observation: A default did not enforce Weekly automation. The scheduler helper, adapter, repository, and UI must all normalize it to true and remove the editable checkbox.
  Evidence: `apps/site/src/lib/automatedScheduling.ts`, `editorContractAdapters.ts`, and the Weekly form sections now apply the invariant.
- Observation: Search rows need occurrence metadata separate from canonical Event dates. Replacing `Event.start` would corrupt the season start stored in mobile Room when different searches return different occurrences.
  Evidence: The site search response and mobile DTO carry nested `nextOccurrence`; the canonical `start` and `end` values remain unchanged.
- Observation: Weekly search must resolve occurrences before ranking and pagination. Canonical-start filtering omitted past-start parents, and a capped canonical-start candidate set could omit the next eligible event.
  Evidence: `apps/site/src/app/api/events/search/route.ts` now batch-loads slots, applies bounded overlap, removes unmatched parents, and disables the cap when Weekly parents may be present.
- Observation: Weekly action routes need canonical event bounds in their selected occurrence context. Without those bounds, registration and billing accepted occurrences before the season start or after a finite Planned End.
  Evidence: `weeklyOccurrences.ts` and the affected Prisma selects now reject those intervals.
- Observation: Tryout creation needs a real organization bootstrap. Mobile now offers Tryout only when the selected organization has `CLUB_TEAMS`; the generic no-organization create path does not expose a submit path that must fail.
  Evidence: `EventCreateSimpleSetup.kt` and `DefaultCreateEventComponent.kt` derive the capability from the loaded editor catalog.
- Observation: Room ignores transient search occurrence metadata, so the mobile search projection must carry an immutable occurrence-bearing value for StateFlow equality. The Room schema version increased only for persisted `archivedAt`.
  Evidence: `DiscoverEventSearchResult` and the schema 104 separate card state from the Room `Event` row.
- Observation: The Room schema task is module-scoped. `:composeApp:roomGenerateSchema` does not exist; `:core:database:copyRoomSchemas` is the available command and completed successfully.
- Observation: Prisma supports `UNPUBLISHED`, not `DRAFT`, for the persisted event state. The integration fixture uses `UNPUBLISHED`; no state alias or repository normalization was added.
- Observation: Persisted staff invites can expose legacy `staffTypes` values such as `HOST`. The editor adapter maps `HOST` to `ASSISTANT_HOST` before the current roles schema parses the snapshot.
- Observation: Site save sanitizes bracket-only scoring for `EVENT`, `WEEKLY_EVENT`, and `TRYOUT`. The lifecycle matrix expects `usesSets` to remain false for those non-bracket types.
- Observation: Tournament one-time slots must use the event time zone and cover each available local day. The split-pool fixture needed an extended multi-day window.
- Observation: A schedulable no-official fixture uses `SCHEDULE` and `BEST_AVAILABLE_COVERAGE`. `OFF` requires named coverage and cannot represent that fixture.
  Evidence: The lifecycle integration proof completed with 6 tests, 0 skipped, and 0 failures.

## Decision Log

- Decision: Treat Tryout as non-bracket, individual-registration-only, and fixed-end-only at every boundary. Sanitize nested division details before the repository upsert.
  Rationale: Hidden controls do not prevent stale League/Tournament values from failed drafts, legacy records, or direct API commands.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Enforce archive mutation locks in the shared Weekly resolver. Clear future `nextOccurrence` card metadata for archived parents, but retain a selected occurrence separately for historical read and refund paths. Keep all mutation handlers blocked.
  Rationale: Search projections must not advertise future work after archive, while historical billing and refunds still need the selected occurrence.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Resolve Weekly occurrences against the requested search interval before ranking and pagination, and return occurrence metadata without changing canonical event timestamps.
  Rationale: A recurring parent is discoverable by its next matching occurrence, not only by its season start.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Gate mobile Tryout creation on an organization-scoped editor bootstrap with the `CLUB_TEAMS` feature.
  Rationale: The generic personal-event bootstrap has no organization and cannot satisfy the strict Tryout source-division contract.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Keep occurrence metadata out of the persisted Room Event constructor and give Discover search state immutable occurrence-bearing identity.
  Rationale: Room must remain the source of truth for canonical Event rows, while StateFlow must emit when only the displayed occurrence changes.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Increase Room schema version from 103 to 104 for persisted `archivedAt`; use destructive migration already configured by both mobile database builders.
  Rationale: The entity changed, and the repository's existing migration policy handles the version transition without a hand-written migration.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Keep the editor contract version at 3 and update site and mobile callers together for the optional nested search occurrence field.
  Rationale: The response addition is optional and backward-compatible; required request fields and existing parsers remain unchanged.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Persist automatic refund intent rows with `WAITING` status before calling Stripe, then re-lock the event and complete the registration and payment mutation.
  Rationale: Archive races and provider failures need a durable retry boundary without placing external provider calls inside a database transaction.
  Date/Author: 2026-06-09 / Issue35Lifecycle.
- Decision: Carry Weekly `slotId` and `occurrenceDate` through mobile billing requests, server bill and checkout routes, persisted bills, and checkout metadata.
  Rationale: A parent event has many participant rosters. Billing must use the selected occurrence instead of the canonical parent roster.
  Date/Author: 2026-06-09 / Issue35Lifecycle.

## Outcomes & Retrospective

The site and mobile slices cover the requested Weekly Event and Tryout lifecycle. The site enforces UI, draft, snapshot, save, repository, scheduler, search, occurrence-action, archive, billing, refund, waitlist, and nested-division invariants. Site search returns a nested next occurrence while preserving canonical season dates. Mobile create flows support Weekly planned and unbounded ends and Tryout individual registration with a finite end; Tryout creation is gated to a valid organization capability and assigns source divisions and resources. Mobile Room stores `archivedAt` and canonical event fields. Discover card occurrence metadata remains transient and immutable. Selected Weekly detail occurrences remain available for historical billing and refund reads after a Room archive refresh, while archive mutation guards remain active. Focused site and mobile proof passed. The required real mobile-to-site API integration proof is incomplete: port 3000 served stale code with an obsolete Prisma filter, port 3010 was unavailable, and runtime start or restart was not authorized. No runtime state was changed.

## Context and Orientation

`apps/site` is the web and backend source of truth. `apps/site/src/contracts/eventEditor.ts` defines the version-3 `EditorDraft` and `EditorSaveCommand`. The form under `apps/site/src/app/events/[id]/schedule/components/eventForm/` builds those values. `editorContractAdapters.ts` maps records and drafts, while the invariant hooks keep event-type settings coherent.

`apps/site/src/server/events/eventEditorSave.ts` validates and persists editor commands. `apps/site/src/server/repositories/events.ts` normalizes event upserts. `apps/site/src/server/events/weeklyOccurrences.ts` resolves selected Weekly occurrences. A Weekly parent has `eventType === WEEKLY_EVENT` and no parent reference; `archivedAt` marks a parent that no longer produces future occurrences. `apps/site/src/app/api/events/search/route.ts` returns search rows with nested next-occurrence metadata. The nested value is presentation data. It does not replace canonical `Event.start` or `Event.end`.

`apps/mobile` consumes the same HTTP contract. `core/network` decodes event and editor DTOs. `core/repository-impl` maps editor sessions and commands. `composeApp` stores canonical events in Room and projects Discover cards. `EventSearchComponent` uses an immutable occurrence-bearing result for card state. `EventDetailWeeklySchedulePresentation.kt` handles active, archived, and local Weekly projection. The iOS Discover views consume the same immutable search result through the generated shared framework.

A Planned End is a finite event end represented by `FIXED_END` and an end date-time. No Planned End is represented by `GENERATED_END` without a finite end; it is valid only for a Weekly parent. A canonical repeating slot has stable identity, one or more `daysOfWeek`, wall-clock start and end minutes, a local time zone, `repeating: true`, and an optional end date. Multi-day availability stays in one slot.

## Context Boundary

The minimum sources for this task are:

- `PLANS.md`, Issue #35 body and comments (`issue://35?state=all`), the root and application guidance, and this plan.
- Site contract and editor sources: `apps/site/src/contracts/eventEditor.ts`, the event-form draft/adapters/schema/components/hooks, `apps/site/src/server/events/eventEditorSnapshot.ts`, `eventEditorSave.ts`, `apps/site/src/server/repositories/events.ts`, and `apps/site/src/server/events/weeklyOccurrences.ts`.
- Site listing and action sources: `apps/site/src/app/api/events/search/route.ts`, the affected billing/registration/participant/waitlist/free-agent routes, `apps/site/src/lib/eventService.ts`, the Discover EventCard/list components, and the Weekly session helper.
- Mobile contract and persistence sources: `apps/mobile/core/network/.../EventDtos.kt`, `EventEditorDtos.kt`, `apps/mobile/core/repository-impl/.../EventEditorSessionMapper.kt`, `apps/mobile/core/model/.../Event.kt`, `apps/mobile/core/database/.../MVPDatabaseService.kt`, and the Room builders.
- Mobile create and presentation sources: `apps/mobile/composeApp/.../DefaultCreateEventComponent.kt`, `EventCreateSimpleSetup.kt`, `CreateEventScreen.kt`, `EventDetailWeeklySchedulePresentation.kt`, `EventSearchComponent.kt`, the Discover card/list/bridge files, and the iOS Discover result/card/state files.
- Focused tests adjacent to each changed seam, including site editor/save/repository/search/action tests and mobile create, DTO, mapper, Weekly detail, bridge, and Room tests.

Expand this boundary only when a focused failure identifies an unlisted caller, parser, generated schema, platform bridge, or response-field consumer. Do not broaden it to unrelated event types or services.

## Plan of Work

First, keep the site editor contract at version 3 and normalize event type before mapping scheduling or competition values. Weekly always enables automation and retains either fixed-end or generated-end policy. Tryout always uses individual registration and a finite planned end. Non-bracket save paths clear effective match, playoff, pool, scoring, placement, standings, and bracket state without losing valid division identity, eligibility, pricing, capacity, payment, source-division, or field assignments.

Second, enforce the site server and listing boundaries. Reject generated-end Tryout commands before persistence. Include Weekly parents in search candidates. Resolve and filter their actual next occurrence before date-range ranking and pagination. Preserve parent `start` and `end`, and attach occurrence metadata separately. Validate selected occurrence actions against the canonical parent interval. Archived parents produce no future occurrence.

Third, implement mobile create parity. Weekly create supports planned and unbounded end policies with canonical multi-day slots. Tryout create is available only for a valid CLUB_TEAMS organization. It creates an individual, finite-end event from source divisions and assigns valid fields and time slots. Failed saves retain the current draft and unchanged retries reuse the pending command identity.

Finally, preserve mobile persistence and presentation invariants. Room persists canonical event fields and `archivedAt` only. Search occurrence metadata remains transient but travels in immutable `DiscoverEventSearchResult` values so equal canonical events with different occurrences still emit. Android and iOS cards render the occurrence. Archived Weekly detail clears occurrence metadata. Local fallback rejects an occurrence that has already started.

## Concrete Steps

Work from the repository root unless a command names `apps/site` or `apps/mobile` as its working directory. Edit existing files surgically. Do not commit. Run only the explicitly authorized project backend for live proof. Do not change other runtimes.

1. Read the issue, contract, site and mobile guidance, active plan, changed seams, and adjacent focused tests. Confirm contract version 3, canonical `daysOfWeek`, and Room schema version 104.
2. Apply site invariants across draft mapping, form controls, schema, save, repository, scheduler, search, action routes, event-list projection, and non-bracket division sanitization. Keep parent event dates separate from nested Weekly occurrence metadata.
3. Apply mobile invariants across DTO mapping, Room persistence, create setup and submission, command retry state, Weekly detail projection, Discover search state, Android cards, and iOS cards. Keep Tryout creation real and gate it on the canonical CLUB_TEAMS organization capability.
4. Add focused regression coverage for Weekly planned and unbounded ends, multi-day slots, occurrence date filtering and sorting, archive stopping, bounded occurrence actions, Tryout individual finite-end creation and resource assignment, non-bracket sanitization, failed-save retry identity, DTO mapping, Room schema, archived detail, and immutable occurrence-bearing cards.
5. From `apps/site`, run the affected focused Jest suites:

       npx jest --runInBand src/app/api/events/__tests__/participantsRoute.test.ts src/server/billing/__tests__/eventRegistrationPaymentApplication.test.ts
       npx jest --runInBand src/server/repositories/__tests__/events.upsert.test.ts src/app/api/events/__tests__/eventSearchRoute.test.ts src/server/events/__tests__/eventEditorSave.test.ts src/server/events/__tests__/eventRegistrations.test.ts
       npx jest --runInBand src/app/api/billing/__tests__/refundRoute.test.ts --runTestsByPath 'src/app/api/events/[eventId]/teams/[teamId]/billing/bills/__tests__/route.test.ts' --runTestsByPath 'src/app/api/events/[eventId]/teams/[teamId]/billing/checkout/__tests__/route.test.ts'

   Run `npx tsc --noEmit`. From `apps/mobile`, run the targeted Gradle tests for the changed billing, participant, create, search, occurrence, and access seams. Run `:core:database:copyRoomSchemas` and `:composeApp:compileKotlinIosSimulatorArm64`.
6. Record exact command outcomes in this plan. Use the working tree after the Issue #35 review fixes as the fixed point because no commit was created. Record Standards and Specification findings separately.

## Validation and Acceptance

A valid Weekly Event draft has `basics.eventType === WEEKLY_EVENT`, `schedule.isAutomatedScheduling === true` regardless of stale input, a canonical repeating slot with one or more `daysOfWeek`, an event time zone, and either `GENERATED_END` without an end or `FIXED_END` with an end after start. The form has no editable automation checkbox. Its end control supports Planned End and No Planned End. Search includes a past-start Weekly parent when its next occurrence is in the selected range, returns the occurrence metadata, sorts by occurrence, and preserves the parent's canonical start and end. An archived parent yields no occurrence and no future listing.

A valid Tryout draft has `eventType === TRYOUT`, `registration.unit === INDIVIDUAL`, `schedule.mode === FIXED_END`, and an end after start. It has no match-generation controls. Its payload has no effective league scoring, playoff, pool, match-rule, bracket, or team-signup configuration. Creation requires a valid CLUB_TEAMS organization and assigns source divisions, valid fields, and a finite time slot. A generated/no-fixed Tryout fails before persistence while retaining entered values.

For save failure followed by an unchanged retry, the serialized command keeps the same command identity and current field values. Repository upserts do not duplicate canonical slot or division rows. Room stores `archivedAt` and canonical dates. `DiscoverEventSearchResult` equality includes occurrence metadata, so equal canonical events with different occurrences emit distinct card state. Android and iOS render that occurrence, while navigation and map callbacks receive the canonical event. Archived Weekly card projections clear future `nextOccurrence`; selected detail occurrences remain transient read context for historical billing and refunds, and all archive mutations remain blocked.

Focused tests prove these transitions and boundaries. The final report records exact suite, test, task, and pass counts. Existing warnings or unrelated dirty files remain separate from acceptance proof.

The required real mobile-to-site API integration proof passed against the explicitly authorized updated backend. The full lifecycle class completed with 6 tests, 0 skipped, and 0 failures.

## Idempotence and Recovery

All normalizations are deterministic. An unchanged save retry reuses the pending command identity and stable slot and division ids. A failed save leaves the current mobile draft available for retry. Search metadata is immutable presentation state, so Room refreshes cannot conflate equal canonical events with different occurrences. Automatic refunds persist a `WAITING` intent before the provider call and retry from that durable scope after an archive race. If a focused check fails, fix the source boundary that permits the invalid state. Do not weaken validation, add aliases, start services, or alter unrelated dirty files.

## Artifacts and Notes

Evidence captured during implementation:

- Site participant and payment proof: 2 suites and 46 tests passed (participant 41; payment 5), including durable team-manager refund retry after a provider failure and archive.
- Site search, editor, registration, and repository proof: 4 suites and 194 tests passed.
- Site refund, bill, and checkout proof: 3 suites and 21 tests passed; the final checkout rerun passed 1 suite and 6 tests.
- Isolated webhook occurrence proof: 1 `event_payment` test passed with 18 tests skipped; `slot_id` and `occurrence_date` reached the persisted bill.
- Full webhook proof: 1 suite and 19 tests passed after complete Weekly locked-event, repeating-slot, division, and transaction-client fixtures.
- Site typecheck: `npx tsc --noEmit` passed.
- Mobile targeted Gradle proof completed with `BUILD SUCCESSFUL` for billing HTTP, participant management, edit payload, search occurrence, Weekly occurrence, access rules, occurrence-rule, and event-detail options tests.
- Mobile iOS shared target proof: `:composeApp:compileKotlinIosSimulatorArm64` completed with `BUILD SUCCESSFUL`.
- Room proof: `:core:database:copyRoomSchemas` completed successfully. The generated schema is version 104 and includes `archivedAt`; occurrence metadata is not a Room field.
- Integration proof: `MVP_TEST_BACKEND_URL=http://127.0.0.1:3000 MVP_TEST_ALLOW_DB_SEED=1 ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.EventLifecycleMobileApiIntegrationTest'` completed with `BUILD SUCCESSFUL`; 6 tests passed, 0 skipped, and 0 failures. The project-scoped backend ran as `issue35-backend` on port 3000 after explicit authorization.
- Site adapter regressions: `eventEditorRoundTrip.test.ts` and `eventEditor.test.ts` passed with 2 suites and 47 tests.

## Review Record

Fixed point: the working tree after the Issue #35 review fixes. No commit was created.

Initial section reviews used separate Standards and Specification axes for site and mobile. The initial findings were:

- Site Standards: undeclared Tryout adapter state; raw staff spread overwrote normalized flags; missing `organizerName` and `scheduleText`; duplicate `start`; nested next-occurrence time zone loss.
- Site Specification: Weekly actions did not enforce the canonical parent interval; Weekly search filtered parents by parent dates, ranked before occurrence resolution, and capped candidates too early; non-bracket sanitization missed nested division details.
- Mobile Standards: mutable transient `Event.nextOccurrence` did not participate in data-class equality; Tryout DTO sanitization could restore nested match configuration.
- Mobile Specification: Tryout was exposed without a valid CLUB_TEAMS organization; archived Weekly detail retained occurrence metadata; local fallback accepted an occurrence already in progress.

Each initial finding moved from **open** to **fixed** after source changes.

Final re-review results:

- Site Standards: **PASS**. Rechecked archived Weekly payment finalization, durable pre-provider refund intent ordering, team-manager retry recovery, and strict bounded occurrence handling.
- Site Specification: **PASS**. Rechecked archive locking, child-to-parent resolution, archived slot handling, partial scheduling, waitlist errors, billing and checkout occurrence identity, and automatic refund recovery.
- Mobile Standards: **PASS**. Rechecked single-flight create identity, Tryout slot and resource synchronization, transient search occurrence state, archived historical reads, and archive-aware editor exit.
- Mobile Specification: **PASS**. Rechecked active Weekly bill and checkout scoping, checkout metadata through webhook bill persistence, archived historical snapshot and refund selection, and Weekly/Tryout create contracts.

The final focused proofs, type checks, webhook fixtures, four-axis re-review, and real mobile-to-site API integration proof passed. No project-wide test suites were run.

## Interfaces and Dependencies

Do not change the editor contract version (3) or rename fields. The shared contract is:

- Use `EditorDraft` and `EditorSaveCommand` from `apps/site/src/contracts/eventEditor.ts`.
- Use `WEEKLY_EVENT` and `TRYOUT` in `draft.basics.eventType`.
- For Weekly, send `schedule.isAutomatedScheduling: true`. Use `GENERATED_END` without a finite end for No Planned End, or `FIXED_END` with `schedule.endDateTime` for Planned End. Send stable repeating slots with `daysOfWeek`, wall-clock minutes, `timeZone`, `repeating: true`, and optional `endDate`.
- For Tryout, send `registration.unit: INDIVIDUAL`, `schedule.mode: FIXED_END`, a finite end after start, and `isAutomatedScheduling: false`. Do not send effective bracket or match-generation configuration.
- Keep the existing command identity and all current values across failed save and unchanged retry. The site response adds optional nested `nextOccurrence` metadata. It does not change canonical event dates.
- Mobile DTOs decode `nextOccurrence` into `EventSearchOccurrence`. Room persists canonical event fields and `archivedAt` but not that transient value. Discover uses `DiscoverEventSearchResult(event, nextOccurrence)` for immutable card state. Navigation and map callbacks use `event`.
- The mobile Room schema is version 104 because `archivedAt` is persisted. Weekly archive projection clears future occurrence metadata. Tryout bootstrap requires `OrganizationFeature.CLUB_TEAMS`, source divisions, valid fields, and a finite slot.

Changed files span the site form, contract adapters, schema, snapshot, save, repository, scheduler, search and action routes, event-list projection, and focused tests. Mobile changes span DTOs, editor mapping, Room model/schema, create setup and submission, command retry state, Weekly detail, Discover state/bridge/cards, iOS Discover views, and focused tests.