# Harden event creation and editing with explicit contracts

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. This plan follows the completed form-splitting work in `plans/event-form-split-execplan.md`, the division ownership work in `plans/remove-event-divisions-source-of-truth-execplan.md`, and the event staff transaction work in `plans/atomic-event-staff-reconciliation-execplan.md`. This document is self-contained. Those plans provide history but are not required to execute this plan.

## Purpose / Big Picture

Event organizers must be able to create and edit an event without stored values changing merely because the form opened, catalog data loaded, or Simple Setup displayed fewer controls. A no-change edit must preserve every editable value. A successful save must return the exact canonical state that the server stored. Repeating the same save must not create duplicate registration questions, staff entries, fields, divisions, or time slots.

After this work, Simple Setup and Advanced Setup are two views of one draft. They do not own separate event data. The client receives one complete editor snapshot from the server, changes that snapshot only through direct user actions, sends one strict save command, and replaces its local baseline with the canonical snapshot returned by the server. Event configuration saves are atomic. Schedule generation remains an explicit operation with a separate result, so the UI can distinguish “settings saved, schedule failed” from “nothing saved.”

The result is visible in these workflows: open an existing event and save no changes without any stored value changing; edit timing, pool rules, price, questions, or officiating and see the same values after reload; save one new question repeatedly and retain one row; use a connected organization for paid registration without a false Stripe prompt; select team staffing; and schedule across two valid time-slot windows that have a one-hour gap.

## Progress

- [x] (2026-08-09 17:03Z) Reviewed the current form, parent schedule page, service serialization, event routes, repository normalization, scheduler boundaries, registration-question identity flow, payment capability flow, and existing refactor plans.
- [x] (2026-08-09 17:03Z) Chose an additive Editor Snapshot and Save Command migration instead of another component-only split or a full rewrite.
- [x] (2026-08-09 17:20Z) Added characterization fixtures and regression coverage for draft round trips, question identity, payment capability, timing, team staffing, phase rules, schedule capacity, atomic save, revision conflicts, and post-commit staff delivery.
- [x] (2026-08-09 17:20Z) Defined strict Zod editor bootstrap, draft, save-command, snapshot, result, and stable error contracts with pure legacy adapters and draft transitions.
- [x] (2026-08-09 17:20Z) Added read-only create/edit bootstrap routes and a transactional editor save service covering event-owned divisions, fields, slots, questions, billing policy, officiating mode, and staff desired state.
- [x] (2026-08-09 17:20Z) Moved the form boundary to `EventEditorSnapshot`/`EventEditorDraft`; Simple and Advanced Setup now present one draft, and successful saves replace the client snapshot with the canonical server result.
- [x] (2026-08-09 17:20Z) Added separate schedule-end constraint and generated-end persistence plus one match-timing policy used by adapters and the scheduler; separated settings-save results from explicit scheduling failures.
- [x] (2026-08-09 17:20Z) Removed partial-event writes from the editor save boundary. Legacy `Event` conversion remains only at operational schedule/match compatibility edges, not as the form contract or editor API.
- [x] (2026-08-09) Focused editor, contract, API, and scheduler suites pass: 356 tests across 15 suites. `npx tsc --noEmit` passes. Targeted ESLint reports zero errors in milestone files and seven pre-existing warnings.
- [x] (2026-08-09) `npm run test:ci` passes, including route coverage (320 API files; 65.61% statements against a 64% floor). Prisma validation also passed earlier in this run. Full repository lint remains non-zero because 23 pre-existing error diagnostics are outside this milestone.
- [ ] (2026-08-09) Authenticated browser smoke remains blocked: the direct Next page reached successfully, but login/editor bootstrap returned 500 because local Postgres refused connections and Docker was unavailable.
- [x] (2026-08-09) Added an editor-boundary projection for division details so hydrated form metadata cannot cross the strict save command; regression coverage now parses league and playoff division payloads with those fields present.

- [x] (2026-08-10) Generalized the web contract-owned nested projection for fields, time slots, tags, manual payment links, official positions, officials, staff invites, and intentionally open rule records. Strict command parsing remains unchanged.
- [x] (2026-08-10) Added create bootstrap `start` support and the version-2 create envelope with a durable `createOperationId`.
- [x] (2026-08-10) Added atomic create-operation claiming, canonical request hashing, immutable result replay, actor/payload conflict handling, and transactional event/resource/question/staff persistence with durable staff-delivery metadata.
- [x] (2026-08-10) Migrated web create retries to a frozen pending command and migrated Kotlin create/edit/schedule flows to typed editor sessions, canonical snapshot replacement, typed errors, and one editor mutation per action.
- [x] (2026-08-10) Removed broad event authoring routes, legacy web/mobile authoring methods and DTOs, seed/save paths, separate editor question/staff writes, and unused compatibility aliases after caller audits. Retained routes have named non-editor callers.
- [x] (2026-08-10) Focused web verification passes: 6 suites and 115 tests for nested projection, editor routes, schedule-page behavior, template snapshots, event service, and the focused host route. Mobile create, editor, navigation, repository, and integration harness verification passes with the Android debug unit-test task; external backend integration is environment-gated.
- [x] (2026-08-10) Final web verification passed: `npx tsc --noEmit` and `npm run test:ci`; route coverage reported 321 API files with 64.90% statements, above the 64% floor.
- [x] (2026-08-10) Final mobile verification passed with `ANDROID_HOME`/`ANDROID_SDK_ROOT` set and stable single-worker JVM settings: `:composeApp:testDebugUnitTest` completed successfully. Mobile backend integration classes reported skipped because `MVP_TEST_BACKEND_URL` was not set; when an explicit backend is configured, editor bootstrap contract failures remain test failures.

- [x] (2026-08-10) Tightened mobile auto-seed readiness so only seed failures are converted to fixture-unavailable skips; post-seed editor bootstrap contract failures propagate. Added regression coverage for seed failure, successful readiness checks, and post-seed contract failure propagation.
- [x] (2026-08-10) Re-ran the two event-lifecycle tests, the league-playoff integration test, and the paid team-registration integration test against the seeded worktree backend on port 3011. All four tests passed with one worker.

## Surprises & Discoveries
- Observation: `DivisionDetailForm` includes hydrated `skillDivisionTypeName`, `ageDivisionTypeName`, and `sportId` values that are not part of the strict editor command.
  Evidence: The form-to-draft adapter previously copied division records unchanged, so any division-enabled create or edit could be rejected as `INVALID_EDITOR_COMMAND` by the strict route schema. The adapter now allowlists the canonical division fields before building the draft.

- Observation: The form has been split into sections and hooks, but the split preserved the previous state and mutation model.
  Evidence: `src/app/events/[id]/schedule/components/EventForm.tsx` is smaller than the historical monolith, but it still subscribes to the complete form with `watch()`, keeps separate Simple Setup choice state, and coordinates many hooks that call `setValue`.

- Observation: The primary `Event` interface is a read model, relationship container, computed view model, and write payload source at the same time.
  Evidence: `src/types/index.ts` defines `Event` with stored fields, expanded relations, matches, teams, computed `attendees`, and resolved match rules. `EventPayload` is an omission from that type, and `src/lib/eventService.ts` accepts `Partial<Event>` for updates.

- Observation: Edit initialization intentionally waits for effects to stop changing persisted draft fields.
  Evidence: `useEventFormLifecycleStabilization` fingerprints the built draft with `JSON.stringify`, waits with `setTimeout(..., 0)`, then calls `reset(stabilizedValues)` to establish a new dirty baseline.

- Observation: The current create contract is not a strict event contract.
  Evidence: `src/app/api/events/route.ts` accepts `event`, `newFields`, and `timeSlots` as `z.record(..., z.unknown())`, then performs normalization later in the route and repository.

- Observation: Registration questions have an identity defect across the client and server boundary.
  Evidence: New questions receive a client-generated `id`. The server creates a different UUID when that id is not already stored. The web save path ignores the canonical questions returned by the server. Edit loading includes inactive rows. A later save can therefore create another row and then display inactive history as editable data.

- Observation: Event staff already has a useful desired-state and revision contract.
  Evidence: `src/app/api/events/[eventId]/staff/route.ts` and `src/server/events/eventStaffReconciliation.ts` provide a narrow canonical snapshot, optimistic revision check, event lock, and idempotent reconciliation. The combined editor service can reuse the internal reconciler rather than recreate staff policy.

- Observation: The scheduler already preserves resolved rules on each generated match.
  Evidence: `src/server/scheduler/divisionPhaseRules.ts` writes `matchRulesSnapshot`, scheduler serialization returns it, and match persistence keeps it. This snapshot is the correct boundary for protecting existing generated matches from later event-default edits.

- Observation: One event end value currently represents both a user limit and a generated result.
  Evidence: the form sends `end` together with `noFixedEndDateTime`; repository upsert retains an end even in open-ended mode; the scheduler uses `event.end` as its scheduling horizon and later replaces it with the last match end. Compensation functions expand explicit and open-ended windows, but the data model still cannot state the two meanings independently.

- Observation: File size is a warning but not the root cause.
  Evidence: `src/app/events/[id]/schedule/page.tsx`, `src/lib/eventService.ts`, and both event routes remain large. More file splitting alone will not remove duplicate contracts or make a no-change save safe.
- Observation: Cross-client migration exposed a second ownership boundary.
  Evidence: A Kotlin `Event` projection cannot reconstruct web-only canonical fields without risking data loss. The mobile mapper now starts from `EventEditorSnapshot.draft`, overlays only changed mobile-owned values, and derives refreshed state only from the returned snapshot.

- Observation: Create retries need durable identity, not only child-row identities.
  Evidence: A lost response after event creation can otherwise allocate a second event on retry. The create bootstrap now supplies one operation ID, the client freezes the command before submission, and the server stores the canonical result for replay.

- Observation: Legacy authoring compatibility had no current consumer after migration.
  Evidence: Web and mobile caller audits found no remaining broad create/update authoring calls. The broad mutation routes, seed path, DTOs, aliases, and editor-only follow-up writes were removed; retained focused routes have non-editor callers.


## Decision Log

- Decision: Complete the editor migration with a clean cutover after caller audits.
  Rationale: The deployment has no external authoring consumers. Retaining broad `POST /api/events` and `PATCH /api/events/{eventId}` would preserve two write contracts and permit data-loss regressions. Keep only focused routes with named non-editor callers.
  Date/Author: 2026-08-10 / Codex


- Decision: Introduce `EventEditorSnapshot`, `EventEditorDraft`, and `SaveEventEditorCommand` as separate types.
  Rationale: A server read result, an editable client draft, and a write request have different valid fields. Deriving all three from `Event` recreates the current ambiguity.
  Date/Author: 2026-08-09 / Codex

- Decision: Keep Simple Setup and Advanced Setup as presentation modes over the same `EventEditorDraft`.
  Rationale: Switching presentation must not copy, infer, default, clear, or rehydrate persisted values. Optional-page choices are navigation state only. A destructive change runs only after an explicit user action and confirmation.
  Date/Author: 2026-08-09 / Codex

- Decision: Use pure transition functions for cross-field changes and do not introduce a new state-machine library initially.
  Rationale: A typed reducer and pure functions are sufficient for the current wizard. This keeps dependencies small and makes every clearing/default rule directly testable. Adopt a state-machine library only if the reducer cannot express the verified workflows clearly.
  Date/Author: 2026-08-09 / Codex

- Decision: Make the server the authority for defaults, billing capability, identifiers, and canonical saved state.
  Rationale: Async client catalog loading must never rewrite a persisted field. The client must reset its baseline only from a server snapshot, not from its own post-effect values.
  Date/Author: 2026-08-09 / Codex

- Decision: Save event-owned configuration in one transaction and reuse the existing staff reconciler inside that transaction.
  Rationale: Event fields, divisions, time slots, registration questions, official settings, and staff assignments form one editor result. If any validation or database write fails, none of these values should commit. Staff email delivery remains a post-commit side effect and must not roll back canonical database state.
  Date/Author: 2026-08-09 / Codex

- Decision: Keep matches and schedule generation outside the configuration save command.
  Rationale: Matches are generated operational records. A settings edit must not silently delete or rebuild them. “Save settings,” “Save and reschedule,” and “Rebuild bracket” are explicit intents with separate results. Existing published matches remain unchanged unless an explicit schedule action succeeds.
  Date/Author: 2026-08-09 / Codex

- Decision: Use an opaque editor revision computed from editor-owned canonical state under the existing event advisory lock.
  Rationale: The revision must include child rows such as divisions, slots, and questions. `Events.updatedAt` alone does not cover those rows. A deterministic revision avoids a schema column and detects legacy writes made outside the new editor route.
  Date/Author: 2026-08-09 / Codex

- Decision: Represent new registration-question identity with `clientId` and persisted identity with `id`.
  Rationale: One field cannot safely mean both a temporary browser key and a database primary key. The server response must map every new `clientId` to its canonical `id`.
  Date/Author: 2026-08-09 / Codex

- Decision: Treat division phase rules as the canonical event configuration and match snapshots as the canonical generated-match configuration.
  Rationale: The rule hierarchy becomes sport template, event default, division phase override, then generated match snapshot. Pool rules edit the preliminary phase for a specific division. Playoff rules edit the playoff phase. Existing matches retain their snapshots until an explicit rebuild.
  Date/Author: 2026-08-09 / Codex

- Decision: Separate a user-provided schedule end constraint from the calculated schedule end.
  Rationale: Open-ended scheduling cannot be reliable while one field means both “do not schedule after this time” and “the last generated match ends here.”
  Date/Author: 2026-08-09 / Codex
- Decision: Make create operations durable and idempotent with an immutable canonical receipt.
  Rationale: The bootstrap operation ID is stable for one create session. A unique transactional claim, canonical request hash, stored result, and actor/payload conflict policy prevent duplicate events and duplicate post-commit work after retries or response loss.
  Date/Author: 2026-08-10 / Codex

- Decision: Use the same strict editor protocol for web and mobile.
  Rationale: Mobile must not rebuild a complete command from its incomplete `Event` read model. Both clients start from the server snapshot, project only exposed edits, send questions/staff in the atomic command, and adopt the returned canonical snapshot.
  Date/Author: 2026-08-10 / Codex

- Decision: Treat failed staff email delivery as committed-save warning metadata.
  Rationale: Database state and the canonical editor result must not roll back because a post-commit email provider failed. The first create claimant records delivery status; replays return it without invoking delivery hooks again.
  Date/Author: 2026-08-10 / Codex


## Outcomes & Retrospective

The cross-client editor migration is complete. Web and mobile use version-2 editor bootstrap, snapshot, strict command, canonical result, and separate schedule contracts. Web nested projections strip hydrated relation keys before strict parsing. Create sessions freeze one command and replay through a durable operation receipt. Mobile create, edit, template, rental, staff, question, and schedule flows use typed editor sessions and no longer rebuild authoring requests from `Event`.

The broad event authoring mutations and obsolete seed/save paths are removed after caller audits. Focused reads, deletion, schedule, match, question, staff, and template workflows remain only where current non-editor callers use them. Staff delivery failure remains warning metadata after a committed save.

Focused web verification passed 6 suites and 115 tests, including nested projection, editor routes, schedule-page behavior, template snapshots, event service, and the focused host route. Mobile Android debug unit-test verification passed for the create/editor/navigation/repository changes and integration coverage. Full authenticated browser smoke remains blocked by unavailable local Postgres/Docker services, as recorded above.

## Context and Orientation

The repository is `/Users/elesesy/StudioProjects/mvp-site`. The event creation and management screen is `src/app/events/[id]/schedule/page.tsx`. It loads event data, owns schedule-page state, renders `src/app/events/[id]/schedule/components/EventForm.tsx`, collects draft data through an imperative ref, and coordinates event, match, question, and staff saves.

`src/app/events/[id]/schedule/components/eventForm/eventStateMapping.ts` maps a hydrated `Event` into form state. `defaultValues.ts` adds defaults. Form hooks load organization fields, sports, staff, documents, payment capability, and questions. Some hooks then modify draft-backed fields. `buildEventDraft.ts` maps form values back to `Partial<Event>`.

`src/lib/eventService.ts` maps API rows into the broad `Event` type, hydrates relationships, converts updates through `toEventPayload`, removes read-only properties, and calls the API. `src/app/api/events/route.ts` creates events. `src/app/api/events/[eventId]/route.ts` patches events. `src/server/repositories/events.ts` normalizes and writes event, division, field, slot, and match-related data.

`src/server/scheduler` contains the scheduling domain. A schedule end constraint is the latest time the user permits the scheduler to use. A calculated schedule end is the end of the final generated match. They are different values even when they happen to have the same timestamp.

An editor snapshot is the complete server response needed to open the editor without later data loads changing editable values. A draft is the client-owned editable copy of that snapshot. A save command is the strict request that states the desired editable values and the revision from which editing started. Canonical means normalized and accepted by the server as the stored source of truth.

The event editor owns event details, event-managed divisions, event-managed time slots and local resources, registration pricing policy, registration questions, event competition settings, and event staff configuration. It does not own participants, standings, match scores, incidents, check-ins, bills, or generated matches. Those remain separate operational domains.

## Required Invariants

The implementation must enforce these invariants at contract and transaction boundaries.

A snapshot maps to a draft without adding a default over an existing stored value. Mapping a draft to a save command and applying the returned canonical snapshot must be stable. Repeating that cycle without a user change must produce an equivalent snapshot.

Only a direct user transition can clear a configured value. Opening the editor, changing tabs, switching between Simple and Advanced presentation, resolving organization billing state, or finishing a catalog request cannot clear or replace a value.

All prices use integer cents in contracts and persistence. A server-provided billing capability controls whether online paid registration is permitted. A missing or loading organization object is not proof that Stripe is disconnected. The server rejects an invalid online paid command without rewriting it to manual or free registration.

Calculated match duration comes from one timing policy. The duration is not an independently editable peer of segment count, segment length, and break length. If a stored projection remains for compatibility, the server calculates it and clients cannot submit a conflicting value.

`officialSchedulingMode` is the canonical officiating choice. `TEAM_STAFFING` means teams officiate. `doTeamsOfficiate` is a temporary compatibility projection and must not be a second editable source.

Persisted questions use server IDs. New questions use client IDs only until the server returns canonical IDs. Inactive question history is never returned as active editor content.

The server checks the editor revision and staff revision under the event lock before any write. A conflict returns HTTP 409 with the latest revisions and no partial mutation.

Configuration save does not alter generated matches. Schedule actions use the saved canonical configuration. A failed schedule action leaves the prior published schedule intact and reports that settings saved but schedule generation failed. A newly created managed event remains unpublished until its required first schedule succeeds.

## Plan of Work

### Milestone 1: Add a characterization safety net

Create focused tests before changing contracts. Add reusable fixtures under `src/test/eventEditor/` for a simple event, single-division league, multi-division league, tournament with pools and playoffs, weekly event, organization-hosted paid event, rental-backed event, team-staffed event, and event with questions and required documents.

Add `src/app/events/[id]/schedule/components/eventForm/__tests__/eventEditorRoundTrip.test.ts`. It must load each fixture through the current mapping and default builders, build a draft without user changes, and compare all editable values. Record current intentional compatibility differences explicitly. Do not normalize a failure away merely to make the test pass.

Add regression tests for the known failures. One question saved twice must remain one active row. Edit loading must exclude inactive questions. A connected organization snapshot must leave online pricing enabled. Opening edit mode must preserve half length, break length, calculated duration inputs, pool rules, team staffing mode, price, and end mode. Two time-slot windows with a one-hour gap must either schedule successfully within their total capacity or return a precise capacity reason unrelated to the presence of the gap itself.

At the end of this milestone, the new tests should expose failures without changing production behavior. Run them independently and record the failing assertions in `Surprises & Discoveries`.

### Milestone 2: Define strict editor contracts and adapters

Create `src/contracts/eventEditor.ts`. This file must import only shared types and Zod. It must not import Prisma, React, Mantine, or server-only modules. Define strict schemas and inferred TypeScript types for `EventEditorBootstrapQuery`, `EventEditorSnapshot`, `EventEditorDraft`, `SaveEventEditorCommand`, `CreateEventEditorCommand`, `EventEditorSaveResult`, and stable error responses.

Structure `EventEditorDraft` by domain: `basics`, `participation`, `registration`, `competition`, `schedule`, `resources`, and `staff`. Use discriminated unions where modes change valid fields. For example, `schedule.mode = 'FIXED_END'` requires `endConstraint`, while `schedule.mode = 'GENERATED_END'` requires it to be null. Use `registration.payment.mode = 'FREE' | 'ONLINE' | 'MANUAL'` rather than deriving mode from price or Stripe loading state.

Define registration-question input as a union. Existing questions require `id`. New questions require `clientId` and must not send `id`. Define `editorRevision`, `staffRevision`, and `contractVersion` on snapshots and commands.

Create pure adapters under `src/app/events/[id]/schedule/components/eventForm/editorContractAdapters.ts`. `legacyEventToEditorDraft` maps current hydrated events into the new draft. `eventFormValuesToEditorDraft` temporarily maps the current flat form. `editorSnapshotToFormValues` supports the old component during migration. These functions must have table-driven tests and no React hooks.

Do not change the public `Event` read model in this milestone. Do not derive `SaveEventEditorCommand` from `Event` or `Partial<Event>`. At the end, TypeScript must prevent matches, participants, attendees, computed billing text, and hydrated relationship objects from entering the save command.

### Milestone 3: Add complete editor bootstrap snapshots

Add `GET /api/events/editor` in `src/app/api/events/editor/route.ts` for create context. It accepts a strict query containing organization, event type, rental, parent-event, or template context as applicable. Add `GET /api/events/[eventId]/editor` in `src/app/api/events/[eventId]/editor/route.ts` for edit context. The edit route requires event-management permission.

Create `src/server/events/eventEditorSnapshot.ts`. It loads the canonical event-owned fields, divisions and phase settings, event-managed time slots and local resources, organization billing capability, sport template, registration questions, required documents, staff snapshot and revision, immutable rental/template constraints, and the editor revision. It returns all data required to establish persisted draft values before the form mounts.

The snapshot must separate editable values from capability and catalog data. `capabilities.canUseOnlinePayments`, immutable field names, selectable organization fields, and sport defaults are context. They are not draft fields. If a later catalog refresh changes a label or option list, it can update display context but cannot call `setValue` for an editable field.

For create mode, server defaults are explicit in the snapshot. For edit mode, defaults apply only when a persisted value is absent by contract, not when a relation or catalog request is still loading. Return active registration questions only. Include canonical IDs in every child collection.

At the end, a route test must prove that one bootstrap response is sufficient to render an editor with no additional request that can change persisted draft values.

### Milestone 4: Add one transactional configuration save service

Create `src/server/events/eventEditorSave.ts`. It accepts a parsed create or save command and an authenticated actor. For edit, acquire the existing transaction-scoped event advisory lock, load the current snapshot, compare `editorRevision` and `staffRevision`, and return a stable 409 conflict before writes if either revision is stale.

Within one Prisma transaction, validate permissions and immutable constraints, write event-owned scalar configuration, reconcile divisions and phase settings, reconcile event-managed slots and local resources, save active registration questions, and reconcile desired staff state through the existing staff helper. Refactor the staff helper only as needed to accept an existing transaction client. Collect new staff email candidates and send them after commit.

Question reconciliation must be idempotent. Update an existing row only by canonical `id`. Create a row only from a new `clientId`. Return a `clientId` to canonical `id` mapping in the result. Mark removed active questions inactive for history, but never return them in the editor snapshot. Repeating the same canonical command must not create a row.

Use current repository functions behind a narrow adapter where practical. Do not call the public API routes from the server service. Do not let the client provide computed price text, resolved match rules, attendees, relationships, or generated matches.

Return the complete canonical `EventEditorSnapshot` after commit. The client must replace its local snapshot and reset the draft from this response. It must not call `commitDirtyBaseline` with locally normalized values.

Add `POST /api/events/editor` for creation and `PUT /api/events/[eventId]/editor` for editing. Both routes parse the shared strict schemas. Keep the existing event routes operational for non-editor consumers during migration, but stop adding editor features to their broad payloads.

### Milestone 5: Move the form to explicit state ownership

Create `src/app/events/[id]/schedule/components/eventForm/editorTransitions.ts`. Define pure functions for cross-field actions such as `changeEventType`, `changeSport`, `changeScheduleMode`, `changeRegistrationPaymentMode`, `disableRegistrationQuestions`, `changeDivisionMode`, `changePoolPlay`, and `changeOfficialSchedulingMode`. Each transition receives the current draft and returns the next draft plus warnings or fields that require confirmation.

Create a small reducer for presentation state: setup mode, current Simple Setup page, completed pages, expanded sections, and pending confirmation. Presentation state cannot be serialized into the save command. It cannot clear draft values merely because a page is hidden.

Update `EventForm.tsx` to initialize once from `EventEditorSnapshot`. Use `FormProvider` and focused `useWatch` subscriptions inside domain sections. Remove the whole-form `watch()` subscription. Replace normalization effects that call `setValue` with explicit transition calls from user event handlers. Keep asynchronous loading and connection status as context state only.

Move registration questions into the root draft instead of a separate `useState` hook. Use returned canonical IDs after every save. Replace payment mutation effects with server capability display and submit validation. A temporary missing organization object must show loading, not disconnected, and must not change payment mode or price.

Update `page.tsx` so it owns the loaded snapshot, save status, and explicit schedule-action status. Remove `changesEvent`, duplicate dirty flags, and imperative `getDraft` or `commitDirtyBaseline` calls after all consumers move. The form submits a command through one callback and receives a canonical snapshot. Add a left-side Cancel action that discards the current draft and returns to the last canonical snapshot or exits create mode without saving.

At the end, switching between Simple and Advanced Setup ten times must not change the draft fingerprint or dirty state. Opening and closing any section must not change it either.

### Milestone 6: Make timing, rules, and officiating single-source

Add `scheduleEndConstraint DateTime?` and `generatedScheduleEnd DateTime?` to the event and event-template Prisma models. Create a forward migration. For existing rows, backfill fixed-end events with `scheduleEndConstraint = end` and open-ended events with `generatedScheduleEnd = end`. Keep `end` and `noFixedEndDateTime` as compatibility projections while old clients remain, but new editor and scheduler code must not use them as authority.

For fixed mode, the scheduler receives `scheduleEndConstraint` as a hard bound. For generated mode, it receives a calculated planning horizon based on explicit slot windows or recurring-slot capacity. After successful generation, write `generatedScheduleEnd` from the last match. Public event serialization exposes an effective end of `scheduleEndConstraint ?? generatedScheduleEnd` until old fields can be removed.

Create one pure `MatchTimingPolicy` resolver under `src/server/scheduler` with a shared client-safe calculation helper. It derives effective duration from scoring model, segment count, segment length, and break length. Stop using a React effect to persist calculated duration as an independently editable value. If `matchDurationMinutes` must remain for compatibility, write it only as a server-calculated projection and reject a conflicting command.

Enforce the rule hierarchy in one resolver: sport template, event default, division phase override, then match snapshot. Pool controls edit the selected division's preliminary phase. Playoff controls edit its playoff phase. The UI displays the resolved duration and source but submits only editable overrides. Existing generated matches retain `matchRulesSnapshot` until an explicit schedule rebuild.

Use `officialSchedulingMode` as the editable officiating field. Display `TEAM_STAFFING` in both Simple and Advanced Setup when the event type supports it. Derive `doTeamsOfficiate` only for compatibility responses and remove client writes to that field.

### Milestone 7: Separate save and schedule actions

Define explicit UI intents: `SAVE_SETTINGS`, `SAVE_AND_RESCHEDULE`, `REBUILD_BRACKET`, and the initial managed-event publish action. The configuration save always returns its own result. A later schedule action returns its own result and cannot convert a successful configuration save into a generic failure.

For an existing published event, generate a schedule candidate before replacing persisted generated matches. Persist the replacement in a schedule transaction only after generation succeeds. If generation fails, keep the prior matches and locks unchanged. Return a precise error that identifies insufficient slot minutes, field-to-division coverage, participant constraints, or fixed-end limits.

For a newly created league or tournament, create it as unpublished, generate and persist the initial schedule, then publish only after generation succeeds. If generation fails, return the unpublished canonical snapshot and a retryable schedule result. Do not delete the event and do not claim that publication succeeded.

Add focused scheduler tests for two explicit slots separated by one hour. The scheduler must align the next match to the second slot. The gap itself is not an error. If total usable minutes are insufficient, the response must report required and available minutes and the limiting division or resource when known.

### Milestone 8: Remove compatibility paths and finish validation

Completed on 2026-08-10. All web and mobile create/edit entry points use the version-2 editor protocol. The contract-owned projector removes hydrated relation keys before strict parsing. The web create session freezes one command and the server durably replays its canonical result. Mobile uses typed editor sessions and snapshot-based mutation projection.

The broad `POST /api/events` and `PATCH /api/events/{eventId}` authoring mutations, template seed route, legacy authoring DTOs and repository methods, seeded-event navigation, separate editor question/staff writes, and unused compatibility aliases are removed. Retained focused routes have named non-editor callers. Schedule generation remains a separate operation.

The architecture plan records the final route ownership, create-operation receipt contract, mobile projection boundary, staff-delivery warning behavior, verification output, and the unavailable authenticated browser prerequisite.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`. Before each milestone, inspect the working tree and preserve unrelated changes:

    git status --short
    git diff --check

During Milestone 1, add and run focused characterization tests:

    npm test -- --runInBand --runTestsByPath \
      'src/app/events/[id]/schedule/components/eventForm/__tests__/eventEditorRoundTrip.test.ts' \
      'src/server/__tests__/registrationQuestions.test.ts' \
      'src/server/scheduler/__tests__/leagueTimeSlots.test.ts'

During contract and route milestones, run the new focused suites. Use these target paths unless implementation discoveries require a more specific split:

    npm test -- --runInBand --runTestsByPath \
      'src/contracts/__tests__/eventEditor.test.ts' \
      'src/server/events/__tests__/eventEditorSnapshot.test.ts' \
      'src/server/events/__tests__/eventEditorSave.test.ts' \
      'src/app/api/events/editor/__tests__/route.test.ts' \
      'src/app/api/events/[eventId]/editor/__tests__/route.test.ts'

During form migration, run the EventForm and lifecycle suites serially:

    npm test -- --runInBand --runTestsByPath \
      'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' \
      'src/app/events/[id]/schedule/components/eventForm/hooks/__tests__/useEventFormLifecycle.test.ts'

When the Prisma models change, create one named migration, inspect its SQL, validate the schema, and regenerate the Prisma client using the repository's existing Prisma scripts. These database-specific commands are implementation checks, not loop verification commands.


Do not apply the migration to production under this plan unless the user gives separate deployment and database-write authorization.

At every milestone boundary, run:

    npx tsc --noEmit
    npm run lint
    git diff --check

At final validation, run:

    npm run test:ci

For browser validation, use a local test database and an organization manager account. Start the existing development server only if the user has explicitly authorized that process action for the current turn. Exercise `/events/{eventId}/schedule?create=1` and `/events/{eventId}/schedule?mode=edit` at desktop and mobile widths. Capture the event ID, command payload, response revision, and visible result for each acceptance scenario without using production data.

## Validation and Acceptance

The implementation is accepted only when all of the following behavior is proven by automated tests and, where noted, a browser check.

A no-change edit creates no data difference. The initial snapshot and the post-save snapshot are equivalent after excluding revisions and server timestamps. Half length, break length, match policy, division phase rules, price, tax policy, questions, staffing mode, end mode, slots, resources, and immutable constraints remain unchanged.

Dirty detection is deterministic. Opening edit mode, loading catalogs, switching setup presentation, expanding sections, and returning from review do not mark the form dirty. One direct user edit does. Cancel restores the last canonical snapshot and clears dirty state.

Create and edit use the same draft and save-command schemas. Tests cover simple event, league, tournament, weekly event, organization event, rental-backed event, fixed-end schedule, generated-end schedule, single division, multiple divisions, pools, playoffs, dedicated staff, and team staffing.

Saving one new registration question returns one canonical ID. Repeating the same save produces no additional row. Removed questions become inactive history and never appear as duplicate editable questions.

A connected organization permits online pricing based on the bootstrap capability. A loading or incomplete client organization object cannot change payment mode or price. A disconnected organization receives a clear server validation error if it submits online paid registration.

Calculated match duration updates immediately when timing inputs change, but it is derived from one timing policy. Reloading preserves the inputs and produces the same duration. Pool and playoff rule dialogs edit the intended division phase and round-trip through the server.

Team staffing is visible and selectable where supported. Saving and reloading retains `officialSchedulingMode = 'TEAM_STAFFING'`. The scheduler uses the same mode.

Simple Setup in generated-end mode does not require or display a fixed end input. A one-hour gap between valid slot windows causes alignment to the next window, not a generic failure. Insufficient total capacity returns a precise capacity error.

An injected failure in division, slot, question, or staff persistence rolls back the complete configuration save. An email failure after commit does not corrupt saved staff state. A stale editor or staff revision returns 409 with no writes.

If a reschedule fails after settings save, the UI says that settings saved and rescheduling failed. Existing matches remain unchanged. A new managed event remains unpublished until its first schedule succeeds.

TypeScript, lint, focused tests, Prisma validation, and the final CI test command pass. Browser smoke tests show no console error, no missing Save action after a real edit, and no unexpected value changes after reload.

## Idempotence and Recovery

Create bootstrap is read-only and returns one operation ID for one create session. The client stores a frozen command before the first POST. Network, 5xx, and response-loss retries resend that command unchanged. A definitive pre-claim validation or authorization rejection may return to editing; an ambiguous failure must recover the original receipt before any new edit.

The server claims the operation ID atomically, hashes the complete canonical command excluding that ID, and stores the immutable canonical result with status 201 in the same transaction as event, resource, question, and staff persistence. Same actor plus same hash replays the receipt. A different hash returns `CREATE_OPERATION_PAYLOAD_MISMATCH`; a different actor returns `CREATE_OPERATION_CONFLICT`. Failed transactions leave no receipt or domain rows.

Edit saves use complete desired-state commands with editor and staff revisions. Successful saves replace client state from the returned canonical snapshot. Schedule replacement remains candidate-first and transactional; a failed schedule leaves prior matches intact and reports a separate schedule failure.

Compatibility is a clean cutover, not a fallback strategy. Do not reintroduce broad authoring routes, legacy DTOs, seed paths, or request reconstruction from `Event`. Retained focused mutations require a current non-editor caller.

Do not use destructive Git commands. Do not edit or deploy production data as part of implementation validation. Preserve unrelated working-tree changes and stage only files owned by the active milestone.


## Artifacts and Notes

The intended save success shape is equivalent to:

    {
      "contractVersion": 2,
      "createOperationId": "<stable create-session operation ID>",
      "status": "SAVED",
      "snapshot": {
        "eventId": "event_1",
        "editorRevision": "<opaque revision>",
        "staffRevision": "<opaque revision>",
        "draft": { "...": "canonical editable values" },
        "context": { "...": "capabilities and catalogs" }
      },
      "createdIdMap": {
        "questions": { "question_client_1": "question_server_1" }
      }
    }

A revision conflict is equivalent to:

    {
      "error": "Event settings changed. Reload and review the latest values.",
      "code": "EVENT_EDITOR_REVISION_CONFLICT",
      "currentEditorRevision": "<opaque revision>",
      "currentStaffRevision": "<opaque revision>"
    }

A save followed by a failed reschedule is not an exception-shaped total failure. It is equivalent to:

    {
      "save": { "status": "SAVED", "snapshot": { "...": "canonical values" } },
      "schedule": {
        "status": "FAILED",
        "code": "INSUFFICIENT_SLOT_CAPACITY",
        "message": "Settings were saved, but the schedule needs more available field time."
      }
    }

## Interfaces and Dependencies

Use the existing `zod`, `react-hook-form`, Prisma, permission, event-lock, scheduler, and staff-reconciliation infrastructure. Do not add a new state-management dependency in the first implementation.

`src/contracts/eventEditor.ts` must export interfaces equivalent to:

    EventEditorCreateBootstrapSchema
    EventEditorSnapshotSchema
    EventEditorDraftSchema
    SaveEventEditorCommandSchema
    CreateEventEditorCommandSchema
    EventEditorSaveResultSchema
    EventEditorErrorSchema

The create protocol must also expose:

    GET /api/events/editor
    POST /api/events/editor
    src/server/events/eventCreateOperationReplay.ts


`src/server/events/eventEditorSnapshot.ts` must expose:

    loadCreateEventEditorSnapshot(input, session): Promise<EventEditorSnapshot>
    loadExistingEventEditorSnapshot(eventId, session, client?): Promise<EventEditorSnapshot>
    computeEventEditorRevision(snapshotOwnedState): string

`src/server/events/eventEditorSave.ts` must expose:

    createEventFromEditor(command, session): Promise<EventEditorSaveResult>
    saveEventFromEditor(eventId, command, session): Promise<EventEditorSaveResult>

The form boundary must become equivalent to:

    <EventForm
      snapshot={snapshot}
      onSave={(command) => saveCommand(command)}
      onCancel={() => restoreOrExit()}
    />

The form must not accept a hydrated `Event`, emit `Partial<Event>`, expose `getDraft` through an imperative ref, or establish a dirty baseline from locally normalized values after the migration completes.

Plan revision note (2026-08-09): Created the initial architecture-hardening plan after tracing the event editor from bootstrap through form initialization, draft building, client serialization, API validation, repository persistence, question and staff reconciliation, and schedule generation. The initial plan used additive compatibility because the form migration was incomplete.

Plan revision note (2026-08-10): Completed the cross-client clean cutover. Web nested projection, version-2 create bootstrap, durable idempotent create replay, mobile snapshot-based editor sessions, focused-route caller audit, broad authoring-path removal, and final verification are recorded above. Authenticated browser smoke remains blocked by unavailable local Postgres/Docker services.
