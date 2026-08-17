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
- [x] (2026-07-23) Moved event type and price into a shared trailing metadata block at the lower-right of the image on Android and iOS, leaving the map action independently anchored at the upper-right.
- [x] (2026-07-23) Re-ran the targeted card/filter/typography tests, installed Android, and completed the native iOS simulator build; live card recapture was blocked because both simulators currently open to the login screen.
- [x] (2026-07-23 02:52Z) Reworked both event-card layouts from the latest iOS capture: reduced the empty hero area, moved the map action beside the venue, and placed event type and price in a compact final row.
- [x] (2026-07-23 03:02Z) Re-ran the focused Android card test and Android debug build; both completed successfully.
- [x] (2026-07-23 03:04Z) Rebuilt and launched the native iOS app, opened Discover, and visually compared the compact card against the supplied reference at a matched card size.
- [x] (2026-07-23 03:18Z) Anchored type and price at the bottom on Android and iOS, made long content consume space upward, and moved both gradient-glass ramps into the upper quarter of the card.
- [x] (2026-07-23 03:20Z) Added a long-content Android layout regression test and passed the focused tests plus `:composeApp:assembleDebug`.
- [x] (2026-07-23 03:27Z) Rebuilt iOS and visually confirmed bottom anchoring and the higher glass ramp in the authenticated Discover list.
- [x] (2026-07-23 03:34Z) Installed the final APK and captured short and denser event cards on Android, confirming the fixed bottom inset and higher Haze ramp.
- [x] (2026-07-23 03:48Z) Added the range-aware Discover price presentation: missing affiliate prices render as `$N/A`, all prices render in a green pill, and division ranges remain intact.
- [x] (2026-07-23 03:50Z) Connected the Discover component to the current-user state and limited Published badges to direct hosts, assistant hosts, or existing organization event managers.
- [x] (2026-07-23 03:55Z) Rebuilt and launched native iOS, then captured host and non-host cards to confirm conditional Published visibility, `$N/A`, and the clearer upper-quarter glass ramp.
- [x] (2026-07-23 03:58Z) Installed the final Android APK and visually confirmed the matching green price pill, conditional Published badge, and progressive Haze placement.
- [x] (2026-07-23 04:22Z) Compared the supplied iOS and Android captures against the current source and confirmed that the Android screenshot was an old build: it still had the superseded upper type/price block and circular pin button.
- [x] (2026-07-23 04:27Z) Replaced Android's fixed 232 dp card with the same square ratio as Swift, mirrored the Swift 17/15/12 text hierarchy with card-local Compose styles, and aligned the map, calendar, metadata, padding, and corner treatment.
- [x] (2026-07-23 04:28Z) Strengthened the Android glass itself with a transparent-to-92%-black tint brush and progressive blur, then added a square-ratio regression assertion and passed the focused tests plus debug assembly.
- [x] (2026-07-23 04:29Z) Installed the new APK on `emulator-5554`, captured the Athena card, measured its rendered bounds at 1184 x 1184 pixels, and verified its in-card Map action opens the Google Map surface.
- [x] (2026-07-23 04:32Z) Rebuilt and launched the Swift app on the iPhone 16 Pro Simulator, captured the authenticated Discover list, and reviewed a normalized side-by-side card comparison.
- [x] (2026-07-23 04:35Z) Made loading placeholders square as well and re-passed the focused Android tests and final debug assembly.
- [x] (2026-07-23 05:03Z) Corrected Android's upper-quarter ramp so visible darkening is established at 24% instead of merely starting a near-transparent shader there, passed the focused tests and debug build, installed the exact APK, and visually confirmed the Pacific card on `emulator-5554`.

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

- Observation: Keeping the map control and type/price facts in the fixed 170-point hero made the image area feel empty and disconnected those controls from the detail rows.
  Evidence: The July 23 iOS capture shows the map button isolated in the upper-right and type/price floating above the title, while the date and registration row already establishes a more efficient compact metadata pattern.

- Observation: A fixed leading spacer does not anchor the detail stack when the square event image determines the SwiftUI card height.
  Evidence: Short iOS cards retained a gap below type and price, while long date text moved those facts downward. A flexible leading spacer inside the full-height card produces the required inverse behavior.

- Observation: Beginning a progressive blur at zero intensity still leaves its upper half visually ineffective over bright logos.
  Evidence: The CEVA capture shows text bleeding into detailed imagery even though the Android Haze ramp technically began above it.

- Observation: Masking regular Liquid Glass from near the top makes the entire iOS image read as fogged even when the lower text remains legible.
  Evidence: The supplied PCU capture has visible material wash through the logo and upper whitespace; using clear glass and holding the mask transparent through 24% preserves the hero image before the contrast ramp begins.

- Observation: The shared price resolver already preserves explicit division ranges and differentiates a missing affiliate price from an explicit free price.
  Evidence: `displayPriceRangeLabel()` returns ranges such as `$500.00 - $700.00`, returns `Free` for explicit zero prices, and uses `Price not specified` only when an affiliate price is genuinely absent.

- Observation: The latest supplied Android screenshot was not rendering the current Discover card source.
  Evidence: It showed `Price not specified`, the old upper-left event type/price block, and the circular pin action. Current source and the freshly installed APK render `$N/A`, a green bottom price pill, and the inline Map capsule.

- Observation: Android's fixed 232 dp height and reduced global Compose typography were the remaining causes of platform drift even after the metadata was moved.
  Evidence: Swift used a 1:1 card with `.headline`, `.subheadline`, and `.caption`, while Compose used 232 dp with 15 sp, 11 sp, and 10 sp theme styles.

- Observation: A uniform dark Haze tint still left the transition too weak over Athena's bright white artwork.
  Evidence: The new live capture is readable only after the Haze tint itself became a vertical brush that reaches 92% black at the bottom while progressive blur continues to increase.

- Observation: Setting both the progressive Haze start and a transparent tint stop to 24% did not make the effect visibly begin one-quarter down the card.
  Evidence: Progressive Haze intensity multiplies the tint alpha. With both factors near zero at 24%, the supplied Pacific capture did not become meaningfully dark until around the midpoint.

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

- Decision: Keep type and price grouped, trailing-aligned, and separate from the map action.
  Rationale: The former lower-left placement competed with the event image and made the two short facts look attached to the title. A lower-right metadata block gives both values a stable edge while the upper-right map action remains easy to find and tap.
  Date/Author: 2026-07-23 / Codex

- Decision: Supersede the trailing metadata block with a compact bottom row: event type on the left and price on the right, both using the same small style as date and registration.
  Rationale: The latest capture showed that the hero still contained too much UI and unused space. A final two-column metadata row creates one consistent reading direction and keeps price easy to scan.
  Date/Author: 2026-07-23 / Codex

- Decision: Move the map action into the location row as a labeled pill and reduce the fixed image-only area from 170 to 128 points/dp.
  Rationale: Map is an action on the venue, so locating it beside the venue makes its purpose immediate. The smaller image-only area improves information density without shrinking the touch target or removing event imagery.
  Date/Author: 2026-07-23 / Codex

- Decision: Treat the final type/price row as the vertical anchor and allocate all flexible card height above the detail stack.
  Rationale: This keeps the last row at a consistent bottom inset. Short content gains image space above the title, while long titles and dates expand upward into that same space.
  Date/Author: 2026-07-23 / Codex

- Decision: Start the visible glass ramp in the upper quarter rather than merely starting a zero-intensity blur there.
  Rationale: Early nonzero intensity is necessary for contrast over bright, detailed logos before title content reaches the middle of the card.
  Date/Author: 2026-07-23 / Codex

- Decision: Hold the iOS glass mask fully transparent through 24% of the card, then fade in clear tinted glass through the lower content area.
  Rationale: “Three quarters up” means the contrast treatment should begin one quarter down from the top. `Glass.clear` preserves image detail better than regular glass while its tint still improves white-text contrast.
  Date/Author: 2026-07-23 / Codex

- Decision: Keep range calculation in common Kotlin and add only a Discover-specific missing-value label.
  Rationale: Both native SwiftUI and Compose now consume the same price range, including division min/max values, while `$N/A` does not alter price wording on unrelated detail and map surfaces.
  Date/Author: 2026-07-23 / Codex

- Decision: Treat direct hosts, assistant hosts, and organization viewers with existing event-management permission as hosts for Published-badge visibility.
  Rationale: These are the users who can act on event lifecycle state. Public viewers should not see an administrative Published badge.
  Date/Author: 2026-07-23 / Codex

- Decision: Make Android event cards and their loading placeholders 1:1, matching the native Swift card rather than preserving the old compact 232 dp height.
  Rationale: A shared ratio makes the image crop, content travel, and vertical anchoring comparable across platforms and prevents a large layout jump when loading completes.
  Date/Author: 2026-07-23 / Codex

- Decision: Give the Compose card explicit 17 sp title, 15 sp location, and 12 sp metadata styles instead of inheriting Android's smaller global theme scale.
  Rationale: These values directly mirror SwiftUI's default headline, subheadline, and caption hierarchy without undoing unrelated app-wide typography work.
  Date/Author: 2026-07-23 / Codex

- Decision: Darken the Android Haze through its `HazeTint` brush rather than adding a separate gradient overlay.
  Rationale: The contrast treatment remains part of the glass surface as requested, while the 24%-to-bottom progression supplies enough contrast over light logos.
  Date/Author: 2026-07-23 / Codex

- Decision: Start Android's progressive Haze at 12% with low intensity, keep its tint transparent through 12%, add a subtle stop at 18%, and reach a 46% black tint stop at 24%.
  Rationale: Advancing the mathematical ramp makes the combined blur-and-tint effect visibly established at the requested upper-quarter boundary. The intermediate stops prevent the hard seam produced by an abrupt intensity jump.
  Date/Author: 2026-07-23 / Codex

## Outcomes & Retrospective

The shared division and skill metadata is complete. The rejected lower-panel composition has been replaced by one full-card effect on both platforms. Android uses Haze's progressive shader so blur intensity and its dark tint ramp together; SwiftUI masks one dark glass/material surface so it fades in continuously instead of painting a second shadow or gradient over the image. Android's outer Material card elevation and SwiftUI's explicit card shadows were removed.

The compact follow-up layout now uses the venue row for a labeled Map action and places event type and price in a final small metadata row with type on the left and price on the right. That final row is now the vertical anchor: both SwiftUI and Compose fill a square card with a flexible spacer above the detail stack. Longer dates can wrap on Android and consume space upward without moving the final row.

Both glass ramps now preserve the clear upper hero while establishing contrast by the upper-quarter boundary. On Android, Compose begins a low-intensity progressive Haze at 12% so the multiplied blur/tint result is visibly engaged by 24%; the tint then continues smoothly to 98% black at the bottom. Swift holds its mask transparent through 24%, fades clear tinted glass in at 32%, and reaches near-full coverage only around 70%. The final Android Pacific comparison shows the ramp beginning higher without a solid transition line, while the Athena metadata remains readable against white artwork.

Discover prices now use compact green pills on both platforms. Explicit free pricing remains `Free`, genuinely missing affiliate pricing becomes `$N/A`, and shared Kotlin regression coverage confirms division prices still render as a min/max range. Published lifecycle pills are derived from the current viewer and appear only for direct hosts, assistant hosts, or organization event managers; the simulator captured both host-visible and non-host-hidden states. No backend or Room schema changes were required.

The last parity pass removes the remaining Android-only sizing and type drift. The fresh emulator render measured 1184 x 1184 pixels, the iOS reference remained square, both use matching title/location/metadata scale, and Android now includes the same map symbol, calendar row, 16-point corner treatment, and bottom-anchored information order. The supplied Android screenshot was an old build, not the current source.

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
    Compact Android EventCardUiTest: BUILD SUCCESSFUL
    Compact Android :composeApp:assembleDebug: BUILD SUCCESSFUL
    Compact iOS Xcode build/run: SUCCEEDED in 153.6s
    Compact iOS Discover capture: /var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_d6437680-7e18-4beb-9e83-e43866667291.jpg
    Matched-size source/implementation comparison: /private/tmp/discover-card-design-qa-comparison.png
    Bottom-anchor Android EventCardUiTest: BUILD SUCCESSFUL
    Final bottom-anchor Android tests + :composeApp:assembleDebug: BUILD SUCCESSFUL in 1m 26s
    Bottom-anchor iOS Xcode build/run: SUCCEEDED in 173.0s
    Revised iOS Discover capture: /var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_6f66c351-f033-4c18-8464-6e1791361e37.jpg
    Revised focused comparison: /private/tmp/discover-card-bottom-anchor-qa-comparison.png
    Final Android Discover capture: /private/tmp/mvp-android-bottom-anchor-gradient-final.png
    Final Android scrolled capture: /private/tmp/mvp-android-bottom-anchor-gradient-scrolled.png
    Android gradient comparison: /private/tmp/discover-card-android-gradient-qa-comparison.png
    Focused pricing/model + Compose card tests: BUILD SUCCESSFUL
    Narrow-card $500.00 - $700.00 Compose layout regression: BUILD SUCCESSFUL in 22s
    Final Android :composeApp:assembleDebug: BUILD SUCCESSFUL in 1m 36s
    Final iOS Xcode build/run: SUCCEEDED in 186.9s
    Final incremental iOS build/run after range layout priority: SUCCEEDED in 37.5s
    iOS host-state capture: /var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_eb20c266-469e-4442-bdcd-3abb2a64592c.jpg
    iOS non-host and $N/A capture: /var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_2400e8d5-5ff1-4c45-b794-23e4b5c5a864.jpg
    Android final pricing/lifecycle capture: /private/tmp/mvp-android-price-pill.png
    iOS source comparison: /private/tmp/discover-card-ios-latest-comparison.png
    Android source comparison: /private/tmp/discover-card-android-latest-comparison.png
    Final parity EventCardUiTest: tests=2 failures=0 errors=0
    Final parity Android tests + :composeApp:assembleDebug: BUILD SUCCESSFUL in 1m 2s
    Final parity Android capture: /private/tmp/mvp-android-card-parity-final.png
    Android loaded card bounds: 1184 x 1184 pixels
    Android interaction: in-card Map -> Google Map / Close Map
    Final parity iOS Xcode build/run: SUCCEEDED in 169.4s
    Final parity iOS capture: /var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_d8ff64c6-bbc2-4589-9638-2c2aca796bd9.jpg
    Final live side-by-side comparison: /private/tmp/discover-card-parity-comparison.png
    Corrected Android upper-quarter EventCardUiTest: BUILD SUCCESSFUL
    Corrected Android upper-quarter tests + :composeApp:assembleDebug: BUILD SUCCESSFUL in 1m 6s
    Corrected Android Pacific capture: /private/tmp/mvp-android-haze-quarter-smooth-pacific-final.png
    Corrected Android same-event comparison: /private/tmp/android-haze-quarter-smooth-comparison.png

Revision note (2026-07-23): Updated the living plan after correcting the Android visible upper-quarter onset, including focused tests, a fresh debug assembly/install, exact-card bounds, and a normalized Pacific same-event comparison.
