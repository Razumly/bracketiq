# Build the watchOS official match app

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. Store this file under `plans/` and keep it self-contained so a contributor can resume the work from this document alone.

## Purpose / Big Picture

Officials should be able to use an Apple Watch during games without opening the phone app. After this work, a signed-in official can launch a watchOS app, see upcoming assigned matches, check in, start or reset the active segment timer, end a segment or match, and record team-first incidents. The user-visible proof is a buildable watchOS target in the existing iOS Xcode project whose first screen is the actual officiating workflow.

This milestone targets watchOS only. It mirrors the first Wear OS milestone already implemented in `wearApp/`, but it uses native SwiftUI and direct URLSession API calls because the existing Kotlin/Compose iOS framework and CocoaPods dependencies are phone-focused and should not be linked into a watch app.

## Progress

- [x] (2026-06-08T18:00:00Z) Inspected `iosApp/iosApp.xcodeproj`, the existing SwiftUI phone entry point, `Secrets.plist`, and the paired backend route contracts already used by the Wear OS milestone.
- [x] (2026-06-08T18:00:00Z) Confirmed there is no existing watchOS target in the Xcode project.
- [x] (2026-06-08T18:25:00Z) Added pure Swift watchOS source files for API DTOs, token storage, repository actions, view model state, and SwiftUI screens.
- [x] (2026-06-08T18:35:00Z) Added the `MVPWatch` watchOS target and shared scheme to `iosApp/iosApp.xcodeproj` without linking phone-only ComposeApp, Firebase, Google Maps, Stripe, or CocoaPods frameworks.
- [x] (2026-06-08T18:36:00Z) Type-checked the watch Swift sources against `WatchSimulator26.5.sdk`.
- [x] (2026-06-08T18:36:00Z) Built and linked the `MVPWatch` target against `WatchOS26.5.sdk` with `BIQ.icon` excluded only from the command line to bypass this machine's missing watchOS 26.5 runtime for asset thinning.
- [ ] Build the full `MVPWatch` scheme for a watchOS simulator after installing the matching watchOS 26.5 simulator runtime/platform component.

## Surprises & Discoveries

- Observation: The existing `iosApp` target is a single iOS/iPad app target with CocoaPods and the generated Kotlin framework in its link settings.
  Evidence: `iosApp/iosApp.xcodeproj/project.pbxproj` has one native target named `iosApp`; its build phases include CocoaPods scripts and `OTHER_LDFLAGS` references `ComposeApp`, UIKit, Firebase-related pods, and Google Maps dependencies.

- Observation: API URL configuration already exists in a plist that can be copied into the watch target.
  Evidence: `iosApp/iosApp/Secrets.plist` contains `mvpApiBaseUrl`, `mvpApiBaseUrlRemote`, and `mvpWebBaseUrl`.

- Observation: The existing icon source explicitly supports watchOS circles.
  Evidence: `iosApp/BIQ.icon/icon.json` has `"supported-platforms": { "circles": ["watchOS"], "squares": "shared" }`.

- Observation: Xcode 26.5 is installed with watchOS and watch simulator SDKs, but this Mac only has watchOS 10.0 and 10.2 simulator runtimes. Xcode will not provide an `MVPWatch` run destination until the matching watchOS 26.5 runtime/platform component is installed.
  Evidence: `xcodebuild -showsdks` lists `watchos26.5` and `watchsimulator26.5`; `xcrun simctl list runtimes` lists only `watchOS 10.0` and `watchOS 10.2`; `xcodebuild -project iosApp/iosApp.xcodeproj -scheme MVPWatch -showdestinations` reports only an ineligible watchOS destination with `watchOS 26.5 is not installed`.

- Observation: The Ruby `xcodeproj` helper's `watch2_app` target type produced legacy `com.apple.product-type.application.watchapp2` metadata, which caused duplicate executable output when building a modern SwiftUI watch app.
  Evidence: Target-level `xcodebuild` failed with `Multiple commands produce ... MVPWatch.app/MVPWatch`; switching the target product type to `com.apple.product-type.application`, matching Xcode's watch-only template output, removed that error.

- Observation: Asset compilation for `BIQ.icon` currently fails on this Mac because `actool` cannot thin watch assets without a simulator runtime version matching the 26.5 SDK.
  Evidence: Target-level builds with `BIQ.icon` included fail at `CompileAssetCatalogVariant thinned` with `No simulator runtime version from ["21R355", "21S364"] available to use with watchsimulator SDK version 23T570`; the same build succeeds when `EXCLUDED_SOURCE_FILE_NAMES=BIQ.icon` is passed from the command line.

## Decision Log

- Decision: Build a new native watchOS target named `MVPWatch` inside `iosApp/iosApp.xcodeproj`.
  Rationale: watchOS apps are separate Apple targets. Keeping it in the same Xcode project makes it discoverable from the existing iOS workspace while avoiding changes to the Kotlin Multiplatform phone app.
  Date/Author: 2026-06-08 / Codex

- Decision: Use the modern watch app product type `com.apple.product-type.application` with `SDKROOT=watchos`, `TARGETED_DEVICE_FAMILY=4`, and `INFOPLIST_KEY_WKWatchOnly=YES`.
  Rationale: This matches Xcode's watchOS SwiftUI app template and avoids the legacy `watchapp2` build behavior that conflicts with direct Swift linking.
  Date/Author: 2026-06-08 / Codex

- Decision: Do not link `ComposeApp`, Firebase, Google Maps, Stripe, or CocoaPods into the watch target.
  Rationale: The watch workflow only needs authenticated HTTP calls and SwiftUI. Linking phone-only frameworks would create unnecessary watchOS availability and signing risk.
  Date/Author: 2026-06-08 / Codex

- Decision: Reuse the direct watch login and direct backend API model from Wear OS.
  Rationale: The first watchOS milestone should be standalone and usable before adding phone-to-watch session transfer.
  Date/Author: 2026-06-08 / Codex

- Decision: Keep incident entry team-first for all scoring and non-scoring incidents.
  Rationale: This matches the product decision: team, incident type, then player only when required or useful. Playerless scoring uses the direct score endpoint; player-required scoring creates an incident.
  Date/Author: 2026-06-08 / Codex

## Outcomes & Retrospective

The `MVPWatch` target and shared scheme now exist in `iosApp/iosApp.xcodeproj`, with standalone SwiftUI watch screens backed by the existing backend API contract. The target does not link the KMP phone app, Firebase, Google Maps, Stripe, or CocoaPods.

The Swift sources type-check successfully against the installed watch simulator SDK:

    xcrun --sdk watchsimulator swiftc -target arm64-apple-watchos10.0-simulator -typecheck iosApp/watchApp/*.swift

The target also builds and links against the installed watchOS device SDK when the watch icon resource is excluded only from the validation command:

    xcodebuild -project iosApp/iosApp.xcodeproj -target MVPWatch -configuration Debug -sdk watchos26.5 CODE_SIGNING_ALLOWED=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=NO EXCLUDED_SOURCE_FILE_NAMES=BIQ.icon build

The normal scheme/simulator build remains blocked by local Xcode components, not by the Swift sources: this Mac has the 26.5 watch SDKs but lacks a matching watchOS 26.5 simulator runtime, and `actool` refuses to thin the watch icon with only watchOS 10.x runtimes installed.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-app`. The existing phone/tablet Apple app is under `iosApp/` and is backed by the Kotlin Multiplatform `composeApp/` framework. The paired backend and database contract live in `/Users/elesesy/StudioProjects/mvp-site/`; this repository's `AGENTS.md` instructions require API paths and payloads to match that backend.

The Wear OS milestone lives in `wearApp/` and already implements the same product behavior in Kotlin. The watchOS implementation should mirror its API decisions but use native Swift types so the Apple Watch target does not depend on the Android or KMP module.

Important existing files:

- `iosApp/iosApp.xcodeproj/project.pbxproj`, which currently defines only the `iosApp` native target.
- `iosApp/iosApp/Secrets.plist`, which stores backend URL configuration.
- `iosApp/BIQ.icon`, which provides the app icon and declares watchOS support.
- `plans/wear-os-official-app-execplan.md`, which records the backend API discoveries for the first watch implementation.

Terms used in this plan:

- watchOS means Apple's smartwatch operating system for Apple Watch.
- Segment means one set, quarter, period, inning, or other configured slice of a match. The API stores segments in `match.segments`.
- Incident means a recorded match event such as a goal, point, card, discipline item, note, or admin event. The API stores incidents in `match.incidents`.
- Player-recorded scoring means scoring rules require selecting a roster participant before a scoring incident can increment the score.

## Plan of Work

Create `iosApp/watchApp/` with pure Swift watchOS code. The code will define Codable DTOs for the same backend payloads used by Wear OS, a small URLSession API client with bearer-token authorization, a Keychain-backed token store with UserDefaults fallback, a repository that loads schedules and mutates matches, an observable view model, and compact SwiftUI screens.

Modify `iosApp/iosApp.xcodeproj/project.pbxproj` to add a new `MVPWatch` target with SDK root `watchos`, watch target device family, watch-only metadata, the existing `BIQ.icon` resource, and `iosApp/iosApp/Secrets.plist` copied as a resource. Add a shared `MVPWatch.xcscheme` so Xcode can run the target from the scheme selector.

The watch target should not depend on the `iosApp` phone target. It will be an independent watch app with direct login, matching the Wear OS first milestone. Phone-mediated auth can be added later.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-app`, validate the target with Xcode:

    xcodebuild -project iosApp/iosApp.xcodeproj -scheme MVPWatch -destination 'platform=watchOS Simulator,name=Apple Watch Series 10 (46mm)' build

If the named simulator is not installed, list available watchOS simulators and choose an equivalent:

    xcrun simctl list devices watchOS

The expected success marker is `** BUILD SUCCEEDED **`.

On the current Mac, install the matching watchOS 26.5 simulator runtime first. Until then, code-level validation can be repeated with:

    xcrun --sdk watchsimulator swiftc -target arm64-apple-watchos10.0-simulator -typecheck iosApp/watchApp/*.swift

and target-level link validation can be repeated with:

    xcodebuild -project iosApp/iosApp.xcodeproj -target MVPWatch -configuration Debug -sdk watchos26.5 CODE_SIGNING_ALLOWED=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=NO EXCLUDED_SOURCE_FILE_NAMES=BIQ.icon build

## Validation and Acceptance

The first implementation milestone is accepted when the watch Swift sources type-check and the `MVPWatch` target links. Full local simulator acceptance requires installing the matching watchOS 26.5 simulator runtime so the scheme can build with `BIQ.icon` included and launch in Simulator.

On launch, unauthenticated users see an email/password sign-in screen. After sign-in, the app loads upcoming assigned-official matches. Selecting a match shows check-in, score, active segment, timer controls, and team buttons. Tapping a team opens incident types. Scoring types that do not require players increment the score immediately; player-required scoring asks for a player, then minute confirmation, then creates an incident.

## Idempotence and Recovery

All Swift source edits are additive under `iosApp/watchApp/`. The Xcode project edit adds a new target and shared scheme; it does not alter the existing `iosApp` build phases. Running the build multiple times is safe. If Xcode target creation needs to be retried, remove only the `MVPWatch` target and `iosApp/watchApp/` files, not the existing `iosApp` target or CocoaPods files.

The repo already has unrelated dirty files, especially under `iosApp/Pods/`, `composeApp/`, and the Wear OS work. Do not revert or overwrite those changes.

## Artifacts and Notes

Important source evidence already gathered:

    Mobile login path: api/auth/login
    Mobile schedule path: api/profile/schedule
    Event detail fallback path: api/events/{eventId}/detail
    Match mutation path: api/events/{eventId}/matches/{matchId}
    Direct score path: api/events/{eventId}/matches/{matchId}/score

Current working tree note:

    The repo is ahead of origin/master and has unrelated dirty iOS/CocoaPods files plus existing Wear OS work. The watchOS work should not revert them.

## Interfaces and Dependencies

The new watchOS target should expose these project-local Swift types:

    MVPWatchApp
    WatchOfficialAppView
    WatchOfficialViewModel
    WatchAPIClient
    WatchMatchRepository
    WatchTokenStore

Use these remote API contracts:

    POST api/auth/login
      body: { email: string, password: string }
      response includes token and user/profile data.

    GET api/auth/me
      response includes user/profile data for an existing token.

    GET api/profile/schedule
      response includes events, matches, teams, and fields.

    GET api/events/{eventId}/detail
      response includes all matches for an official or host event and is used as a fallback for multi-slot official assignments.

    GET api/users?ids=a,b,c
      response includes user profiles used for player labels.

    PATCH api/events/{eventId}/matches/{matchId}
      body may include officialCheckIn, lifecycle, segmentOperations, incidentOperations, finalize, and time.

    POST api/events/{eventId}/matches/{matchId}/score
      body: { segmentId: string?, sequence: number, eventTeamId: string, points: number }

Revision note 2026-06-08: Created this plan before implementing the first watchOS target so the significant feature follows `PLANS.md` and records the Apple-platform packaging decisions.
