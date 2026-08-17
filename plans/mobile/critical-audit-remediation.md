# Remediate the critical mobile audit findings

This ExecPlan is a living document maintained according to `PLANS.md`. It covers the critical findings in the cross-repository audit that belong to `mvp-app`; the corresponding server fixes are tracked in `mvp-site/docs/plans/critical-audit-remediation.md`.

## Purpose / Big Picture

After this work, Android upgrades retain local data and pending scoring operations, legal and payment flows fail closed, profile and event patches do not overwrite unrelated data, the match outbox is ordered and recoverable, and the identified event, refund, rental, notification, and scoring UI defects are corrected. The result is demonstrated with focused tests, the full Android JVM suite, an installable debug build, and an emulator smoke test of the affected reachable flows.

## Progress

- [x] (2026-07-10) Read the repository instructions and audit every critical mobile finding.
- [ ] Remove destructive Room startup behavior and serialize/reconcile the match outbox.
- [ ] Correct legal consent, patch DTO, logout, signing, refund, rental, and checkout boundaries.
- [ ] Correct event creation, loading overlay, set scoring, and notification behavior.
- [ ] Add focused regression coverage and run the complete Android JVM test suite.
- [ ] Build, install, and manually smoke test the current Android app.
- [ ] Reconcile the audit status and commit without pushing.

## Surprises & Discoveries

- Observation: Android currently deletes the database before Room can evaluate its registered migrations.
  Evidence: `RoomDBModule.android.kt` calls `deleteDatabaseIfSchemaVersionChanged` and also enables destructive fallback.

## Decision Log

- Decision: Treat the `mvp-site` API and Prisma schema as authoritative for every changed mobile contract.
  Rationale: `AGENTS.md` explicitly requires mobile DTOs and endpoints to track the web backend.
  Date/Author: 2026-07-10 / Codex

- Decision: Ignore iOS-only work in this remediation.
  Rationale: The user explicitly authorized ignoring iOS and requested Android/browser manual verification.
  Date/Author: 2026-07-10 / Codex

## Outcomes & Retrospective

Implementation is in progress. Focused server regressions are already green; mobile outcomes will be recorded after the Android suite and emulator pass.

## Context and Orientation

The Kotlin Multiplatform application is under `composeApp`. Shared production logic is in `composeApp/src/commonMain`, Android-only Room setup is in `composeApp/src/androidMain`, and shared/JVM tests are in `composeApp/src/commonTest` and `composeApp/src/androidUnitTest`. Room is the local source of truth. `MatchOperationOutboxEntry` is the durable queue for offline scoring changes, so upgrade and synchronization changes must preserve and order those rows. The backend source of truth is the adjacent `mvp-site` repository.

## Plan of Work

First remove pre-open deletion and destructive Room fallback, using the registered migration graph and a clear failure for unsupported histories. Make match enqueue allocation and draining single-owner operations, distinguish retryable transport failures from terminal server rejection, and stop terminal rows from overlaying authoritative matches or blocking later rows. Preserve the repository-applied finalized match in the component.

Next narrow user updates to their intended profile or notification fields and introduce explicit JSON null emission for intentionally cleared patch fields. Order logout cleanup directly instead of depending on races between independent flows. Show the authoritative terms version and canonical URL. Require exact signing-template matches and block mandatory-document purchases without a usable matching signing step.

Then preserve configured payment plans during event creation, require rental ranges to be covered by one canonical availability slot, maintain one checkout result owner, display the server refund scope snapshot, consume pointer input in the global loading overlay, implement canonical win-by-two scoring, and pass composed notification content to the correct event topic.

Each behavior receives a focused regression test. Run the complete Android JVM suite after focused tests, build the debug APK, install it on the available emulator, launch it, inspect the UI hierarchy, and exercise reachable critical flows without using coordinate guesses.

## Concrete Steps

From `C:\Users\samue\StudioProjects\mvp-app`, run focused tests with `./gradlew :composeApp:testDebugUnitTest --tests <test-class>`. After focused tests pass, run `./gradlew :composeApp:testDebugUnitTest`, then `./gradlew :composeApp:assembleDebug`. Install the produced APK with `adb install -r`, launch its declared activity, and capture UI hierarchy and logcat evidence.

## Validation and Acceptance

Acceptance requires every named critical finding to have a code fix and regression coverage. The Android unit suite must pass, the debug APK must build and install, and launch must not delete an existing database or crash. Reachable UI checks must confirm the loading scrim blocks controls, required signature errors remain blocking, entered notification content is preserved, and corrected payment/refund details render when test data permits. Server-side browser smoke tests must confirm the protected endpoints reject unauthorized or unsigned operations.

## Idempotence and Recovery

All test and build commands are repeatable. Database migrations are additive and must never delete the on-device database. If a focused test exposes an older fixture contract, update the fixture to emulate the production repository rather than weakening the production invariant. Do not reset or discard unrelated working-tree changes.

## Artifacts and Notes

The audit inventory and evidence are in `C:\Users\samue\Documents\Code\mvp-site\docs\code-audit\README.md`. The final test transcripts and emulator observations will be summarized here at completion.

## Interfaces and Dependencies

Room database construction remains in `RoomDBModule.android.kt`. Match queue ownership stays within `MatchRepository`; callers receive the locally applied `MatchMVP`. Patch serialization continues to use kotlinx.serialization but must explicitly represent field presence. Payment Sheet remains the platform payment UI, while shared components maintain a single immutable owner for each result. Push routing continues through `PushNotificationsRepository` using the canonical event type rather than a hard-coded tournament flag.

Revision note (2026-07-10): Created the mobile remediation plan after reading `AGENTS.md`, `PLANS.md`, and the complete critical audit inventory.
