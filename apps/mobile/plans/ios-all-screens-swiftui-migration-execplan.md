# Convert every visible iOS screen to SwiftUI while retaining Kotlin components

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is maintained in accordance with `PLANS.md` at the repository root. It is intentionally self-contained: a contributor should be able to resume the migration using this file and the current checkout without relying on prior conversation.

## Purpose / Big Picture

After this migration, every user-visible iOS application surface will be implemented in SwiftUI while Android continues to use the existing Compose UI. Kotlin Multiplatform components remain the source of truth for business state, repository access, validation, and navigation actions. SwiftUI observes those components and sends user actions back to them; it does not create a second business-logic layer.

The migration must be incremental and demonstrable. Each screen or full-screen subflow has an independent ledger row that records five gates: the Kotlin state contract has been audited, the SwiftUI implementation exists, the iOS target compiles, the flow works in the iOS Simulator, and visual evidence has been captured and approved. A screen is not complete merely because a Swift file exists or Xcode compiles it.

The final behavior is visible by launching the iOS app, navigating through every route, tab, editor, and modal listed in the migration ledger, and observing only SwiftUI-rendered surfaces. Android must continue to render the Compose implementations and pass its existing regression suite.

## Progress

- [x] (2026-07-23 01:21Z) Read `PLANS.md`, inventoried the root `AppConfig` and `RootComponent.Child` navigation graph, and inspected all screen-shaped Compose entry points.
- [x] (2026-07-23 01:21Z) Inventoried the nested Profile, Event Detail, Organization Detail, Create Event, and Team Management surfaces that must be tracked separately from their parent routes.
- [x] (2026-07-23 01:21Z) Inspected the existing Discover SwiftUI bridge, `NativeViewFactory`, `UIHostingController` ownership, Kotlin `StateFlow` observation, and current Xcode target structure.
- [x] (2026-07-23 01:21Z) Defined the status vocabulary, durable evidence convention, state-coverage requirements, migration batches, and rollback rules in this plan.
- [ ] Milestone 0: add migration infrastructure, per-screen feature flags, a repeatable iOS build/UI-test harness, and baseline evidence storage.
- [ ] Milestone 1: migrate Splash, Login, and Profile Completion as the first end-to-end bridge examples.
- [ ] Milestone 2: migrate the visible app shell and primary-tab surfaces, and formally revalidate the existing Discover implementation.
- [ ] Milestone 3: migrate Profile and Chat routes, including every Profile child route and modal workflow.
- [ ] Milestone 4: migrate Organization Detail and all six organization tabs and checkout/review/rental flows.
- [ ] Milestone 5: migrate Event Detail, Match Detail, and their tab, editing, registration, scoring, and map flows.
- [ ] Milestone 6: migrate Create Event, Team Management, Event Management, and Refund Manager workflows.
- [ ] Milestone 7: remove all remaining visible iOS Compose fallbacks, complete the cross-version simulator matrix, and approve every ledger row.

## Surprises & Discoveries

- Observation: Discover is the only full feature screen already rendered in SwiftUI. Login has an `expect`/`actual` platform entry point, but its iOS implementation still calls the common Compose body.
  Evidence: `composeApp/src/iosMain/kotlin/com/razumly/mvp/eventSearch/EventSearchScreen.ios.kt` embeds `NativeDiscoverViewController`; `composeApp/src/iosMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.ios.kt` calls `AuthScreenBase`.

- Observation: The visible scope is much larger than the 15 root child types. Profile owns 13 routed child screens, Event Detail owns four dynamic tabs plus its overview and modal flows, Organization Detail owns six tabs, and Team Management owns separate builder and editor experiences.
  Evidence: `ProfileComponent.Child`, `DetailTab`, `OrganizationDetailTab`, and the full-screen branches in `TeamManagementScreen.kt` enumerate these surfaces.

- Observation: The iOS deployment target is 15.3, so the migration cannot require the iOS 17 Observation framework.
  Evidence: `iosApp/iosApp.xcodeproj/project.pbxproj` sets `IPHONEOS_DEPLOYMENT_TARGET = 15.3`. The existing Discover bridge correctly uses `ObservableObject`, `@Published`, and `@StateObject`.

- Observation: The current Xcode project has application and watch targets but no committed iOS unit-test or UI-test target.
  Evidence: `iosApp/iosApp.xcodeproj/project.pbxproj` contains only the `iosApp` and `MVPWatch` native targets.

- Observation: New Swift source files are manually enumerated in the Xcode project rather than automatically included through a synchronized folder group.
  Evidence: each file in `iosApp/iosApp/Discover/` has explicit `PBXFileReference`, `PBXBuildFile`, group, and Sources entries.

- Observation: `App.kt` still renders global visible chrome in Compose even when the active screen is SwiftUI.
  Evidence: `MVPBottomNavBar`, snackbars, loading overlay, update prompt, team check-in prompt, and `GuideHost` are composed around `AppContent`.

- Observation: local screen state is not consistently owned. Some workflow state lives in Kotlin components, while Team Management route selection and several pending-save states currently live in Compose `remember` values.
  Evidence: `TeamManagementScreen.kt` owns `createTeam`, `isSavingTeam`, `isRequestingRefund`, and `saveError` locally. Each migration must classify state before porting the UI.

- Observation: the local backend can return a successful HTTP response containing an MFA challenge rather than an authentication token, and the existing mobile login contract does not represent that state.
  Evidence: `/api/auth/login` returned `MFA_REQUIRED` for the simulator account until the explicit local MFA bypass was enabled. Authentication visual approval must cover this response rather than silently leaving the user on the form.

## Decision Log

- Decision: Keep `RootComponent` and each existing Kotlin feature component as the authoritative navigation and business-state owners.
  Rationale: this preserves the requested Kotlin view-model contract, Room-backed data flow, repository behavior, deep links, and Android behavior. Creating an independent Swift `NavigationPath` or Swift repository layer would introduce two sources of truth.
  Date/Author: 2026-07-23 / Codex

- Decision: Follow the existing Discover integration pattern for root screens: a common platform entry point, an Android actual that renders Compose, and an iOS actual that embeds a SwiftUI `UIHostingController` supplied by `NativeViewFactory`.
  Rationale: this permits one screen at a time to migrate without replacing the navigation system or blocking Android development.
  Date/Author: 2026-07-23 / Codex

- Decision: Use feature-specific `@MainActor ObservableObject` adapters only as Kotlin-to-Swift observation bridges.
  Rationale: iOS 15.3 requires `ObservableObject`/`@StateObject`. The adapter may mirror `StateFlow` values and call component actions, but it may not fetch from APIs, access Room, perform validation, or become a second business view model.
  Date/Author: 2026-07-23 / Codex

- Decision: Classify state before implementing each screen. Workflow/navigation, validation, loading, saving, and persisted selection state belongs in Kotlin; focus, scroll position, transient animation, and presentation-only sheet visibility may remain in SwiftUI.
  Rationale: blindly translating Compose `remember` state to `@State` can lose workflow state during controller updates or navigation restoration.
  Date/Author: 2026-07-23 / Codex

- Decision: Retain an iOS Compose fallback behind a per-screen migration flag until all five gates for that screen pass; remove the fallback only in the final cleanup milestone. Android Compose implementations remain permanently.
  Rationale: this makes every migration reversible and allows blocked screens to ship independently from completed screens.
  Date/Author: 2026-07-23 / Codex

- Decision: Include app chrome, global overlays, tabs, full-screen child flows, and parent-owned modal workflows in the definition of “every screen.”
  Rationale: marking only root routes complete would leave visible Compose UI and untested paths in the application.
  Date/Author: 2026-07-23 / Codex

- Decision: Require durable before/after visual artifacts and explicit human approval. A successful build or an agent statement that a screen “looks right” is insufficient.
  Rationale: the migration changes an entire UI framework, so layout, safe areas, typography, material effects, keyboard behavior, and native interaction need review in equivalent states.
  Date/Author: 2026-07-23 / Codex

- Decision: Use the booted iPhone 16 Pro on iOS 18.6 as the repeatable baseline simulator and add an iOS 26 simulator pass before final completion.
  Rationale: iOS 18.6 exercises the minimum-style material fallback paths currently in use, while iOS 26 verifies native Liquid Glass and newer runtime behavior.
  Date/Author: 2026-07-23 / Codex

## Outcomes & Retrospective

This document currently records planning and repository inventory only. No additional screen was converted while authoring it. The existing Discover SwiftUI implementation remains the reference bridge, but its rows stay open until durable, route-specific evidence is captured under this plan and visually approved.

At the end of each milestone, update this section with the completed rows, remaining blockers, regressions found on Android or iOS, and any architectural lessons that alter later batches. At final completion, state the number of approved migration units, confirm that no visible iOS Compose fallback remains, and link the final simulator evidence index.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-app`. `composeApp/` contains the shared Kotlin Multiplatform application and Compose UI. `iosApp/iosApp/` contains the Swift application target. The backend and authoritative API contract live in `/Users/elesesy/StudioProjects/mvp-site`; do not invent request or response shapes in Swift.

A “component” in this plan means an existing Kotlin object such as `EventSearchComponent`, `ProfileComponent`, or `EventDetailComponent`. A component exposes observable state, usually as Kotlin `StateFlow`, and action methods such as `refresh`, `selectTab`, or `onBackClicked`. It is the requested Kotlin view model and remains the source of truth after its UI becomes Swift.

A “Swift observation adapter” is a small `@MainActor` `ObservableObject` owned with `@StateObject` by a SwiftUI root view. It retains the Kotlin component, launches cancellable `Task` instances that iterate over exported Kotlin flows with `for await`, publishes values for SwiftUI, and forwards actions to the component. It owns no repositories and performs no domain work.

A “migration unit” is one independently visible route, tab, editor, or modal family that needs its own state coverage and visual evidence. A parent is not complete while any of its child units remain open.

The current app starts in `iosApp/iosApp/iOSApp.swift`, wraps Kotlin’s `MainViewController` through `ComposeView` in `ContentView.swift`, and lets `RootComponent` create the active `Child`. `AppContent` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/App.kt` selects the visible Compose screen. Discover is the precedent: `EventSearchScreen.ios.kt` embeds `NativeDiscoverViewController`, which owns `NativeDiscoverScreen` and `DiscoverObservableState` in Swift.

This plan does not require replacing the invisible Compose host or Decompose navigation runtime. Completion means every visible iOS surface produced inside that host is SwiftUI. The final app shell milestone converts the remaining visible bottom navigation and global overlays through the same platform bridge. SwiftUI must not create a second navigation stack for root application routes; user actions continue to call `RootComponent` and feature component navigation methods.

## Status Vocabulary and Gate Rules

Every ledger row uses the following exact values so progress remains unambiguous.

`Contract / state` is `Not audited`, `Ready`, or `Blocked`. `Ready` means every observable state, action, loading/error state, child route, and state owner has been listed and any required Swift-friendly projection exists in Kotlin.

`Swift UI` is `Compose`, `In progress`, `Swift`, or `Existing Swift`. `Swift` means the visible implementation and all child views for that row are SwiftUI and the iOS fallback flag can render it.

`Compile` and `Simulator` are `Not run`, `Pass <date>`, or `Fail <date>: <reason>`. Compile means the shared framework and iOS target both built. Simulator means a person or UI automation navigated to the surface and completed the row’s interaction recipe, not merely launched the app.

`Visual` is `Not captured`, `Captured`, `Changes requested`, or `Approved`. Only the user or an explicitly designated reviewer may move a row from `Captured` to `Approved`.

`Evidence` is a repository-relative path under `artifacts/ios-swift-screen-migration/<row-id>/`. Each directory must contain `evidence.md`, a Compose baseline screenshot when a comparable baseline exists, Swift screenshots, the semantic UI snapshot or interaction notes, and the exact build/test transcript summary.

A row may be called complete only when it reads `Ready`, `Swift` or `Existing Swift`, `Pass`, `Pass`, `Approved`, and has a durable evidence path. Parent rows require every child row in their group to meet the same rule.

## Migration Ledger

The ledger is deliberately detailed because it is the source of truth for “every screen.” Update the row immediately after each gate, never at the end of a batch.

### Global shell and shared platform surfaces

| ID | Migration unit | Kotlin owner or source | Contract / state | Swift UI | Compile | Simulator | Visual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 | Root visible shell and safe-area host | `RootComponent`, `App.kt` | Not audited | Compose | Not run | Not run | Not captured | — |
| G-02 | Bottom tabs, badges, center action, and tab selection | `RootComponent`, `MVPBottomNavBar.kt` | Not audited | Compose | Not run | Not run | Not captured | — |
| G-03 | Global loading, errors, snackbars, update prompt, check-in prompt, and onboarding guides | `App.kt`, `LoadingHandler`, `PopupHandler`, `GuideController` | Not audited | Compose | Not run | Not run | Not captured | — |
| G-04 | Shared map, date/time picker, dropdown, Stripe sheet, image picker, share sheet, and reusable cards | `NativeViewFactory` plus feature components | Not audited | In progress | Pass 2026-07-22 | In progress | Not captured | — |

### Startup, authentication, and Discover

| ID | Migration unit | Kotlin owner or source | Contract / state | Swift UI | Compile | Simulator | Visual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | Startup splash | `RootComponent.Child.Splash` | Not audited | Compose | Not run | Not run | Not captured | — |
| S-02 | Login, registration, email verification, Apple, Google, errors, and MFA response | `DefaultAuthComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| S-03 | Required profile completion | `ProfileCompletionComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| D-01 | Discover Events tab and event cards | `EventSearchComponent`, `MapComponent` | Ready | Existing Swift | Pass 2026-07-22 | Pass 2026-07-22 | Not captured | — |
| D-02 | Discover Orgs tab and organization cards | `EventSearchComponent`, `MapComponent` | Ready | Existing Swift | Pass 2026-07-22 | In progress | Not captured | — |
| D-03 | Discover Teams tab and team cards | `EventSearchComponent` | Ready | Existing Swift | Pass 2026-07-22 | In progress | Not captured | — |
| D-04 | Discover Rentals tab and rental cards | `EventSearchComponent`, `MapComponent` | Ready | Existing Swift | Pass 2026-07-22 | In progress | Not captured | — |
| D-05 | Discover search, suggestions, filter sheet, map search, and onboarding | `EventSearchComponent`, `MapComponent`, `GuideController` | Ready | Existing Swift | Pass 2026-07-22 | In progress | Not captured | — |

### Event, match, and chat

| ID | Migration unit | Kotlin owner or source | Contract / state | Swift UI | Compile | Simulator | Visual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-01 | Event Detail overview, header, host actions, and lifecycle controls | `EventDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| E-02 | Event participants and registration state | `EventDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| E-03 | Event bracket and division/pool selection | `EventDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| E-04 | Event schedule, fields, occurrences, and map | `EventDetailComponent`, `MapComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| E-05 | Event standings/league table and host point overrides | `EventDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| E-06 | Event edit, join, invite, withdrawal, payment, signing, and confirmation sheets | `EventDetailComponent`, `IPaymentProcessor` | Not audited | Compose | Not run | Not run | Not captured | — |
| M-01 | Match detail, scoring, official check-in, set editing, map, and dialogs | `MatchContentComponent`, `MapComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| C-01 | Chat list, unread state, search, empty/error/loading states | `ChatListComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| C-02 | Chat group, unavailable state, composer, attachments, members, and moderation actions | `ChatGroupComponent` | Not audited | Compose | Not run | Not run | Not captured | — |

### Create Event

| ID | Migration unit | Kotlin owner or source | Contract / state | Swift UI | Compile | Simulator | Visual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CR-01 | Create Event mode selection, simple setup pages, advanced sections, validation, and navigation | `CreateEventComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| CR-02 | Create Event preview, submission, success, and failure states | `CreateEventComponent.Child.Preview` | Not audited | Compose | Not run | Not run | Not captured | — |
| CR-03 | Create Event map, resource, field, timeslot, division, staff, registration-question, image, date, and price editors | `CreateEventComponent`, `MapComponent`, `IPaymentProcessor` | Not audited | Compose | Not run | Not run | Not captured | — |

### Profile

| ID | Migration unit | Kotlin owner or source | Contract / state | Swift UI | Compile | Simulator | Visual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | Profile route host and Home | `ProfileComponent.Child.ProfileHome` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-02 | Profile Details and profile photo through both root and Profile child routes | `ProfileDetailsComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-03 | Payments and Stripe account state | `ProfileComponent.Child.Payments` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-04 | Payment plans, installments, proof upload, and cancellation | `ProfileComponent.Child.PaymentPlans` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-05 | Memberships and cancel/restart actions | `ProfileComponent.Child.Memberships` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-06 | Event templates and seeded create flow | `ProfileComponent.Child.EventTemplates` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-07 | Children, child join requests, create/edit/link child | `ProfileComponent.Child.Children` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-08 | Connections, search, friend/follow/block actions | `ProfileComponent.Child.Connections` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-09 | Documents, text signature, web signing, and viewing | `ProfileComponent.Child.Documents` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-10 | Discounts, targeting, code generation, activation, and deletion | `ProfileComponent.Child.Discounts` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-11 | My Schedule, event navigation, and match navigation | `ProfileComponent.Child.MySchedule` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-12 | Invites, pending badge, accept/decline, and minor/parent states | `ProfileComponent.Child.Invites` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-13 | Notifications and save/debug states | `ProfileComponent.Child.Notifications` | Not audited | Compose | Not run | Not run | Not captured | — |
| P-14 | Profile billing-address, discount-code, checkout, loading, error, and web-document prompts | `ProfileComponent`, `IPaymentProcessor` | Not audited | Compose | Not run | Not run | Not captured | — |

### Organization Detail

| ID | Migration unit | Kotlin owner or source | Contract / state | Swift UI | Compile | Simulator | Visual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O-01 | Organization header and Overview tab | `OrganizationDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| O-02 | Organization Reviews tab and create/edit/delete review states | `OrganizationDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| O-03 | Organization Events tab and event navigation | `OrganizationDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| O-04 | Organization Teams tab and purchase/join navigation | `OrganizationDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| O-05 | Organization Rentals tab, availability, cart, and booking | `OrganizationDetailComponent`, `MapComponent` where used | Not audited | Compose | Not run | Not run | Not captured | — |
| O-06 | Organization Store tab, products, cart, and checkout | `OrganizationDetailComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| O-07 | Organization payment, signing, quantity, confirmation, review, and rental modal flows | `OrganizationDetailComponent`, `IPaymentProcessor` | Not audited | Compose | Not run | Not run | Not captured | — |

### Teams and management tools

| ID | Migration unit | Kotlin owner or source | Contract / state | Swift UI | Compile | Simulator | Visual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-01 | Team list, selected-team routing, free-agent context, loading, and empty/error states | `TeamManagementComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| T-02 | New-team builder and multi-step staff/player invitations | `TeamManagementComponent` plus builder draft state | Not audited | Compose | Not run | Not run | Not captured | — |
| T-03 | Team editor, roster, compliance, roles, schedule, and save/delete/leave actions | `TeamManagementComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| T-04 | Contact matching, invite links, refunds, confirmation, and sharing dialogs | `TeamManagementComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| A-01 | Event Management list and management navigation | `EventManagementComponent` | Not audited | Compose | Not run | Not run | Not captured | — |
| A-02 | Refund Manager list, detail/actions, loading, empty, and error states | `RefundManagerComponent` | Not audited | Compose | Not run | Not run | Not captured | — |

## State-Coverage Contract for Every Row

Before changing UI code for a row, add a `State coverage` section to that row’s `evidence.md`. It must name the exact Kotlin properties observed, the component methods invoked, and the owner of every mutable value visible in the old Compose screen. Classify each value as one of the following.

Business state includes fetched entities, Room-backed lists, permissions, prices, validation, loading, saving, errors, navigation destinations, selected canonical IDs, and pending operations. It stays in Kotlin or is promoted into the existing Kotlin component if Compose currently owns it.

Presentation state includes focus, scroll position, animation progress, an ephemeral popover, and temporary text before submission. It may live in SwiftUI `@State` when losing it during full route replacement would be harmless.

System state includes keyboard, color scheme, Dynamic Type, reduced motion, accessibility focus, location permission, photo permission, Apple/Google sign-in, maps, Stripe, and browser/document presentation. It is owned by the iOS framework but coordinated through existing component actions.

Every interactive row must exercise, where applicable, loading, loaded content, empty content, retryable error, non-retryable error, disabled/saving, success, cancellation, and restored/back-navigation states. Forms must also exercise keyboard dismissal, validation, scrolling to errors, date/time input, and interrupted submission. Lists must exercise pagination or refresh when supported. Tabs must exercise switching away and back without losing Kotlin-owned selection.

## Plan of Work

Begin with infrastructure rather than copying screens. Add a native-screen key and debug rollout configuration under `composeApp/src/iosMain/kotlin/com/razumly/mvp/` so each iOS actual can choose the Swift bridge or the existing Compose implementation. Keep flags disabled until a row passes contract and compile gates; enable them by default only after simulator and visual approval. The flag must never affect Android.

Standardize the bridge using Discover as the reference. For each root route, retain or create a common platform entry point. Rename the existing common Compose body to a clear `Compose...Screen` function. The Android actual delegates to it. The iOS actual embeds the feature’s `Native...ViewController` through `UIKitViewController`. Extend `NativeViewFactory` with explicit create/update methods using the feature’s existing Kotlin component type. The controller retains the component and one observation adapter; updates must change only external presentation inputs and must not recreate the component or its tasks.

For Profile, Create Event, and other components with a Decompose child stack, add a Swift-friendly route projection to the same component when the exported `ChildStack` is awkward to observe from Swift. The projection is a small enum or sealed-to-enum mapping such as `NativeProfileRoute` exposed as `StateFlow`. It mirrors the existing Kotlin child stack and never becomes an independent Swift navigation path. Swift back actions call `component.onBackClicked()`.

For Team Management and any screen where workflow state currently lives in Compose `remember`, move non-presentation state into the existing component before writing Swift. Add focused Kotlin tests proving route selection, saving flags, errors, and cancellation survive view recreation. Leave focus, scroll, and animation in Swift.

Place Swift files under feature folders in `iosApp/iosApp/Screens/`, for example `Screens/Auth/NativeAuthScreen.swift`, `Screens/Auth/AuthObservableState.swift`, and `Screens/Auth/NativeAuthViewController.swift`. Files over roughly 300 lines must be split into dedicated view types. Keep button bodies thin; call private action methods that forward to the Kotlin component. Add every new source to the `iosApp` target in `iosApp/iosApp.xcodeproj/project.pbxproj`, and review target membership before considering the compile gate passed.

Keep all API, Room, validation, payment coordination, and navigation logic in Kotlin. Swift may format values for native presentation only when the format is purely visual. If both platforms require the transformation, add a Kotlin presentation projection and test it in `commonTest` instead of duplicating it in Swift.

After each row compiles, run its simulator recipe and save evidence before beginning another row in the same feature. If visual review requests changes, mark `Changes requested`, keep the fallback available, and do not claim the row is complete.

## Milestones

### Milestone 0: Build the migration harness and freeze the inventory

Create the rollout flags, bridge conventions, evidence directory template, and a committed `iosAppUITests` target or equivalent repeatable Xcode UI-test harness. Add a smoke test that launches the app, asserts the login or authenticated shell, and takes a screenshot. Add a helper document under `artifacts/ios-swift-screen-migration/README.md` that explains evidence naming and approval. Capture the current Compose baseline for each screen that can be reached without modifying data.

This milestone is complete when a deliberately small test Swift screen can be enabled and disabled without changing Android, both paths compile, the iPhone 16 Pro simulator launches through the normal scheme, and the ledger/evidence update process has been exercised once.

### Milestone 1: Prove the bridge with startup and authentication

Migrate S-01, S-02, and S-03. These screens establish text fields, secure entry, keyboard handling, loading, inline/server errors, Apple and Google system flows, email verification, and root navigation replacement. The auth component contract must explicitly represent an MFA challenge or show a deliberate unsupported-state error; silently waiting on a missing token is not accepted.

This milestone is complete when fresh install, invalid login, valid login, logout-to-login, registration, profile completion, social login presentation, and MFA response handling have simulator evidence and approved visuals in light and dark appearance.

### Milestone 2: Convert global chrome and primary tabs

Migrate G-01 through G-03, revalidate D-01 through D-05, and migrate the primary entry surfaces C-01, P-01, and P-11. Preserve RootComponent’s selected tab, badge counts, center action, deep links, and guide completion. SwiftUI renders the bottom navigation and global overlays, but Kotlin remains the route authority.

This milestone is complete when switching all bottom tabs, using the center action, opening an unread chat badge, opening an invite badge, handling a global loading overlay and error, and completing/resetting an onboarding guide all work without visible Compose chrome.

### Milestone 3: Complete Profile and Chat

Migrate C-02 and P-02 through P-14. Work in small groups: identity/settings, billing/memberships, family/connections, documents/discounts, then invites/notifications. Profile’s Kotlin child stack remains authoritative, and each child screen receives independent evidence.

This milestone is complete when every Profile route can be opened from Profile Home, navigated back with both the button and edge gesture, restored through its root start destinations, and exercised in its loading/empty/content/error/action states. Chat must demonstrate send, receive, failure/retry, attachment or unavailable states, and navigation back to the list.

### Milestone 4: Complete Organization Detail

Migrate O-01 through O-07. Preserve dynamic tab visibility and canonical selected-tab state from `OrganizationDetailComponent`. Treat purchase, rental, review, signing, quantity, and payment presentations as part of completion rather than deferring them as “shared dialogs.”

This milestone is complete when each visible organization tab has content and empty-state evidence, hidden tabs remain hidden, direct navigation to an initial tab works, and checkout/rental/review actions complete or display a controlled test-environment result.

### Milestone 5: Complete Event and Match detail

Migrate E-01 through E-06 and M-01. This is a high-risk batch because the current Compose files are large and contain role-dependent editing, standings, brackets, scheduling, registration, scoring, official actions, and many sheets. Split Swift views by meaningful section, but keep event/match mutations in their Kotlin components and coordinators.

This milestone is complete when participant and host roles have separate evidence; every available Event Detail tab works; canonical division, pool, field, and match IDs remain intact; standings overrides survive refresh; match scoring and set confirmation work; and map, registration, withdrawal, payment, and document flows are exercised.

### Milestone 6: Complete creation and management workflows

Migrate CR-01 through CR-03, T-01 through T-04, and A-01 through A-02. Promote Compose-owned workflow state into Kotlin before translation. Use the existing event-form regression requirements for validation, payload mapping, and scheduler eligibility. Keep the full labeled rows clickable and preserve date-only DOB, 12-hour time, playoff-team-count validation, and canonical division rules from `AGENTS.md`.

This milestone is complete when a simple event and an advanced event can be created from start through preview; a team can be created and edited; event management opens the correct event; refund actions have controlled success/error confirmation; and every editor sheet has evidence at normal and large Dynamic Type.

### Milestone 7: Remove visible Compose fallback and certify the app

Search the iOS execution path for every call that can still render a common Compose screen, bottom bar, overlay, popup, or dialog. Remove migration flags and iOS fallback branches only after every ledger row is approved. Do not remove Android Compose functions. Run the complete Kotlin, Android, iOS framework, Xcode, and simulator suites. Repeat the critical flows on iOS 26 in addition to the baseline iOS 18.6 simulator.

This milestone is complete when all ledger rows meet every gate, an authenticated tour contains no visible Compose surface, deep links open Event, Match, and Invites routes correctly, both light and dark captures are approved, and Android’s Compose application still builds and passes tests.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-app` unless another working directory is stated. Keep Gradle on JDK 17:

    export JAVA_HOME=$(/usr/libexec/java_home -v 17)

Before a migration batch, inspect the working tree and preserve unrelated changes:

    git status --short
    git diff --check

For each row, locate the component contract and every Compose state read/action call. A typical audit uses:

    rg -n "collectAsState|subscribeAsState|remember|mutableStateOf|component\." composeApp/src/commonMain/kotlin/com/razumly/mvp/<feature>

Add or update focused Kotlin tests first. Run the narrow feature suite, then the common Android/JVM suite:

    ./gradlew :composeApp:testDebugUnitTest --tests '*<Feature>*'
    ./gradlew :composeApp:testDebugUnitTest

After any common screen rename, platform entry-point change, component projection, or model change, prove Android still compiles:

    ./gradlew :composeApp:assembleDebug

On macOS, run native Kotlin tests for affected components when available:

    ./gradlew :composeApp:iosSimulatorArm64Test

If the CocoaPods framework definition or dependencies changed, refresh the workspace; ordinary Swift source additions do not require this command:

    cd iosApp
    pod install
    cd ..

Use the iOS simulator workflow to list simulators, set the workspace `/Users/elesesy/StudioProjects/mvp-app/iosApp/iosApp.xcworkspace`, scheme `iosApp`, configuration `Debug`, and the booted iPhone 16 Pro, then build and run. The preferred workflow is the Xcode simulator tooling because it also provides semantic UI snapshots, taps, typing, waits, and screenshots. A command-line fallback is:

    xcodebuild \
      -workspace iosApp/iosApp.xcworkspace \
      -scheme iosApp \
      -configuration Debug \
      -sdk iphonesimulator \
      -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.6' \
      -derivedDataPath build/ios-swift-migration \
      CODE_SIGNING_ALLOWED=NO \
      build

For local authenticated tests, start the API source of truth in a separate terminal with the explicit development MFA bypass:

    cd /Users/elesesy/StudioProjects/mvp-site
    AUTH_MFA_DISABLED_LOCAL=true npm run dev:plain

Only start ngrok and Stripe forwarding for rows whose browser redirects or webhooks require them. Record their public origin in the row evidence and do not hard-code it in source.

For every visual state, capture equivalent Compose and Swift screenshots when the Compose surface still exists. Store them as:

    artifacts/ios-swift-screen-migration/<row-id>/<row-id>-<state>-<appearance>-compose.jpg
    artifacts/ios-swift-screen-migration/<row-id>/<row-id>-<state>-<appearance>-swift.jpg

Also save `evidence.md` with the commit hash, simulator model/runtime, account/role without secrets, backend fixture or entity IDs, exact navigation recipe, interactions performed, build/test result, screenshot names, and reviewer decision.

After updating a row, run:

    git diff --check
    git status --short

Do not batch-mark rows at the end of a milestone. Update the table and evidence immediately so an interruption cannot erase the actual state.

## Validation and Acceptance

Compilation acceptance requires all of the following for every completed row: the focused Kotlin tests pass, `:composeApp:assembleDebug` passes, the iOS simulator Kotlin tests for affected shared logic pass, and the `iosApp` Xcode scheme builds with the new Swift files in target membership. A Swift file that exists but is missing from the Xcode Sources phase is a failure.

Simulator acceptance requires reaching the screen through the real navigation path, not a preview alone. The tester must exercise the primary action, back navigation, refresh or retry where present, keyboard dismissal for forms, and at least one state transition driven by the Kotlin component. The semantic UI snapshot must expose meaningful accessibility labels for interactive controls.

Visual acceptance requires a loaded-content capture and every applicable exceptional state: loading, empty, error, disabled/saving, sheet/dialog, keyboard, and large Dynamic Type. Every row needs light appearance; user-facing forms and high-traffic detail screens need both light and dark. The baseline simulator is iPhone 16 Pro on iOS 18.6. Before final completion, repeat Splash, Login, Discover, Event Detail, Match Detail, Create Event, Profile, Organization Detail, map, payment, and global chrome on an iOS 26 simulator.

The visual reviewer checks safe-area use, bottom-bar clearance, navigation placement, title hierarchy, truncation, Dynamic Type, contrast, glass/material continuity, sheet detents, keyboard avoidance, scroll reachability, loading behavior, and tap targets. Pixel identity with Compose is not required; behavioral parity and a coherent native iOS design are required. Any review correction changes `Visual` to `Changes requested` and keeps the row open.

Final acceptance additionally requires these observable tours:

1. Fresh install reaches SwiftUI Splash and Login, authenticates, and reaches the SwiftUI shell without a visible Compose transition.
2. Bottom-tab navigation opens Discover, Chat, Schedule, and Profile with correct badges and center action.
3. Deep links open an Event, a Match, and Invites, and back navigation returns correctly.
4. Discover search/filter/map/onboarding works in each supported tab.
5. Event and Organization details expose every available tab and role-appropriate action.
6. Chat sends or reports failure; Create Event completes simple and advanced paths; Teams can create and edit; management/refund routes are reachable.
7. Global loading, error, update, guide, payment, map, date/time, dropdown, image, share, and document presentations are Swift/native.
8. `rg` and runtime inspection find no visible iOS call path that renders the common Compose screen bodies, while Android continues to call them.

## Idempotence and Recovery

The plan is intentionally incremental. Each native screen flag allows the iOS build to return to its Compose implementation without reverting Kotlin component work. Never delete the Compose body until Android has a platform actual that calls it and the final iOS cleanup milestone is complete.

Observation tasks must be cancellable and owned by one controller/adapter instance. Recreating a hosting controller must not create duplicate collectors or duplicate network actions. If a controller update causes state loss, stop and move workflow state into the Kotlin component rather than adding restoration hacks in Swift.

If a build fails after adding Swift files, first verify project target membership and the generated Compose framework API. If exported Kotlin names are unusable from Swift, add a small Swift-friendly Kotlin projection and a common test; do not bypass the component with a direct API call.

If simulator data prevents reaching a state, record the blocker and create or identify a deterministic local backend fixture. Do not silently substitute screenshots from a different screen or role. Never erase simulator or backend data without confirming the exact target and need.

If visual review rejects a screen, retain the evidence, mark `Changes requested`, add the requested correction to the row’s `evidence.md`, and recapture under a new filename rather than overwriting the prior comparison.

## Artifacts and Notes

Create the evidence root during Milestone 0:

    artifacts/ios-swift-screen-migration/
      README.md
      index.md
      G-01/
        evidence.md
      S-02/
        evidence.md
        S-02-loaded-light-compose.jpg
        S-02-loaded-light-swift.jpg

`index.md` should summarize only durable evidence and link back to the ledger row in this plan. The plan table remains authoritative for status; the artifact index is the reviewer-oriented gallery.

Keep terminal transcripts short. A useful evidence summary looks like:

    Kotlin focused tests: PASS (12 tests)
    Android assembleDebug: PASS
    iosSimulatorArm64Test: PASS
    Xcode iosApp Debug / iPhone 16 Pro iOS 18.6: BUILD SUCCEEDED
    Simulator recipe: Login -> Profile -> Payments -> Back
    Semantic controls: Back, Manage Stripe account, Edit billing address
    Visual review: Captured; approval pending

Do not store passwords, tokens, signing secrets, Stripe keys, Google keys, or private ngrok credentials in evidence.

## Interfaces and Dependencies

Keep `RootComponent`, `AppConfig`, and feature component interfaces in Kotlin. Add only the projections required for Swift interop. A typical component projection should resemble:

    enum class NativeProfileRoute {
        HOME,
        DETAILS,
        PAYMENTS,
        PAYMENT_PLANS,
        MEMBERSHIPS,
        EVENT_TEMPLATES,
        CHILDREN,
        CONNECTIONS,
        DOCUMENTS,
        DISCOUNTS,
        MY_SCHEDULE,
        INVITES,
        NOTIFICATIONS,
    }

    interface ProfileComponent {
        val nativeRoute: StateFlow<NativeProfileRoute>
        fun onBackClicked()
        // Existing state and actions remain authoritative.
    }

Use a platform entry point that preserves Android Compose and selects the iOS bridge:

    @Composable
    expect fun ProfileScreen(component: ProfileComponent)

    @Composable
    internal fun ComposeProfileScreen(component: ProfileComponent) {
        // Existing Compose implementation used by Android and fallback testing.
    }

The iOS `NativeViewFactory` remains the explicit UIKit boundary. Add feature-specific methods rather than passing untyped objects:

    fun createNativeProfileViewController(
        component: ProfileComponent,
        bottomPadding: Float,
    ): UIViewController

    fun updateNativeProfileViewController(
        viewController: UIViewController,
        bottomPadding: Float,
    )

The Swift observation adapter must retain the Kotlin component and cancel all collectors:

    @MainActor
    final class ProfileObservableState: ObservableObject {
        let component: ProfileComponent
        @Published private(set) var route: NativeProfileRoute
        private var observationTasks: [Task<Void, Never>] = []

        init(component: ProfileComponent) {
            self.component = component
            self.route = component.nativeRoute.value
            startObserving()
        }

        deinit {
            observationTasks.forEach { $0.cancel() }
        }
    }

Use `UIHostingController` to embed SwiftUI in the existing UIKit/Compose hierarchy. Use `ObservableObject` and `@StateObject` because iOS 15.3 is supported. Use Apple-provided SwiftUI controls, sheets, navigation bars, materials, accessibility APIs, and representables for UIKit-only system integrations. Reuse the existing Swift map, native date/time picker, dropdown, Stripe PaymentSheet, Google/Apple authentication, and image URL utilities instead of creating parallel implementations.

Do not add a Swift networking client, Swift database, or Swift copy of repository logic. Do not change backend contracts without aligning `/Users/elesesy/StudioProjects/mvp-site`. Do not replace canonical division IDs, event kinds, match IDs, or component validation with display-name or token matching.

---

Revision note (2026-07-23 01:21Z): created the initial complete migration inventory and gate-based execution plan because the requested scope includes every visible iOS route, nested screen, tab, and modal workflow, not only the root `AppConfig` destinations.

Revision note (2026-07-23 01:24Z): clarified that Profile Details must be validated through both of its navigation entry paths after auditing the ledger against every `AppConfig` branch.
