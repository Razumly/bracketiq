# Enforce cross-application HTTP contract verification

This ExecPlan is a living document. Maintain it with the requirements in `PLANS.md`.

## Purpose / Big Picture

Prevent a mobile request from reaching `apps/site` with a payload that the server rejects. The backend owns the Event Editor HTTP contract. Mobile must serialize that contract and send it to the running backend in an integration test. Issue planning and coding guidance must make this check visible when a change crosses the site/mobile boundary.

After this work, a required server request field cannot be added silently. The mobile DTO and mapper must carry the field, a focused mobile test must assert the wire shape, and a mobile-to-site integration test must submit the request to the real API. CI must run that integration test when site or mobile contract code changes.

## Progress

- [x] (2026-08-22) Read repository rules, the issue tracker guidance, the site and mobile test seams, and the current CI workflows.
- [x] (2026-08-22) Confirmed that the existing mobile/backend lifecycle tests are skipped unless `MVP_TEST_BACKEND_URL` and seeded fixtures are available.
- [x] Update issue planning and coding guidance for cross-application contracts.
- [x] Add `expectedRevisions` to every mobile Event Editor create command path.
- [x] Add focused mobile wire-shape assertions.
- [ ] Run the existing mobile Event Editor integration test against a local backend. Blocked by the repository runtime authorization rule.
- [x] Add the integration test to CI with an ephemeral Postgres-backed site server.
- [x] Record final evidence and retrospective.

## Surprises & Discoveries

- The mobile integration suite already calls the real Event Editor API through `MobileApiTestSession.createEventThroughEditor`, but its tests skip when `MVP_TEST_BACKEND_URL` is absent. The default mobile CI job does not set that variable.
- `apps/site/src/contracts/eventEditor.ts` requires `expectedRevisions` for create commands under contract version `3`.
- `EventEditorCreateCommandDto` and its create mapper omit `expectedRevisions`, while the mobile save command already carries revision fields.
- MockEngine tests validate mobile transport behavior without running the server parser. They cannot detect a required server field that the mobile serializer omits.

## Decision Log

- Decision: Put issue-creation guidance in `docs/agents/issue-tracker.md`, and put implementation requirements in the root and app coding guidance rather than creating a new issue-creation skill.
  Rationale: The repository already routes issue work through the issue-tracker document. A generic skill would not be loaded by every issue implementation, while the existing source-of-truth and coding documents are already required context.
  Date/Author: 2026-08-22 / Codex

- Decision: Keep MockEngine tests for deterministic mobile behavior, and add a separate real mobile-to-site integration gate.
  Rationale: Mock tests are fast and isolate client behavior. They cannot replace an API boundary test. The real integration test proves that the mobile serializer, authentication, server parser, and persistence path agree.
  Date/Author: 2026-08-22 / Codex

- Decision: Run the integration gate in CI with a disposable Postgres service and seeded users.
  Rationale: The repository already provides `seed:dev`, the Android integration harness, and a local backend URL override. A disposable service avoids production data and makes the gate repeatable.
  Date/Author: 2026-08-22 / Codex

## Outcomes & Retrospective

- Guidance now requires issue-level backend ownership, client consumers, version decisions, and a real client-to-backend acceptance check.
- Mobile create commands now serialize the required revision object from the bootstrap snapshot. DTO, mapper, gateway, repository, and wire-shape tests cover the field.
- CI now detects site and mobile contract paths, starts a disposable site backend, runs the focused Android integration test, and fails the mobile gate when that job fails.
- Focused verification passed: the mobile DTO, mapper, gateway, and repository HTTP tests passed; the site Event Editor contract suite passed; the mobile workflow YAML parsed and included the contract gate.
- The local real-backend scenario has no result. The repository rule requires explicit authorization before runtime state changes, so this session did not continue that scenario.

## Context and Orientation

`apps/site` is the source of truth for HTTP request and response contracts. The Event Editor create schema is in `apps/site/src/contracts/eventEditor.ts`. The route is `apps/site/src/app/api/events/editor/route.ts`. The mobile DTO and JSON encoder are in `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt`. The mobile create mapper is in `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapper.kt`. The Android integration helper is in `apps/mobile/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt`.

A contract test is a test that checks the exact request or response shape at an application boundary. A mobile-to-site integration test is stronger: it creates the request with the mobile HTTP client and sends it to a running site backend. A MockEngine test is not an integration test because it replaces the server with a fake response.

The Event Editor create command has contract version `3`. The site schema requires this shape:

    {
      "contractVersion": 3,
      "createOperationId": "...",
      "expectedRevisions": {
        "editorRevision": "...",
        "staffRevision": null,
        "scheduleRevision": "..."
      },
      "draft": { ... },
      "completion": { "mode": "CREATE_ONLY" }
    }

The field must remain required because the server uses it to prevent stale create operations. The mobile client must send the values from the create bootstrap snapshot.

## Plan of Work

First, update `docs/agents/issue-tracker.md` with a planning rule for any issue that changes an API or a site/mobile flow. The issue must name the backend contract owner, list all client consumers, state the contract version decision, and include an acceptance criterion that sends a client-produced request to the backend. Add a rule that a required field cannot be added under an unchanged version without updating all supported clients in the same workstream.

Next, update `AGENTS.md`, `apps/site/CODING_STANDARDS.md`, and `apps/mobile/AGENTS.md` with concise cross-application compatibility rules. Keep the issue-planning rule in the issue-tracker document and the code rule in the coding guidance. Do not duplicate a long explanation across files.

Next, add `EventEditorExpectedCreateRevisionsDto` and the `expectedRevisions` field to `EventEditorCreateCommandDto`. Populate it in `EventEditorSessionMapper.toCreateCommand` from `session.snapshot.editorRevision`, `session.snapshot.staffRevision`, and `session.snapshot.scheduleState.revision`. Populate it in the Android integration helper from the create bootstrap snapshot. Update all test constructors and JSON fixtures.

Next, add focused assertions to the mobile DTO and mapper tests. The assertions must prove that the encoded request includes all three revision keys, including an explicit JSON null for a missing staff revision, and that the mapper takes the values from the bootstrap snapshot.

Next, add or refine a focused Android integration test that creates a One-Time Event through `MobileApiTestSession.createEventThroughEditor` and asserts a successful persisted Event. Keep the existing broader lifecycle tests. The focused test must remain skipped locally when no backend URL is configured, but it must be selected by the CI integration job.

Finally, extend `.github/workflows/mobile-ci.yml` with a backend integration job. Start a disposable Postgres service, install site dependencies, apply migrations, seed the E2E users, start the site development server on a local port, wait for the port, and run the focused Android integration test with `MVP_TEST_BACKEND_URL` and `MVP_TEST_ALLOW_DB_SEED=1`. Run the existing unit job separately. Include site API and Prisma paths in change detection so backend contract changes run the mobile integration gate.

## Concrete Steps

Run site commands from `apps/site` and mobile commands from `apps/mobile`.

1. Update the guidance files and mobile DTO, mapper, helper, and tests.
2. Run `./gradlew :core:network:allTests :core:repository-impl:allTests` or the closest available focused Gradle tasks for the changed modules.
3. Run the site contract test and type-check from `apps/site`.
4. Start the disposable local site backend with the repository test database settings. Apply migrations and run `npm run seed:dev`.
5. Run the focused Android test with `MVP_TEST_BACKEND_URL=http://127.0.0.1:<port>` and `MVP_TEST_ALLOW_DB_SEED=1`. Observe a passing create request and persisted Event.
6. Run the mobile CI workflow checks locally where possible. Inspect the final workflow diff for correct working directories and environment variables.

## Validation and Acceptance

The mobile unit tests must pass and must fail if `expectedRevisions` is removed from the DTO or mapper. The site contract tests and TypeScript check must pass. The focused Android integration test must send a request through `MvpApiClient` to `POST /api/events/editor` and receive a successful Event Editor create response from the running site backend. The CI workflow must run that integration test instead of silently skipping it when site or mobile contract paths change.

A successful implementation prevents the original failure: the mobile client no longer receives HTTP 400 `INVALID_EDITOR_COMMAND` for a missing `expectedRevisions` field.

## Idempotence and Recovery

The mobile and site changes are additive and can be reapplied safely. The integration job uses disposable database state. If local backend startup fails, inspect the site log, verify `DATABASE_URL`, apply migrations, and rerun the seed command. Do not point the integration test at a production database.

## Artifacts and Notes

Keep focused test output and the integration request result in the completion report. Do not commit generated build output, test databases, or server logs.

## Interfaces and Dependencies

The final mobile interface must include:

    @Serializable
    data class EventEditorExpectedCreateRevisionsDto(
        val editorRevision: String,
        val staffRevision: String?,
        val scheduleRevision: String,
    )

`EventEditorCreateCommandDto` must contain `expectedRevisions: EventEditorExpectedCreateRevisionsDto`. The site interface remains `createEventEditorCommandSchema` and must continue to require the same keys under the current contract version.

## Revision Note

2026-08-22: Created this plan after confirming that the existing mobile/backend integration tests were opt-in and that the mobile create DTO omitted a required server revision field. The plan chooses a layered defense: issue planning guidance, explicit version compatibility rules, focused mobile wire tests, and a CI-run real API integration test.
