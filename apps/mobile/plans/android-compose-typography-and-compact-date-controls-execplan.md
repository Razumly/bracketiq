# Calibrate Android Compose typography and compact Discover date controls

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

The Android app currently uses the unmodified Material 3 type scale, which makes many Compose labels and controls appear larger than the equivalent native SwiftUI surfaces. The Discover filter sheet also renders dates as tall outlined text fields, while iOS uses short label-and-value rows. After this work, Android Compose surfaces that rely on `MaterialTheme.typography` will use a slightly smaller, internally consistent type scale, and the Discover date controls will use compact tappable value containers that fit comfortably in the bottom sheet. A user can verify the result by opening Discover, tapping Filter, and comparing the sheet to the native iOS filter: headings and body copy are denser, date text is not clipped, and date controls no longer resemble editable text fields.

## Progress

- [x] (2026-07-22 21:24Z) Inspected the shared Compose theme, Android filter implementation, native SwiftUI filter controls, and current emulator rendering.
- [x] (2026-07-22 21:31Z) Added an Android-only compact Material typography scale while preserving the existing iOS Compose scale.
- [x] (2026-07-22 21:31Z) Added an Android regression test that pins representative display, headline, title, body, and label sizes.
- [x] (2026-07-22 21:31Z) Replaced Discover's outlined date fields with compact iOS-style label/value rows and an explicit optional-end-date switch.
- [x] (2026-07-22 21:31Z) Updated the existing date-control Compose test for the new layout, picker action, and end-date behavior.
- [x] (2026-07-22 21:41Z) Ran the targeted core typography and Compose filter suites, compiled the iOS simulator core UI source set, and installed the debug app on `emulator-5554`.
- [x] (2026-07-22 21:41Z) Inspected the live filter sheet with price and end date disabled, end date enabled, and both price and end date enabled; also verified the lower controls remain reachable by scrolling while Apply stays fixed.

## Surprises & Discoveries

- Observation: `core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/MVPTheme.kt` does not currently pass a `Typography` object, so Compose uses the stock Material 3 scale everywhere.
  Evidence: `MaterialTheme` is called with only `colorScheme` and `content`.

- Observation: The native iOS filter does not use text fields for dates. It uses compact `DatePicker` rows and a separate end-date toggle.
  Evidence: `NativeDateRangeFilter` in `iosApp/iosApp/Discover/DiscoverFilterControls.swift` renders “Starts on or after,” “Set an end date,” and a conditional “Starts on or before” compact picker.

- Observation: The Android filter styling work immediately preceding this plan is intentionally uncommitted in `SearchBox.kt` and `InputControlsUiTest.kt`; this plan extends those exact edits rather than reverting or replacing them wholesale.
  Evidence: `git status --short` lists only those two modified files before this plan is created.

- Observation: `LocalDate.Format` builder punctuation helpers require importing `kotlinx.datetime.format.char` in this source file.
  Evidence: The first Android compile failed with three `Unresolved reference 'char'` errors; adding the formatter import made the targeted suite pass.

- Observation: `surfaceContainerLow` and `surfaceContainerHighest` are both `0xFFE7EDF3` in the light app scheme, so using those two roles for the sheet and date capsule produced no visible container contrast.
  Evidence: The first emulator screenshot showed the compact date value without a visible capsule. Using `onSurface` at 8 percent alpha produced a subtle adaptive capsule in the final screenshot.

## Decision Log

- Decision: Apply the smaller type scale through an Android platform typography value rather than changing `LocalDensity.fontScale`.
  Rationale: Theme typography reduces defaults while preserving Android accessibility font scaling. Replacing `fontScale` would also shrink explicitly sized text and would ignore a user's accessibility preference.
  Date/Author: 2026-07-22 / Codex

- Decision: Keep the iOS Compose typography at the Material default and make only the Android actual value compact.
  Rationale: The request is to bring Android/Compose closer to native iOS. Shrinking Compose content hosted on iOS would move the reference platform too and make comparison unstable.
  Date/Author: 2026-07-22 / Codex

- Decision: Model the end date explicitly with a switch and reveal its date row only when enabled.
  Rationale: This matches the native iOS interaction, reduces the default sheet height, and makes “no end date” an explicit state rather than a placeholder inside a large field.
  Date/Author: 2026-07-22 / Codex

## Outcomes & Retrospective

Android Compose now receives a complete compact Material type scale through the shared theme while iOS Compose retains the stock Material scale. The Discover filter now mirrors native SwiftUI with a short start-date row, an explicit end-date switch, and a conditional short end-date row. The date capsules remain legible in the app's light theme without reverting to tall outlined fields.

The core typography test and both affected Compose filter test classes pass. `:core:ui:compileKotlinIosSimulatorArm64` also succeeds, confirming the platform theme hook is complete. Emulator inspection at 720 by 1608 pixels verified the disabled, end-enabled, and price-plus-end-enabled sheet states. The tallest state scrolls to Distance while Apply Filters stays fixed.

The compact type scale affects components that use `MaterialTheme.typography` or Material component defaults. Deliberately explicit sizes used for special surfaces such as scoreboards remain unchanged; this preserves intentional display typography rather than indiscriminately overriding Android accessibility scaling.

## Context and Orientation

The repository is a Kotlin Multiplatform mobile application. Shared Compose UI is under `composeApp/src/commonMain`, reusable theme code is in the `core/ui` module, Android platform implementations are under `androidMain`, and native SwiftUI Discover code is under `iosApp/iosApp/Discover`.

`core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/MVPTheme.kt` is the root Compose theme used by Android in `composeApp/src/androidMain/kotlin/com/razumly/mvp/MainActivity.kt` and by Compose-hosted iOS screens in `composeApp/src/iosMain/kotlin/com/razumly/mvp/MainViewController.kt`. “Typography” means the named Material text roles such as `bodyMedium`, `titleSmall`, and `headlineLarge`. Most Compose components obtain their default font size from those roles.

`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchBox.kt` owns `EventFilterSheet`, `DateFilterSection`, and the tappable date controls. The sheet stores its selected date range in `EventFilter.date`, a pair whose first value is the required start instant and whose optional second value is the end instant. The Android date picker is already opened by `PlatformDateTimePicker`; this work changes the compact control that launches it, not the picker implementation.

`iosApp/iosApp/Discover/DiscoverFilterControls.swift` is the visual and interaction reference. Its `NativeDateRangeFilter` presents a compact start row, an end-date switch, and a conditional compact end row.

## Plan of Work

First, introduce a common expected `Typography` value beside `MVPTheme`. Add Android and iOS actual values in the corresponding `core/ui` source sets. Android will copy every stock Material 3 text role with a modestly smaller font size and line height, while iOS will retain `Typography()` unchanged. Pass this value to `MaterialTheme`. Add an Android unit test that asserts representative display, headline, title, body, and label roles so later dependency upgrades cannot silently restore the oversized defaults.

Second, refactor `DateFilterSection` in `SearchBox.kt`. Replace the two outlined fields with `CompactFilterDateRow`, a full-width clickable row containing a descriptive label on the left and a rounded filled value container on the right. The value container is display-only and therefore should have no text-field border, cursor, or floating label. Add a `Switch` labeled “Set an end date”; enabling it writes a deterministic end-of-day value for the current start date into `EventFilter.date`, and disabling it restores the explicit null end state. Continue using `PlatformDateTimePicker` for date selection. Format displayed dates with abbreviated month, day, and year so they mirror the SwiftUI compact picker.

Third, update `InputControlsUiTest` to assert the compact row semantics, full-width ordering, end-date toggle behavior, and the existing ability to open the picker. Retain the existing filter-sheet tests for price validation and dismissal.

Finally, run the targeted Android unit tests, install the debug build on the existing emulator, launch Discover, open Filter using UI-tree-derived coordinates, and inspect screenshots with price disabled/enabled and end date disabled/enabled. Acceptance requires that normal filter text is visibly smaller than the pre-change screenshot, compact date values fit without clipping, enabling the end date reveals exactly one additional compact row, and the fixed Apply Filters action remains reachable.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app`.

Create the platform typography implementation and tests, then run:

    ./gradlew :core:ui:testDebugUnitTest :composeApp:testDebugUnitTest --tests com.razumly.mvp.core.presentation.composables.InputControlsUiTest --tests com.razumly.mvp.core.presentation.composables.SearchBoxUiTest

If `core:ui` does not expose `testDebugUnitTest`, inspect `./gradlew :core:ui:tasks --all` and use its Android unit-test task while preserving the Compose app test command.

Install and launch the app with:

    ./gradlew :composeApp:installDebug --console=plain --quiet
    /Users/elesesy/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell am force-stop com.razumly.mvp
    /Users/elesesy/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell am start -n com.razumly.mvp/.MainActivity

Dump the UI tree before selecting controls, derive coordinates from the tree, and capture screenshots with the helper scripts in the Android emulator QA skill. Do not derive tap coordinates from screenshots.

Expected test output ends with:

    BUILD SUCCESSFUL

## Validation and Acceptance

The Android compact typography test must prove that representative Material roles resolve to the new smaller Android values and that the iOS source still returns the default type scale by code inspection and successful iOS source-set compilation when available.

The Compose input-control test must prove that the start-date row is enabled, exposes the “Starts on or after” accessibility label and its current value, and opens the platform date picker. It must also prove that “Set an end date” begins unchecked for a null end instant, that selecting it updates the filter with a non-null end instant, and that the “Starts on or before” date row then exists.

On the emulator, Discover > Filter must show smaller headings, summaries, buttons, and field text than the pre-change screenshot. The start date must be a short label/value row rather than an outlined field. With no end date, the end row must be absent. After enabling the end-date switch, the end row must appear and remain fully visible after scrolling. Price fields must retain their sheet-colored fill and text-colored borders from the preceding fix.

## Idempotence and Recovery

The changes are source-only and can be rebuilt repeatedly. Gradle tasks and ADB install commands are safe to rerun. If an expected/actual declaration fails to resolve, ensure the declarations use the same package, name, visibility, and type in `commonMain`, `androidMain`, and `iosMain`. If emulator state prevents reaching Discover, force-stop and restart the package; do not clear app data because onboarding and authenticated state are useful for this verification. Existing uncommitted filter edits must be preserved throughout.

## Artifacts and Notes

The pre-change Android filter screenshot is provided in the task and shows stock Material sizing plus tall outlined date fields. The iOS reference screenshot shows compact date value pills and a separate end-date switch. Final emulator evidence is `/private/tmp/android-compact-calibrated-filter.png`; the combined price-and-end-date state is `/private/tmp/android-compact-final-tall.png`. The final UI tree records 48dp compact date rows and a fixed Apply Filters action.

## Interfaces and Dependencies

In `core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/MVPTheme.kt`, define an internal expected value with this interface:

    internal expect val MVPAppTypography: Typography

In `core/ui/src/androidMain` and `core/ui/src/iosMain`, define matching `actual` values. Android returns the compact scale; iOS returns `Typography()`.

In `SearchBox.kt`, `DateFilterSection` must accept the filter update callback so the end-date switch can update `EventFilter.date`. The compact date row must remain a semantic button and preserve the existing start/end picker callbacks. No new library dependency is required.

Plan revision note: 2026-07-22 initial plan created after comparing the stock Compose theme, the current Android filter sheet, and `NativeDateRangeFilter` on iOS.

Plan revision note: 2026-07-22 implementation completed and the plan updated with compile discovery, theme-token collision, test results, iOS compatibility, and emulator evidence.
