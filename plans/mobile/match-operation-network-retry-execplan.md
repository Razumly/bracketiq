# Persist and retry match operations when network returns

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Officials can end a half, start the next period, change score, or record an incident from a phone, Wear OS watch, or watchOS watch. Those actions must not depend on the backend being reachable at the exact moment the official taps the button. After this change, match operations are applied locally first, kept in a durable pending queue where needed, retried immediately when created, and retried again when the operating system reports that network access is available. A user can verify the behavior by forcing an operation to fail, restoring network access, and observing that the pending operation drains without requiring another match action.

## Progress

- [x] (2026-06-09T03:28:36Z) Inspected the current local-first match operation paths for Android phone, Wear OS, and watchOS.
- [x] (2026-06-09T03:28:36Z) Confirmed Android phone and Wear OS already persist pending operations, but only retry immediately after enqueue or when imported from the paired device.
- [x] (2026-06-09T03:28:36Z) Confirmed watchOS keeps pending patch bodies only in memory, so failed operations can be lost when the watch app exits.
- [x] (2026-06-09T03:28:36Z) Add Android phone network-available retry scheduling that drains the Room match operation outbox only when pending operations exist.
- [x] (2026-06-09T03:28:36Z) Add Wear OS network-available retry scheduling that drains the SharedPreferences match operation outbox only when pending operations exist.
- [x] (2026-06-09T03:28:36Z) Replace watchOS in-memory pending patches with a persisted operation outbox and add `NWPathMonitor` retry triggers.
- [x] (2026-06-09T03:28:36Z) Apply persisted watchOS pending operations over freshly loaded schedules so local watch values still take precedence while operations are waiting to sync.
- [x] (2026-06-09T03:38:36Z) Validate with focused Gradle tests/builds and an Xcode/watchOS build.

## Surprises & Discoveries

- Observation: The Android phone outbox query already treats `FAILED` and `SYNCING` rows as retryable.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/daos/MatchOperationOutboxDao.kt` selects statuses `PENDING`, `FAILED`, and `SYNCING` in `getPendingOperations`.
- Observation: Wear OS uses a parallel SharedPreferences outbox and also treats `FAILED` and `SYNCING` as retryable.
  Evidence: `wearApp/src/main/java/com/razumly/mvp/wear/data/WearMatchOperationStore.kt` includes those statuses in `pendingOperations`.
- Observation: watchOS has no durable outbox.
  Evidence: `iosApp/watchApp/WatchMatchRepository.swift` stores `pendingPatchBodiesByMatchId` in memory.
- Observation: The watchOS target is manually maintained in `iosApp/iosApp.xcodeproj/project.pbxproj`.
  Evidence: Adding `WatchMatchOperationStore.swift` required adding both a `PBXFileReference` and a `PBXBuildFile` entry for the `MVPWatch` sources build phase.

## Decision Log

- Decision: Use OS reachability notifications as retry triggers, not as the source of truth for whether an operation is safe to enqueue.
  Rationale: Enqueueing must always be local-first. Reachability is only a hint that it is worth draining the pending queue.
  Date/Author: 2026-06-09 / Codex.
- Decision: Keep immediate retry after enqueue and add network-available retry.
  Rationale: Immediate retry handles the common online case; network callbacks handle recovery after offline or transient failures.
  Date/Author: 2026-06-09 / Codex.
- Decision: Do not add a visible manual "network access" flag as part of this implementation.
  Rationale: A manual flag can drift from actual OS connectivity. The code should derive connectivity from platform APIs and optionally expose sync state later if the UI needs it.
  Date/Author: 2026-06-09 / Codex.

## Outcomes & Retrospective

Implemented the pending-operation retry pipeline across Android phone, Wear OS, and watchOS. Android phone and Wear OS now register OS network callbacks and drain pending outboxes only when retryable operations exist. watchOS now persists match operation payloads with client operation metadata, drains them on network availability, login/bootstrap, and operation creation, and overlays pending local operations onto schedule loads. Validation passed with `./gradlew :wearApp:test :wearApp:assembleDebug :composeApp:compileDebugKotlin`, `MVPWatch` build/run on the watchOS simulator, and `git diff --check`.

## Context and Orientation

The repository has three relevant clients. The Android phone app lives under `composeApp`. Its match repository is `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`, and its durable Room outbox is represented by `MatchOperationOutboxEntry` and `MatchOperationOutboxDao`. "Outbox" means a local queue of operations that still need to be sent to the backend. The Wear OS app lives under `wearApp`. Its match repository is `wearApp/src/main/java/com/razumly/mvp/wear/data/WearMatchRepository.kt`, and its outbox is `WearMatchOperationStore`, backed by Android `SharedPreferences`. The watchOS app lives under `iosApp/watchApp`. Its current repository, `WatchMatchRepository`, applies local state optimistically but only keeps failed patch bodies in memory.

Android and Wear OS both need an app-level object that listens for OS network availability and calls the existing pending-operation drain function. watchOS needs a small persisted outbox type plus a network monitor using `NWPathMonitor`.

## Plan of Work

First, add a focused Android phone scheduler in `composeApp/src/androidMain/kotlin/com/razumly/mvp/core/auth/MatchOperationNetworkSync.kt`. It will register a `ConnectivityManager.NetworkCallback`, check whether the Room outbox has pending rows, and call `IMatchRepository.syncPendingMatchOperations(null)` when the network becomes available or the app starts with an active network. `MvpApp.onCreate` will start the scheduler after Koin is initialized.

Second, add a focused Wear OS scheduler in `wearApp/src/main/java/com/razumly/mvp/wear/data/WearMatchNetworkSync.kt`. It will use `ConnectivityManager.NetworkCallback`, check `WearMatchOperationStore.pendingOperations()`, and call `WearMatchRepository.syncPendingOperations(null)`. A small Wear `Application` subclass will construct the same repository pieces used by `MvpWearViewModel`, start the scheduler, and be registered in `wearApp/src/main/AndroidManifest.xml`.

Third, add watchOS durable operation storage in `iosApp/watchApp/WatchMatchOperationStore.swift`. `WatchMatchRepository` will create a persisted operation for each local-first patch, apply it locally, try to send pending operations in order, and keep failures on disk. `MVPWatchApp` will create the store and call a new `startNetworkRetryMonitor()` method that uses `NWPathMonitor` to trigger pending sync when network becomes satisfied. The old in-memory `pendingPatchBodiesByMatchId` will be removed.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app`.

Android/Wear validation was run with:

    ./gradlew :wearApp:test :wearApp:assembleDebug :composeApp:compileDebugKotlin

The command completed with `BUILD SUCCESSFUL in 1m 29s`. Gradle emitted existing warnings unrelated to this change, including deprecated APIs and unnecessary safe-call warnings.

watchOS validation was run with XcodeBuildMCP `build_run_sim` using project `/Users/elesesy/StudioProjects/mvp-app/iosApp/iosApp.xcodeproj`, scheme `MVPWatch`, and simulator `Apple Watch Series 11 (42mm)`. The build and launch succeeded.

## Validation and Acceptance

Acceptance requires all changed code to compile. Behaviorally, a failed match operation should remain in a pending outbox, and when network access becomes available the platform scheduler should call the existing pending-operation sync method without waiting for another official action. On watchOS, pending operations must survive repository recreation because they are persisted in `UserDefaults`.

## Idempotence and Recovery

The network schedulers must be safe to start once from app startup and ignore duplicate in-flight syncs. If a sync fails, the existing outbox status remains retryable. The watchOS store writes a full operation list to `UserDefaults`; if decoding fails, it falls back to an empty list rather than crashing the app.

## Artifacts and Notes

Current evidence before implementation:

    Wear OS pending operations are persisted in SharedPreferences and retried by WearMatchRepository.syncPendingOperations.
    Android phone pending operations are persisted in Room and retried by MatchRepository.syncPendingMatchOperations.
    watchOS pending operations are only stored in WatchMatchRepository.pendingPatchBodiesByMatchId.

Validation evidence after implementation:

    ./gradlew :wearApp:test :wearApp:assembleDebug :composeApp:compileDebugKotlin
    BUILD SUCCESSFUL in 1m 29s

    XcodeBuildMCP build_run_sim for MVPWatch
    status: SUCCEEDED

    git diff --check
    no output

## Interfaces and Dependencies

Android phone:

    object MatchOperationNetworkSync {
        fun start(context: Context)
    }

Wear OS:

    class WearMatchNetworkSync(
        context: Context,
        operationStore: WearMatchOperationStore,
        repository: WearMatchRepository,
    ) {
        fun start()
        fun stop()
    }

watchOS:

    struct WatchPendingMatchOperation: Codable
    final class WatchMatchOperationStore {
        func newOperation(eventId: String, matchId: String) -> WatchPendingMatchOperation
        func pendingOperations(matchId: String?) -> [WatchPendingMatchOperation]
        func upsertOperation(_ operation: WatchPendingMatchOperation)
        func markAttempting(_ operationId: String)
        func markFailed(_ operationId: String, error: String)
        func markAcked(_ operationId: String)
    }

Revision note: Created this plan after inspecting the existing operation outboxes and before implementing network retry triggers, because the change spans phone, Wear OS, and watchOS persistence.

Revision note: Added the Android phone and Wear OS connectivity schedulers and the watchOS persisted operation store. The plan now reflects that implementation is complete pending validation.

Revision note: Added watchOS local overlays during schedule load and a follow-up sync request flag so operations created while a sync is in progress are not stranded.

Revision note: Added validation results and final outcome after Gradle, watchOS simulator build/run, and whitespace checks succeeded.
