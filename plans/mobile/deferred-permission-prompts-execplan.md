# Defer location and notification permission requests until contextual use

This is a living ExecPlan. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current as implementation proceeds, in accordance with `PLANS.md`.

## Purpose / Big Picture

Move permission requests out of app launch and into the moments where the permissions have an obvious purpose:

- When Discover becomes visible, show a location primer before any location tracking or OS permission request. Explain that location is used only to find local events and is not shared or sold. Persist the user’s “Do not ask again” choice locally.
- After a confirmed successful event join, show a non-blocking notification primer explaining that notifications help with event communication. The user can continue using the app, and the existing Home/Profile notification settings remain the place for category-level controls.
- Both primers use a `Next` action that waits for the permission result. The OS dialog must be interactive; permission calls must not be fired from composition or treated as fire-and-forget.

The expected result is no location or notification prompt during splash, login, app startup, or ordinary foreground reactivation. Discover must still work without location, and a join must still complete if notification permission is declined.

## Progress

- [x] (2026-07-31) Read the repository guidelines and `PLANS.md`; confirmed this feature requires a living ExecPlan.
- [x] (2026-07-31) Audited the launch permission request, Discover location lifecycle, Android/iOS permission plumbing, DataStore-backed local preferences, join execution paths, and Home notification settings.
- [x] (2026-07-31) Confirmed the existing `mvp-site` push contract uses notification settings, `PushDeviceTarget`, and topic subscription routes; no new backend endpoint is assumed at planning time.
- [x] (2026-07-31) Preserved the unrelated dirty worktree; this planning turn adds only this plan file.
- [x] (2026-07-31) Added shared primer state/UI, device-local DataStore flags, and persistence tests.
- [x] (2026-07-31) Removed launch-time permission requests and gated Discover and map location tracking behind the contextual location flow.
- [x] (2026-07-31) Triggered the notification primer only after confirmed join completion across direct, team, child, manual-payment, and payment-plan paths; existing Home/Profile controls remain unchanged.
- [x] (2026-07-31) Aligned iOS AppDelegate registration with the explicit permission path without introducing a new Swift source file.
- [x] (2026-07-31) Ran the focused DataStore test, Android debug assembly, Android/iOS simulator Kotlin compilation, and an arm64-only native iOS simulator build.
- [x] (2026-07-31) Device-smoked Android on a Pixel 9 Pro API 35 emulator: verified clean launch without an OS prompt, the Discover primer copy/checkbox/actions, the real location permission sheet, denial fallback, and continued event browsing.
- [x] (2026-07-31) Device-smoked iOS on an iPhone 15 Pro iOS 17 simulator: verified clean build/run, the Discover primer copy/checkbox/actions, the real iOS location permission sheet, denial fallback, persisted suppression after relaunch, and continued Discover initialization.
- [x] (2026-07-31) Fixed an iOS-only Koin runtime failure found during device smoke testing by registering both the common `PermissionsController` protocol and the concrete iOS controller in the platform module.
- [x] (2026-07-31) Replaced the stale local event data with one current joinable fixture (`event_free_1`, `Notification Permission Test Event`) after deleting 765 local events and their event-owned rows; no live database was touched.
- [x] (2026-07-31) Device-smoked the complete notification flow on Android and iOS: a successful join showed the in-app primer, `Next` opened the native notification permission sheet, denial did not undo the registration, and iOS exposed the expected system-settings recovery state.

## Surprises & Discoveries

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt` calls `root.requestInitialPermissions()` from a `LaunchedEffect`, and `RootComponent.requestInitialPermissions()` requests both location and remote notifications. Removing only one of these calls would leave the other launch path active.
- `DefaultEventSearchComponent` starts its `LocationTracker` from `init`, before the Discover UI can display a primer. The tracker start must be deferred, not merely accompanied by a dialog.
- Koin currently creates separate location tracker instances for Root and EventSearch. The permission gate should be applied to the EventSearch-owned tracker that drives Discover results, while preserving the existing no-location fallback behavior.
- iOS `iosApp/iosApp/iOSApp.swift` directly calls `requestAuthorization` during launch and app activation even though the Kotlin notifier configuration does not ask on start. Both lifecycle calls must become status-only/registration behavior.
- iOS Discover is a native Swift presentation around the Kotlin `EventSearchComponent`. The primer should remain common Kotlin UI or a shared platform wrapper so Kotlin remains the state/business source of truth and no second Swift location state machine is introduced.
- Both platform `MapComponent` implementations own separate location trackers. They also needed an explicit granted-permission check; otherwise the map could bypass the Discover primer, especially on iOS where tracking previously began in `init`.
- `CurrentUserDataSource` already owns the app’s DataStore preferences and is a better fit than a Room migration for device-local primer decisions. These flags must be explicitly documented as device-global, not server/account data.
- Notification permission and app notification categories are separate controls. The existing `ProfileNotificationsScreen` and `NotificationSettingsCard` must remain authoritative for email/push category preferences.
- A join can be direct, team-based, child/parent-mediated, manual-payment, or payment-plan based. The notification prompt must be attached to the confirmed registration success boundary, not to a pre-payment intent or a failed request.
- iOS and Android do not have identical denial behavior. After a permanent denial, the app may need to direct the user to system settings rather than attempting another OS request.
- The default generic iOS simulator build passed `x86_64` into the Kotlin CocoaPods sync script and failed because this Apple Silicon Kotlin/Native toolchain does not recognize that simulator architecture. Re-running with `ARCHS=arm64 ONLY_ACTIVE_ARCH=YES` completed the native app build successfully.
- The first iOS runtime smoke test reached login but crashed when Discover initialized because Koin only registered the concrete iOS `PermissionsController`, while the new common component requested the iOS typealias for `PermissionsControllerProtocol`. Registering the common protocol and resolving the concrete iOS type from it fixed the issue; the rebuilt app initialized Discover successfully.
- The seeded local join fixtures were dated before the current simulator date and the available live event was already full/past. The test was unblocked by clearing the local event-owned data and creating one current joinable fixture; this also exposed that stale Room membership can make a reused event appear already joined until app data is cleared.

## Decision Log

- Decision: Remove all automatic permission requests from app launch and app foreground callbacks.
  Rationale: The permission request should be understandable at the point of use, and foreground callbacks can otherwise re-prompt users without an explicit action.
  Date/Author: 2026-07-31, Codex.

- Decision: Keep the permission primer state, persistence, and OS-request orchestration in common Kotlin.
  Rationale: This keeps Android and iOS behavior aligned and preserves Kotlin `EventSearchComponent` as the Discover contract even though iOS renders Discover natively.
  Date/Author: 2026-07-31, Codex.

- Decision: Persist the location “Do not ask again” choice in the existing DataStore as a device-local flag, independent of the signed-in account.
  Rationale: The choice is about this device’s permission prompt, not a user profile preference. Account changes should not unexpectedly re-enable or suppress it.
  Date/Author: 2026-07-31, Codex.

- Decision: The location primer has `Next`, `Not now`, and the requested `Do not ask again` checkbox. `Next` persists the checkbox choice, requests location, and only then permits tracking. `Not now` leaves the choice eligible for a later Discover visit but does not request the OS permission.
  Rationale: Users need a non-destructive escape hatch, while the checkbox gives them durable control over future prompts.
  Date/Author: 2026-07-31, Codex.

- Decision: Show the notification primer once after the first confirmed successful join while notification permission is not granted; persist that the primer was handled when the user chooses `Next` or `Not now`. Do not add a notification checkbox unless product requirements change.
  Rationale: Repeating a prompt after every join is noisy, and iOS will not show its system dialog again after a denial. Home/Profile notification settings and system settings provide the durable re-entry paths.
  Date/Author: 2026-07-31, Codex.

- Decision: A notification prompt is a follow-up, never a gate for completing a join.
  Rationale: Registration, payment, and parent-approval semantics must not depend on a device-level communication preference.
  Date/Author: 2026-07-31, Codex.

- Decision: Do not change the backend contract unless implementation verification proves a successful registration is not already covered by current event/team notification targeting.
  Rationale: `mvp-site` already has notification settings, push device registration, and topic subscription routes. Adding a new endpoint or schema would create unnecessary cross-repo scope.
  Date/Author: 2026-07-31, Codex.

- Decision: Keep APNs registration in the existing Swift `AppDelegate` and signal it from shared Kotlin with a Foundation notification after the permission result.
  Rationale: The installed Kotlin/Native UIKit bindings do not expose `UIApplication.registerForRemoteNotifications()`, while the existing AppDelegate already owns Firebase/APNs registration and token persistence.
  Date/Author: 2026-07-31, Codex.

## Outcomes & Retrospective

Implemented outcome: launch and foreground lifecycle paths no longer request location or notification permissions. Discover presents the location primer only after it becomes visible, persists the device-local “Do not ask again” choice, and keeps browsing available without location. A confirmed join presents the notification primer once per device, leaves join/payment/approval behavior independent of notification permission, and uses the existing push-target synchronization path after a grant.

Validation completed: `:core:repository-impl:testDebugUnitTest --tests com.razumly.mvp.core.data.CurrentUserDataSourcePermissionPrimerTest`, `:composeApp:compileDebugKotlinAndroid`, `:composeApp:compileKotlinIosSimulatorArm64`, `:composeApp:assembleDebug`, `git diff --check`, and the arm64-only native iOS simulator build/run all pass. Android and iOS both exercised the location primer and real native location permission sheet; both remained usable after denial. iOS also confirmed the local suppression choice survives app relaunch. With the isolated local fixture, Android and iOS both completed a successful join, displayed the notification primer, opened the native notification permission interaction only after `Next`, and preserved the active registration after denial. Real push delivery after granting remains a separate acceptance item.

## Context and Orientation

The mobile repository is `/Users/elesesy/StudioProjects/mvp-app`. The backend/data-contract repository is `/Users/elesesy/StudioProjects/mvp-site`.

Relevant existing paths:

- Launch permissions: `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/RootComponent.kt`.
- Discover state and tracking: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt`, `DefaultEventSearchComponent`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.kt`, and the Android/iOS actual screen wrappers.
- Dependency wiring: `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/DatastoreModule.kt`.
- Local preference source: `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/CurrentUserDataSource.kt` and its existing in-memory DataStore tests.
- Notification lifecycle: `iosApp/iosApp/iOSApp.swift`, `composeApp/src/iosMain/kotlin/com/razumly/mvp/IosNotificationBridge.kt`, `composeApp/src/androidMain/kotlin/com/razumly/mvp/MvpApp.kt`, and `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/PushNotificationsRepository.kt`.
- Join orchestration: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventJoinExecutionCoordinator.kt`, `EventRegistrationActionHandler.kt`, `DefaultEventDetailComponent.kt`, and `EventDetailScreen.kt`.
- Existing category controls: `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileHomeScreen.kt` and `ProfileFeatureScreens.kt`.
- Platform declarations: `composeApp/src/androidMain/AndroidManifest.xml` and `iosApp/iosApp/Info.plist`.
- Backend push contract: `/Users/elesesy/StudioProjects/mvp-site/src/server/pushNotifications.ts`, `src/server/notificationPreferences.ts`, and the event/topic notification routes.

The checkout already contains unrelated edits in match scoring, event detail, profile, navigation, DTO, repository, and an existing plan file. Implementation must preserve those edits and must not use broad staging or reset operations.

## Plan of Work

### Phase 1: Define local preference and permission state

Introduce a small common coordinator/state model for the two primers. It should distinguish at least: OS permission already granted, primer eligible, primer visible, request in progress, denied, permanently denied/settings-required, and completed/suppressed. Keep the state serializable only where needed; OS authorization status remains runtime state.

Add explicit DataStore keys and methods to `CurrentUserDataSource` for the device-local location suppression choice and notification-primer handled state. Defaults must preserve current users’ behavior without requiring a migration. Add fakeable interfaces around permission requests and app-settings navigation so unit tests do not depend on a real OS dialog.

### Phase 2: Move location permission to Discover

Remove the call to `RootComponent.requestInitialPermissions()` from `App.kt` and remove the launch-time request method/imports from `RootComponent` if no other caller remains. Keep the permission controller available for explicit feature actions.

Change `DefaultEventSearchComponent` so initialization does not call `locationTracker.startTracking()` before the primer decision. On Discover visibility, inspect the stored suppression flag and current OS state:

- If location is already granted, start tracking through the existing safe path.
- If it is not granted and the user has not suppressed the primer, expose the primer.
- If it is not granted and the user suppressed the primer, keep Discover usable without location.

Render a shared primer over both Android Compose Discover and the iOS native Discover wrapper. Use the exact privacy meaning requested by the user: “We only use your location to find local events. We don’t share or sell your location data.” Include a clear statement that Discover remains usable without location. `Next` must disable while awaiting `providePermission(Permission.LOCATION)`, handle the returned grant/denial, and only start the tracker after a grant. Preserve the existing no-location event/org/rental refresh path on denial.

When permission is permanently denied, show an actionable system-settings route rather than pretending that another `Next` will produce an OS dialog. Verify whether the existing permission library exposes the needed status/rationale APIs; otherwise add a minimal platform bridge.

### Phase 3: Move notification permission to successful join completion

Remove direct iOS `requestAuthorization` calls from `didFinishLaunching` and `applicationDidBecomeActive`. Preserve Firebase initialization, token refresh handling, foreground behavior, and already-authorized remote registration. Add or expose a narrow bridge that registers for remote notifications after the explicit Kotlin permission request succeeds.

Add a notification-primer event/state to the event-detail flow. Trigger it only after the existing join coordinator receives a confirmed success for the relevant registration mutation. Cover direct self joins, team joins, manual-payment completion, payment-plan completion, and any child-registration path whose product outcome represents an active registration. Do not trigger for failed joins, pre-payment intent creation, already-registered responses, or pending parent approval unless product explicitly chooses that behavior.

Make the notification primer non-blocking. On `Next`, wait for `Permission.REMOTE_NOTIFICATION`; after a grant, ensure the existing `IPushNotificationsRepository.addDeviceAsTarget()` path runs or is safely retried after the platform token is available. On denial, preserve the completed join and provide an app-settings route when appropriate.

### Phase 4: Preserve and clarify Home notification controls

Keep `ProfileHomeScreen` → `ProfileNotificationsScreen` as the re-entry point for category settings. Do not replace server-backed email/push category preferences with the OS-level permission prompt.

Add an OS authorization status/action only if the current screen has no clear way to recover from a denied OS permission. The screen should explain the distinction: category toggles control which notifications the app sends; system permission controls whether the device can display push notifications. The app must not claim that toggling a category can override a denied OS permission.

Review the iOS location usage descriptions and Android runtime permission copy against the new custom primer. Request only the location precision needed for local-event discovery; accept approximate location if the distance/search contract allows it. Confirm the “not shared or sold” statement is true across analytics, backend logging, and third-party services before shipping it as a privacy guarantee.

### Phase 5: Test and validate

Add focused tests before broad builds. Use fake permission controllers and in-memory DataStore so tests can prove sequencing, persistence, and denial behavior without displaying OS dialogs. Then run Android unit/assembly checks and an iOS simulator/device flow with real permission dialogs.

## Concrete Steps

1. Re-run `git status --short --branch` and record the exact intended file list before implementation. Do not modify or stage the existing unrelated files.
2. Add the common preference/coordinator types and DataStore methods. Test default values, persistence across recreated data sources, device-global behavior across account changes, and safe behavior when the stored key is absent.
3. Remove launch permission requests. Add a regression test proving app composition and app activation do not call either permission request.
4. Gate EventSearch tracker startup. Add tests for granted-at-entry, primer-visible/no-tracking, `Next`/grant, `Next`/deny, permanent-denial/settings, checkbox persistence, `Not now`, and rapid/recomposed `Next` clicks.
5. Add the common primer UI with stable test tags for title/body, checkbox, `Next`, `Not now`, and settings. Verify it is hosted over both Android Discover and the iOS `UIKitViewController` wrapper without duplicating Discover state in Swift.
6. Update iOS lifecycle code and the explicit registration bridge. Verify that `applicationDidBecomeActive` can refresh token/registration state without requesting authorization.
7. Add join-success callback coverage for every execution branch. Verify the notification primer is not shown for a failed join, pre-payment intent, or pending approval, and is shown only once under the selected local policy.
8. Wire notification `Next` to the permission result and existing push target registration. Verify the target-sync call occurs after grant/token availability and does not block the join result.
9. Review `ProfileNotificationsScreen` and add OS-settings recovery only where needed. Confirm category toggles continue to use the existing `NotificationSettings` model and backend update path.
10. Update `Info.plist` disclosure text and Android/iOS platform behavior only after confirming the exact location precision and privacy wording with the product owner/legal owner. If new Swift files are unavoidable, add the required Xcode project entries for the iOS 15.3 target.

## Validation and Acceptance

### Automated validation

- The DataStore test proves the new flags default safely and persist locally without a Room schema change.
- Kotlin compilation covers the shared permission state, Discover/map gates, join callbacks, Android actuals, and iOS actuals. Android debug assembly and the arm64-only native iOS simulator build also pass.
- Join-path and full UI behavior remain device/manual acceptance items because the repository does not currently have focused permission-dialog or end-to-end join-prompt tests for these surfaces; the Android Pixel 9 Pro API 35 and iOS iPhone 15 Pro iOS 17 manual flows now pass against the isolated local fixture.
- `git diff --check` passes. No `mvp-site` code or API contract change was necessary.

### Manual acceptance

- Fresh install and returning user: no location or notification OS prompt appears on splash, login, initial composition, or foreground reactivation.
- Discover with no location permission: the custom primer appears on page entry; the exact privacy statement is visible; no location tracking or OS prompt happens until `Next` is tapped.
- Location `Next`: the OS dialog appears, the button waits for the user’s response, and a grant starts normal nearby-event behavior. A denial leaves Discover usable without location. A permanent denial offers system settings. Checking “Do not ask again” prevents future custom location primers on that device.
- Successful join: the join completes first, then the notification primer appears once. `Next` opens the OS permission interaction; a grant leads to device-token/target synchronization; a denial does not undo the join. Verified on Android and iOS with an active `event_free_1__self__user_participant` registration.
- Home/Profile notification settings: category preferences remain independently editable, and denied OS permission is explained with a system-settings route.
- Android approximate/precise location and iOS denied/authorized states are each tested. Verify event-distance behavior is correct for the chosen location precision and that no background location request is introduced.
- Verify actual push delivery for a joined user on at least one Android and one iOS test device after permission grant, using the existing backend `PushDeviceTarget` path and notification category filters.

## Idempotence and Recovery

The change is additive and should not require a Room or backend migration. Missing DataStore keys mean “not suppressed” and “not handled,” so existing installs receive the new contextual behavior safely. Re-running the implementation steps must not create duplicate keys, duplicate join callbacks, duplicate permission requests, or duplicate push-device rows; the existing registration path is expected to remain idempotent.

If an OS request fails or is denied, dismiss only the primer state and retain the user’s ability to browse or complete a join. If the platform reports a permanent denial, route to settings and do not loop on `providePermission`. If iOS notification authorization is already granted, skip the OS prompt and only repair/register the existing device-token path.

If implementation reveals that event notification targeting is incomplete, stop and document the exact existing route/payload mismatch before changing `/Users/elesesy/StudioProjects/mvp-site`. Do not invent a new endpoint from the mobile client. If a new Swift file is introduced, update `iosApp/iosApp.xcodeproj/project.pbxproj` in the same change or keep the implementation in existing bridge files.

To roll back, remove the new primer UI/coordinator wiring and the launch suppression changes while leaving the DataStore keys harmlessly unused. Do not reset the worktree or discard unrelated edits.

## Artifacts and Notes

Planning artifact:

- `plans/deferred-permission-prompts-execplan.md`

Expected implementation surfaces, subject to the focused diff review:

- common permission primer/coordinator and tests;
- `App.kt`, `RootComponent.kt`, EventSearch component/screen wrappers, and DI wiring;
- `CurrentUserDataSource` and DataStore tests;
- event-detail join coordinator/screen and notification primer tests;
- existing iOS notification bridge/AppDelegate and platform permission declarations;
- Home/Profile notification settings only if OS-level recovery is missing.

No backend migration or API contract change is planned initially. Any necessary `mvp-site` change must be justified by a verified gap in the current registration/topic/push-target path and included in the same cross-repo implementation plan.

## Interfaces and Dependencies

- `dev.icerock.moko:permissions` remains the OS permission abstraction. Verify the exact current APIs for granted, rationale/permanent denial, and suspend request behavior before implementation.
- `PermissionsController` is the common permission request dependency; platform settings navigation may require a small expect/actual bridge.
- `CurrentUserDataSource` and the existing DataStore module provide local persistence; no Room entity or `MVP_DATABASE_VERSION` change is expected.
- `LocationTracker` and `EventSearchComponent` remain the location/search source of truth. The UI must not synthesize location results or duplicate filter state.
- `IPushNotificationsRepository.addDeviceAsTarget()` and the existing iOS Firebase/APNs token bridge remain the push registration path.
- `mvp-site` notification settings, `PushDeviceTarget`, topic subscription routes, and event notification routes remain the backend contract unless validation proves otherwise.
- Android requires the existing coarse/fine location and `POST_NOTIFICATIONS` declarations. iOS requires accurate `Info.plist` usage descriptions and must continue targeting iOS 15.3 APIs.
- The current checkout is dirty with unrelated changes; implementation must use explicit paths and preserve all pre-existing modifications.

## Revision Notes

- 2026-07-31: Initial plan created after auditing the current launch, Discover, join, notification, DataStore, iOS, and backend push paths.
- 2026-07-31: Implemented the shared primers, deferred permission requests, local flags, successful-join notification trigger, map permission gates, iOS lifecycle/registration bridge, and focused validation. No backend change was required.
- 2026-07-31: Completed Android and iOS simulator smoke testing, fixed the iOS common/controller Koin binding exposed by runtime testing, and documented the remaining notification-join test fixture gap.
- 2026-07-31: Cleared the local event dataset, created a current joinable notification-permission fixture, and completed the Android/iOS post-join notification permission smoke test; the only remaining manual item is real push delivery after grant.
