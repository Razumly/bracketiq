# Fix the mobile event editor save failure

This ExecPlan is a living document. It follows `PLANS.md` in the app repository. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while work proceeds.

## Purpose / Big Picture

A mobile event create request currently reaches `POST /api/events/editor` and receives HTTP 500 with `EDITOR_SAVE_FAILED`. The response hides the server failure that prevents event creation. After this work, the same event-create path will persist a valid editor draft, or it will return a typed, actionable validation response instead of a generic 500. The Android create form must remain usable after a failure and a retry must use the current form state.

The work is isolated in two clean sibling worktrees created from the current repository heads:

- App: `/Users/elesesy/StudioProjects/mvp-app-editor-save-500`, branch `codex/fix-editor-save-500`.
- Backend: `/Users/elesesy/StudioProjects/mvp-site-editor-save-500`, branch `codex/fix-editor-save-500`.

The backend repository is the source of truth for the editor request contract and persistence behavior. The mobile repository owns the request mapper and the create-form retry state.

## Progress

- [x] (2026-08-11) Inspect the dirty original repositories without changing them.
- [x] (2026-08-11) Create clean app and backend worktrees on `codex/fix-editor-save-500`.
- [x] (2026-08-11) Create this execution plan in the isolated app worktree.
- [x] (2026-08-11) Reproduce the editor failures with representative mobile commands.
- [x] (2026-08-11) Identify contract and persistence-boundary failures from server evidence.
- [x] (2026-08-11) Confirm the mobile command fields against the backend editor contract.
- [x] (2026-08-11) Fix the backend contract and staff error mapping.
- [x] (2026-08-11) Return actionable typed errors for expected invalid input.
- [x] (2026-08-11) Add regression tests for OFF staffing mode and invalid staff input.
- [x] (2026-08-11) Run focused backend and mobile tests.
- [x] (2026-08-11) Exercise valid and invalid event creation against the isolated backend.
- [x] (2026-08-11) Record final outcomes and remaining risk.

## Surprises & Discoveries

The reported 500 hid a domain validation failure in staff reconciliation. Organization events reject assistant hosts and officials that are not active members of the selected organization. `EventStaffInputError` was thrown after event persistence began, but the editor route only recognized `EditorInputError`, so the client received `EDITOR_SAVE_FAILED`.

The same mobile create payload can use `officialSchedulingMode: "OFF"`. The backend contract and adapter accepted only `SCHEDULE`, `STAFFING`, and `TEAM_STAFFING`, which caused a separate `INVALID_EDITOR_COMMAND` 400 before persistence.

The isolated live server accepted valid mobile creates with HTTP 201 after both fixes. Invalid organization staff now returns HTTP 400 with `INVALID_EDITOR_INPUT` and a corrective message.

## Decision Log

- Decision: Use separate sibling worktrees for both repositories instead of changing the dirty original checkouts.
  Rationale: The mobile request crosses the backend editor contract and the current checkouts contain unrelated user changes. An isolated pair prevents accidental edits or test contamination.
  Date/Author: 2026-08-11 / Codex.

- Decision: Fix the first failing operation at its source. Do not make the route return HTTP 200 or suppress a transaction error.
  Rationale: A generic success response would hide partial or missing event persistence. Expected user input errors must be typed; unexpected infrastructure errors must remain failures with useful server evidence.
  Date/Author: 2026-08-11 / Codex.

- Decision: Preserve the existing editor contract unless the captured payload proves a contract mismatch.
  Rationale: `mvp-site/src/contracts/eventEditor.ts` is the cross-project source of truth. Any payload change must update both the backend contract behavior and the mobile mapper with a regression.
  Date/Author: 2026-08-11 / Codex.

- Decision: Map staff domain validation to `EditorInputError` inside the transaction boundary.
  Rationale: The transaction must roll back, while the route must return a client-correctable 400.
  Date/Author: 2026-08-11 / Codex.

- Decision: Add `OFF` to the backend editor contract and adapter.
  Rationale: The mobile mapper already emits this canonical mode when no official staffing is used.
  Date/Author: 2026-08-11 / Codex.

## Outcomes & Retrospective

Focused backend tests passed: 23 tests in the isolated worktree. The original dirty backend also passed 24 editor route/save/contract tests plus 14 adapter round-trip tests after the same production changes were applied.

Focused mobile tests passed: mapper and create-component unit tests, plus all 3 live `EventLifecycleMobileApiIntegrationTest` tests. The valid create smoke returned HTTP 201. The invalid staff smoke returned HTTP 400 with `INVALID_EDITOR_INPUT`.

Remaining risk: unexpected infrastructure failures still use the existing generic HTTP 500 envelope. The original app and backend checkouts remain dirty with unrelated user changes; the fix is present in the isolated branches and the corresponding production changes were applied to the original backend without resetting those changes.

## Context and Orientation

The mobile create flow is implemented in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`. It prepares the event, fields, and time slots, creates an `EventEditorMutation`, and calls `EventEditorSessionMapper.toCreateCommand` before invoking the event repository.

The mobile network path is implemented in `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorRemoteGateway.kt`. It sends the serialized command to `api/events/editor` and wraps non-success responses in `EventEditorApiException`.

The backend route is `src/app/api/events/editor/route.ts` in `mvp-site`. It parses the command with `parseCreateEventEditorCommand`, calls `createEventEditor`, and converts unknown exceptions to the generic `EDITOR_SAVE_FAILED` response.

The backend transaction is in `src/server/events/eventEditorSave.ts`. `createEventEditor` claims an idempotent create operation, loads a create snapshot, calls `saveWithinTransaction`, and then performs post-commit delivery and notification work. `saveWithinTransaction` maps the editor draft with `editorDraftToLegacyEvent`, calls `upsertEventFromPayload` in a transaction, reconciles registration questions, and reconciles staff.

The persistence implementation is `src/server/repositories/events.ts`. It writes the event, fields, time slots, divisions, teams, tags, and related records. Prisma schema definitions are in `prisma/schema.prisma`. Backend editor contract definitions are in `src/contracts/eventEditor.ts`.

A route-level 500 can come from database persistence, question reconciliation, staff reconciliation, snapshot loading, or another unexpected error. A post-commit notification failure is already logged and suppressed in the create flow, so the initial focus is the transaction and its immediate result loading.

## Plan of Work

First, reproduce the request in the isolated environment. Use the backend server logs and, when needed, temporary test diagnostics to capture the complete exception and the command section that caused it. Do not log authentication tokens or unrelated personal data. If the existing Android integration harness can reach the backend, run the smallest create case and preserve the response body and server stack trace.

Next, compare the captured command against `parseCreateEventEditorCommand` and the create snapshot defaults. Check nested records, nullable values, enum values, IDs, date and time representations, field and division assignments, payment links, staff records, and calculated match timing. Compare the mobile serializer in `EventEditorSessionMapper` with the TypeScript contract and the backend adapter.

Then, fix the failing operation. If the request is invalid, add a precise `EditorInputError` at the boundary that can determine the problem and return HTTP 400 with the field or reason. If the request is valid but persistence fails, correct the database mapping or transaction operation and keep the transaction atomic. Do not add a compatibility fallback that can silently persist the wrong event.

Update route error handling only after the root cause is known. Expected domain failures must map to a stable typed response that the mobile client can show. Unexpected failures must retain HTTP 500, but server logs should include the operation ID and event ID without exposing secrets. The mobile error path should preserve the existing form state and operation ID for retry.

Add tests that fail before the fix and pass after it. Backend tests should cover the exact invalid or persistence case and assert transaction behavior. Mobile tests should assert the generated command or retry state when the bug crosses the client boundary. Keep tests deterministic and use existing test fixtures.

## Concrete Steps

Run commands from the isolated repositories.

1. Confirm the isolated branches and clean state:

    `git -C /Users/elesesy/StudioProjects/mvp-app-editor-save-500 status --short --branch`

    `git -C /Users/elesesy/StudioProjects/mvp-site-editor-save-500 status --short --branch`

2. Run the existing focused backend editor tests from `/Users/elesesy/StudioProjects/mvp-site-editor-save-500`:

    `npm test -- --runInBand src/contracts/__tests__/eventEditor.test.ts src/server/events/__tests__/eventEditorSave.test.ts src/server/repositories/__tests__/events.upsert.test.ts`

3. Run focused mobile mapper and create tests from `/Users/elesesy/StudioProjects/mvp-app-editor-save-500` with JDK 17:

    `./gradlew :core:repository-impl:testDebugUnitTest --tests 'com.razumly.mvp.core.data.repositories.EventEditorSessionMapperTest'`

    `./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventCreate.DefaultCreateEventComponentTest'`

4. For live reproduction, start the isolated backend on a port that does not disturb an existing server. Use the repository's `npm run dev:plain -- --port 3001` command from the backend worktree after its dependencies and environment are available. Configure the mobile test base URL or request target to use that port. Read server output after the create request and capture the first underlying error.

5. After the fix, repeat the focused tests and run one end-to-end create request. A successful request must return HTTP 201 with a saved editor snapshot and a canonical event. A rejected request must return HTTP 400 or 409 with a specific editor code, not `EDITOR_SAVE_FAILED`.

## Validation and Acceptance

The fix is accepted when all of these conditions are true:

- A representative mobile create command no longer receives the reported HTTP 500 for the captured cause.
- The backend transaction either saves the complete event atomically or rolls back without leaving a create-operation receipt that claims success.
- Expected invalid input returns a precise status and error code with enough information to correct the form.
- A failed mobile create leaves editable fields and time slots unchanged, and a retry reuses the operation ID while serializing current state.
- Backend focused tests pass, including the new regression for the observed cause.
- Mobile focused tests pass, including the command or retry regression when applicable.
- The isolated worktrees contain only the changes required for this fix and this plan.

## Idempotence and Recovery

All test changes must use mocks or isolated fixtures unless a live test explicitly creates and deletes data. Do not reset either original checkout. If the isolated live server cannot start because environment variables or database access are unavailable, finish all source and unit-test work, record the exact missing prerequisite, and do not claim end-to-end proof.

The create operation ID is idempotency state. Keep it stable across retries. Do not delete or bypass the operation claim to hide a duplicate request. If a transaction fails, the operation claim must not be presented as a saved result.

## Artifacts and Notes

Primary artifacts are the backend persistence or contract fix, route error mapping if needed, the mobile mapper or retry fix if needed, focused regression tests, and this plan. Keep final evidence concise and include exact test counts and the observed end-to-end response.

## Interfaces and Dependencies

The existing integration points remain the contract:

- `parseCreateEventEditorCommand` validates the request in `mvp-site/src/contracts/eventEditor.ts`.
- `createEventEditor` and `saveWithinTransaction` in `mvp-site/src/server/events/eventEditorSave.ts` own create persistence and transaction behavior.
- `upsertEventFromPayload` in `mvp-site/src/server/repositories/events.ts` owns event and related-record persistence.
- `EventEditorSessionMapper.toCreateCommand` in `mvp-app/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapper.kt` owns the mobile command shape.
- `DefaultCreateEventComponent.createEventAfterPayment` in `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt` owns mobile create and retry state.

Use the existing Kotlin serialization, Ktor, TypeScript, Zod, Prisma, Jest, and Gradle test infrastructure. Do not add a runtime dependency for error handling.

Plan revision note (2026-08-11): Created in the isolated worktree after the reported HTTP 500. The plan intentionally starts with server evidence because the route currently collapses unrelated failures into one response.
