# Add gradient glass and division metadata to Discover event cards

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Discover event cards on Android and iOS should use the event image as more than a flat backdrop. One full-card glass layer will begin transparently in the upper image and progressively increase its blur and dark tint toward the bottom so white text stays readable without creating a panel boundary. Each card will also show a compact summary of its divisions and skill levels, allowing someone browsing Discover to judge fit before opening the event.

The completed behavior is visible by opening Discover on either platform with an event that has explicit `divisionDetails`: the card has a continuous translucent haze that starts above the text, becomes progressively blurrier and darker toward the bottom, and includes a compact metadata line such as `Divisions: 14U, 16U  ·  Skills: Intermediate`.

## Progress

- [x] (2026-07-22 22:11Z) Inspected the shared Compose event card, the native Swift event card, and the canonical event division model.
- [x] (2026-07-22 22:14Z) Added a shared Kotlin formatter for compact division and skill-level summaries and rendered it in Compose.
- [x] (2026-07-22 22:15Z) Rendered the shared metadata in Swift and tuned both gradient-glass implementations.
- [x] (2026-07-22 22:18Z) Added and passed regression tests for summary formatting and compact card rendering.
- [x] (2026-07-22 22:28Z) Built and exercised Android on `emulator-5554` and iOS on the booted iPhone 16 Pro Simulator.
- [x] (2026-07-22 22:34Z) Reproduced the unwanted horizontal seam and confirmed that it came from attaching blur only to the lower details container.
- [x] (2026-07-22 22:36Z) Replaced the lower Android panel with one full-card Haze layer whose blur intensity and dark tint increase progressively from the upper image through the card bottom.
- [x] (2026-07-22 22:36Z) Replaced the lower Swift panel with one full-card glass/material layer masked from transparent to opaque and removed the separate shading gradients and card shadows.
- [x] (2026-07-22 22:52Z) Re-ran the Android build and rebuilt the final iOS production entry point after removing the temporary preview harness.
- [x] (2026-07-22 22:53Z) Re-captured Android and the isolated iOS material fallback, verified continuous transitions without a solid boundary, and re-verified the Android map action through the accessibility hierarchy.

## Surprises & Discoveries

- Observation: The Android event card already computes a division label and carries it in `NativeEventCardData`, but `ComposeEventCard` never places that label in the UI.
  Evidence: `EventCard.kt` sets `divisionLabel` while the detail column renders only title, location, date, and registration type.

- Observation: Both platforms already have blur-capable materials, but opaque dark tinting makes the blur read as a flat fill.
  Evidence: Android applies `HazeMaterials.ultraThin` followed by black opacity from 0.34 to 0.52; Swift overlays native glass or material with black opacity from 0.48 to 0.62.

- Observation: Haze accepts a `Brush` directly in `HazeTint`, but that only varies the tint and does not by itself vary blur intensity.
  Evidence: The locally cached Haze 1.7.2 source defines `HazeTint(brush: Brush)`, while the first emulator capture still showed the details container boundary.

- Observation: A gradient tint does not make the blur itself progressive, and attaching that effect to the details column still produces a hard horizontal boundary.
  Evidence: The post-change captures showed an abrupt material transition exactly where the 170 dp hero ended and the details column began.

- Observation: Haze 1.7.2 has a dedicated `HazeProgressive.verticalGradient` API that varies actual blur intensity and modulates its tint through the same alpha progression.
  Evidence: The local Haze source documents `startIntensity`, `endIntensity`, and a progressive render shader; this is a closer match to the requested effect than a gradient `HazeTint` alone.

- Observation: The first Xcode simulator automation call timed out at five minutes while compiling Pods, but it had populated DerivedData rather than failed compilation.
  Evidence: A retry against the same DerivedData completed successfully in 33.1 seconds, then the app installed and launched as process 19189.

- Observation: Android initially showed loading placeholders, then resolved live/cached event content without clearing app data.
  Evidence: The final hierarchy contains `Division: 4th, 5th, 6th  ·  Skill: Open`, and tapping the first `View on Map` accessibility bounds opened a hierarchy containing `Google Map` and `Close Map`.

## Decision Log

- Decision: Derive card metadata only from the event's canonical division identifiers and explicit `divisionDetails`, and do not infer a skill level from display-name text.
  Rationale: This follows the repository rule that division behavior must use canonical IDs and explicit metadata instead of fallback token matching.
  Date/Author: 2026-07-22 / Codex

- Decision: Keep division and skill metadata on one ellipsized line.
  Rationale: The information becomes visible without allowing long division catalogs to make cards substantially taller.
  Date/Author: 2026-07-22 / Codex

- Decision: Use a gradient brush as the Compose Haze tint, and on SwiftUI place the equivalent translucent gradient above native glass or material.
  Rationale: The blur needs unpainted image content behind it to sample; a lower-opacity progressive tint supplies contrast while preserving the image-derived glass appearance.
  Date/Author: 2026-07-22 / Codex

- Decision: Supersede the prior lower-panel composition with one full-card progressive effect on each platform.
  Rationale: The prior decision left the effect container boundary visible. Android now uses Haze's actual progressive blur with a uniform dark glass tint, while Swift masks a uniformly dark native glass/material layer. Neither platform paints a separate dark gradient over the card.
  Date/Author: 2026-07-22 / Codex

- Decision: Export a small `NativeEventCardMetadata` projection from common Kotlin and call it from Swift instead of duplicating division formatting in `DiscoverCards.swift`.
  Rationale: Both platforms now use the same canonical metadata and truncation rules, keeping the existing Kotlin presentation contract as the source of truth.
  Date/Author: 2026-07-22 / Codex

## Outcomes & Retrospective

The shared division and skill metadata is complete. The rejected lower-panel composition has been replaced by one full-card effect on both platforms. Android uses Haze's progressive shader so blur intensity and its dark tint ramp together; SwiftUI masks one dark glass/material surface so it fades in continuously instead of painting a second shadow or gradient over the image. Android's outer Material card elevation and SwiftUI's explicit card shadows were removed. Simulator captures show no hard horizontal boundary, and the Android map control remains interactive. No backend, Room schema, or data-contract changes were required.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-app`. `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt` builds the shared Compose presentation used on Android. It converts an `Event` into `NativeEventCardData` and uses the Haze library to blur the event image beneath the details panel. `iosApp/iosApp/Discover/DiscoverCards.swift` builds the native SwiftUI Discover cards and uses native Liquid Glass on iOS 26 or an ultra-thin material on older versions.

An `Event` is defined in `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`. Its `divisions` list contains canonical identifiers. Its `divisionDetails` list contains explicit presentation metadata, including `name` and `skillDivisionTypeName`. `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/util/EventDivisionDisplay.kt` already converts canonical division IDs into user-facing labels.

Here, “gradient glass” means one backdrop-sampling glass or material layer whose visibility and intensity increase vertically. It does not mean placing a separate dark gradient or shadow over the card.

## Plan of Work

First, add small pure formatter functions alongside the Compose event card. They will generate bounded summaries from `Event.divisionDisplayLabels()` and from distinct nonblank `skillDivisionTypeName` values on the event's explicit division details. The formatter will keep the first two values and append a `+N` count for the remainder. `NativeEventCardData` will gain a `skillLevelLabel`, and `ComposeEventCard` will render a single metadata row between location and date.

Next, attach one progressive Haze effect to the whole Compose card so actual blur intensity and dark tint increase together. In Swift, mask one full-card glass/material surface from transparent to opaque, add the metadata row, remove separate darkening overlays and shadows, and keep the native `glassEffect` availability fallback.

Then add pure Kotlin formatter coverage plus an Android Compose UI assertion that both pieces of metadata are displayed. Build Android and iOS, run each app in its simulator/emulator, inspect the resulting UI, and record any environment limitations here.

## Concrete Steps

Run all commands from `/Users/elesesy/StudioProjects/mvp-app`.

After editing, run the focused Android tests:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:testDebugUnitTest --tests '*EventCard*'

Then compile the full Android debug app:

    JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :composeApp:assembleDebug

Use the repository-configured iOS workspace and scheme with the Xcode simulator workflow. A successful build must be followed by a runtime UI snapshot or screenshot that proves the app launched.

## Validation and Acceptance

The formatter tests prove empty skill metadata is omitted, a single division and skill are labeled in the singular, and more than two distinct values are truncated with a `+N` suffix. The Compose UI test finds the resulting division and skill text on a 360 dp-wide card. The focused command completes with four new/relevant tests and zero failures.

On Android, Discover must show a continuous haze where the event image remains clear at the top and becomes progressively blurrier and darker through the text area. Division and skill text must fit on one line or ellipsize rather than stretching the card. The map button and card tap must remain operable.

On iOS, the same metadata must appear in the native SwiftUI card. On iOS 26, the surface must use native glass; on earlier supported simulators, it must use the material fallback. The masked glass must visibly preserve more image color at the top than at the bottom without a solid transition line.

## Idempotence and Recovery

The source edits and test commands are safe to repeat. Gradle and Xcode build output is generated and should not be committed. If Simulator or emulator state prevents visual confirmation, rebuild once, relaunch without erasing app data, and document the exact limitation rather than deleting user state.

## Artifacts and Notes

The card metadata contract intentionally remains presentation-only. It does not change Room entities, the database version, or the backend API.

Validation evidence:

    EventCardMetadataTest: tests=3 failures=0 errors=0
    EventCardUiTest: tests=1 failures=0 errors=0
    :composeApp:assembleDebug: exit 0
    Corrected :composeApp:assembleDebug: exit 0
    Corrected Xcode production simulator build: Build succeeded in 33.6s
    iOS material fallback preview: continuous fade, no horizontal boundary
    Android interaction: View on Map -> Google Map / Close Map
    Android final capture: /private/tmp/mvp-android-progressive-final.png
