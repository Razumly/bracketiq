# Enforce cross-application HTTP contract verification

This ExecPlan is a living document. Maintain it with the requirements in `PLANS.md`.

## Purpose / Big Picture

Prevent a mobile request from reaching `apps/site` with a payload that the server rejects. The backend owns the Event Editor HTTP contract. Mobile must serialize that contract and send it to the running backend in an integration test. Issue planning and coding guidance must make this check visible when a change crosses the site/mobile boundary.

After this work, a required server request field cannot be added silently. The mobile DTO and mapper must carry the field, a focused mobile test must assert the wire shape, and a local mobile-to-site integration test must submit the request to the real API. GitHub Actions CI is out of scope for this issue.

## Progress

- [x] (2026-08-24 01:20Z) Read repository rules, the issue tracker guidance, the site and mobile test seams, and the current CI workflows.
- [x] (2026-08-24 01:20Z) Confirmed that the existing mobile-to-site lifecycle tests are skipped unless `MVP_TEST_BACKEND_URL` and seeded fixtures are available.
- [x] (2026-08-24 01:20Z) Update issue planning and coding guidance for cross-application contracts.
- [x] (2026-08-24 01:20Z) Add `expectedRevisions` to every mobile Event Editor create command path.
- [x] (2026-08-24 01:20Z) Add focused mobile wire-shape assertions.
- [x] (2026-08-24 01:20Z) Run the focused mobile Event Editor integration test against a local backend.
- [x] (2026-08-24 01:20Z) Document the focused local command.
- [x] (2026-08-24 01:20Z) Keep GitHub Actions contract coverage out of this issue; remove the contract job and status gate.
- [x] (2026-08-24 01:20Z) Record final local evidence and retrospective.
- [x] (2026-08-24 01:20Z) Apply the review fixes for local URL safety, server-side provider isolation, and cancellation-safe cleanup.
- [x] (2026-08-24 09:40Z) Bind the mobile isolation probe to the server `DATABASE_URL` hash and reject PostgreSQL target override query parameters.
- [x] (2026-08-24 09:44Z) Complete the final standards and specification review. Keep unrelated scheduling and history changes out of this commit.
- [x] (2026-08-24 09:59Z) Add site-owned app-version response schemas and a named typed mobile isolation-probe client method.

## Surprises & Discoveries

- The mobile integration suite already calls the real Event Editor API through `MobileApiTestSession.createEventThroughEditor`, but its broad lifecycle tests skip when `MVP_TEST_BACKEND_URL` is absent. The required local check now uses `MobileEventEditorApiContractTest`, which fails before the test when the backend or fixtures are unavailable.
- The default Android unit-test task excludes the live-only contract class. Set `MVP_TEST_REQUIRE_BACKEND=1` to include it and keep its setup strict.
- `apps/site/src/contracts/eventEditor.ts` requires `expectedRevisions` for create commands under contract version `3`.
- `EventEditorCreateCommandDto` and its create mapper omit `expectedRevisions`, while the mobile save command already carries revision fields.
- MockEngine tests validate mobile transport behavior without running the server parser. They cannot detect a required server field that the mobile serializer omits.

The required local Event Editor fixture uses individual registration, free payment, and no named staff. The backend runs with `MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1`, so the request does not send external email or push notifications.
- A mobile JVM environment flag does not configure a separately launched backend. The local readiness probe now reads a server-side isolation marker before fixture seeding.
- A PostgreSQL connection string can override its URL authority through query parameters. The test rejects `host`, `hostaddr`, `port`, `socket`, and `connectionString` names, including encoded names, before any seed command runs.


## Decision Log

- Decision: Put issue-creation guidance in `docs/agents/issue-tracker.md`, and put implementation requirements in the root and app coding guidance rather than creating a new issue-creation skill.
  Rationale: The repository already routes issue work through the issue-tracker document. A generic skill would not be loaded by every issue implementation, while the existing source-of-truth and coding documents are already required context.
  Date/Author: 2026-08-22 / Codex

- Decision: Keep MockEngine tests for deterministic mobile behavior, and add a separate real mobile-to-site integration check.
  Rationale: Mock tests are fast and isolate client behavior. They cannot replace an API boundary test. The real integration test proves that the mobile serializer, authentication, server parser, and persistence path agree.
  Date/Author: 2026-08-22 / Codex

- Decision: Keep the contract integration test local for this issue. Do not add or require a GitHub Actions contract job or status gate.
  Rationale: The user needs the live mobile-to-site check for local development now. GitHub workflow coverage can be added later in a separate scope.
  Date/Author: 2026-08-23 / Codex

- Decision: Keep Event Editor contract version `3` and align the current mobile request with the existing required site parser fields.
  Rationale: This change does not alter the site schema or remove compatibility behavior. It restores current mobile compatibility. Released-client fixture coverage and any old-version removal decision remain in issue #53.
  Date/Author: 2026-08-23 / Codex
- Decision: Make local-only boundaries executable in the contract test.
  Rationale: The test can seed data and send notifications. Loopback URL validation, a backend-owned isolation marker, explicit launcher propagation, and bounded non-test-dispatcher cleanup prevent remote data changes, outbound provider calls, and leaked retries.
  Date/Author: 2026-08-23 / Codex
- Decision: Bind the local isolation probe to a database URL hash.
  Rationale: The site process owns the effective `DATABASE_URL`. It returns a SHA-256 hash only for an explicit provider-disabled test probe. Mobile validates its local URL and compares the hash before fixture setup, without exposing database credentials.
  Date/Author: 2026-08-24 09:40Z / Codex

## Outcomes & Retrospective

- Guidance now requires issue-level backend ownership, client consumers, version decisions, and a real mobile-to-site acceptance check.
- Mobile create commands now serialize the required revision object from the bootstrap snapshot. DTO, mapper, gateway, repository, and wire-shape tests cover the field.
- The focused local command passed against an isolated loopback backend at `http://127.0.0.1:3110`. The result had one test, zero skips, zero failures, and zero errors.
- The focused site Event Editor contract and wire-compatibility suites passed. `npx tsc --noEmit` emitted no output.
- The full site suite passed with 873 tests and 4 skipped tests. The full Android debug unit suite passed with `JAVA_TOOL_OPTIONS='-XX:TieredStopAtLevel=1' ./gradlew --no-daemon testDebugUnitTest --continue --console=plain --warning-mode=none`.
- The isolation probe now reports provider state and the server database identity through site-owned response schemas and a named typed mobile client method. The focused live run passed with one executed test, zero skips, zero failures, and zero errors.
- Final review resolved the response seam ownership, contract terminology, and Progress timestamp findings. Unrelated scheduling and history files remain unstaged.

## Context and Orientation

`apps/site` is the source of truth for HTTP request and response contracts. The Event Editor create schema is in `apps/site/src/contracts/eventEditor.ts`. The app-version response schemas are in `apps/site/src/contracts/appVersion.ts`. The app-version route is in `apps/site/src/app/api/app-version/route.ts`. The mobile app-version DTO and named isolation-probe client method are in `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/AppVersionDtos.kt` and `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/MvpApiClient.kt`. The Event Editor route is in `apps/site/src/app/api/events/editor/route.ts`. The mobile DTO and JSON encoder are in `apps/mobile/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventEditorDtos.kt`. The mobile create mapper is in `apps/mobile/core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventEditorSessionMapper.kt`. The Android integration helper is in `apps/mobile/composeApp/src/androidUnitTest/kotlin/com/razumly/mvp/testing/MobileApiIntegrationSupport.kt`.

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

Next, add a dedicated `MobileEventEditorApiContractTest` for the local live seam. Its setup must fail when the backend URL or seeded fixtures are unavailable. It must not call JUnit assumptions. Use a provider-independent One-Time Event fixture with individual registration, free payment, and no named staff. Keep the existing broader lifecycle tests optional.

Finally, document the local backend setup and focused Gradle command in `README.md`. Do not add a GitHub Actions contract job or status gate for this issue.

## Concrete Steps

Run site commands from `apps/site` and mobile commands from `apps/mobile`.

1. Update the guidance files and mobile DTO, mapper, helper, and tests.
2. Run `./gradlew :core:network:allTests :core:repository-impl:allTests` or the closest available focused Gradle tasks for the changed modules.
3. From `apps/site`, run the Event Editor contract and wire-compatibility tests and the TypeScript check:

       npm test -- --runInBand src/app/api/events/__tests__/editorContractRoutes.test.ts src/contracts/__tests__/eventEditor.test.ts src/server/events/__tests__/eventEditorWireCompatibility.test.ts
       npx tsc --noEmit

   Expected result: the focused Event Editor suites pass, and `tsc` emits no output.
4. From `apps/mobile`, start and verify the local backend with outbound providers disabled:

       MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 MVP_BACKEND_PORT=3100 ./scripts/ensure-local-backend.sh
       curl -fsS 'http://127.0.0.1:3100/api/app-version?platform=ANDROID&versionName=0.0.0&buildNumber=0'

   From `apps/site`, prepare the same non-production Compose database. Use the launcher output as the database URL:

       COMPOSE_DATABASE_URL="$(../mobile/scripts/ensure-local-backend.sh --print-database-url)"
       npm run prisma:check
       DATABASE_URL="$COMPOSE_DATABASE_URL" DATABASE_URL_LIVE="$COMPOSE_DATABASE_URL" npm run migrate:deploy
       DATABASE_URL="$COMPOSE_DATABASE_URL" DATABASE_URL_LIVE="$COMPOSE_DATABASE_URL" npm run seed:dev

   Expected result: the launcher reports the backend as ready, the health request returns JSON, and the migration and seed commands exit with code 0.
5. From `apps/mobile`, run:

       MVP_TEST_DISABLE_OUTBOUND_PROVIDERS=1 \
       MVP_TEST_BACKEND_URL=http://127.0.0.1:3100 \
       MVP_TEST_DATABASE_URL="$(./scripts/ensure-local-backend.sh --print-database-url)" \
       MVP_TEST_ALLOW_DB_SEED=1 \
       MVP_TEST_REQUIRE_BACKEND=1 \
       JAVA_TOOL_OPTIONS='-XX:TieredStopAtLevel=1' \
       ./gradlew --no-daemon :composeApp:testDebugUnitTest \
       --rerun-tasks \
       --tests 'com.razumly.mvp.eventDetail.MobileEventEditorApiContractTest.given_mobile_editor_create_command_when_sent_to_site_then_event_is_persisted' \
       --stacktrace

   Expected result: one executed test, zero skipped tests, zero failures, and a persisted Event returned after mobile reload.
6. Remove the prior GitHub Actions contract job and status gate. Do not add replacement workflow coverage for this issue.

## Validation and Acceptance

The mobile unit tests must pass and must fail if `expectedRevisions` is removed from the DTO or mapper. The site contract tests and TypeScript check must pass. The focused Android integration test must send a request through `MvpApiClient` to `POST /api/events/editor` and receive a successful Event Editor create response from the running site backend when the documented local command is used.

A successful implementation prevents the original failure: the mobile client no longer receives HTTP 400 `INVALID_EDITOR_COMMAND` for a missing `expectedRevisions` field.

## Idempotence and Recovery

- The local setup can be rerun against the same non-production Compose database. The launcher reapplies tracked migrations, `seed:dev` uses the repository's `--skip-reset` mode, and the focused test removes its Event while the durable create-operation receipt remains to protect delayed retries. If backend startup fails, inspect the site log, verify the effective `DATABASE_URL`, and rerun the launcher before the migration and seed commands. Do not point the integration test at a production database.

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

2026-08-23: The user changed the scope to local testing only. The plan no longer includes a GitHub Actions contract job or status gate. The focused real API check remains required for local verification.
