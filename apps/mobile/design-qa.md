# Discover event card design QA

## Source and implementation evidence

- iOS issue source: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/codex-clipboard-a17743a4-1ebe-4a36-bb04-5a89b266aa0d.png` (654 x 638).
- Android target source: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/codex-clipboard-090e6a1e-d0c9-4790-99ac-02948337fac5.png` (650 x 398).
- iOS host implementation: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_eb20c266-469e-4442-bdcd-3abb2a64592c.jpg` (368 x 800).
- iOS public-viewer and missing-price implementation: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_2400e8d5-5ff1-4c45-b794-23e4b5c5a864.jpg` (368 x 800).
- iOS long-content implementation: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_ea6c4096-fb11-400d-bb20-f4b49ab33c8e.jpg` (368 x 800).
- Android implementation: `/private/tmp/mvp-android-price-pill.png` (1280 x 2856).
- Normalized iOS issue/implementation comparison: `/private/tmp/discover-card-ios-latest-comparison.png` (1000 x 400).
- Normalized Android target/implementation comparison: `/private/tmp/discover-card-android-latest-comparison.png` (1000 x 400).
- Latest iOS layout reference supplied by the user: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/codex-clipboard-20571edd-1d20-4ba3-a8ee-533a93a49544.png` (686 x 1420).
- Stale Android build supplied by the user: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/codex-clipboard-8bb56033-6681-49b4-a4c3-c551015dc3a4.png` (692 x 1420).
- Final Android parity implementation: `/private/tmp/mvp-android-card-parity-final.png` (1280 x 2856).
- Final iOS simulator reference: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/screenshot_optimized_d8ff64c6-bbc2-4589-9638-2c2aca796bd9.jpg` (368 x 800).
- Final normalized live parity comparison: `/private/tmp/discover-card-parity-comparison.png` (1296 x 680).
- Android upper-quarter issue source: `/var/folders/_n/6dvz_rkj0y14dd6nvmr7x9r40000gn/T/codex-clipboard-ee93c8df-e317-4d5d-9383-284e09941cde.png` (634 x 665).
- Corrected Android Pacific card: `/private/tmp/mvp-android-haze-quarter-smooth-pacific-final.png` (1280 x 2856; card bounds 1184 x 1184).
- Normalized Android upper-quarter comparison: `/private/tmp/android-haze-quarter-smooth-comparison.png` (1200 x 600; supplied capture left, corrected emulator capture right).

The source and implementation show different event records. The comparisons therefore evaluate the glass start position, image preservation, metadata hierarchy, lifecycle visibility, and price treatment rather than exact artwork or copy.

## State and viewport

- iOS: authenticated Discover Events list on the iPhone 16 Pro Simulator, 368 x 800 screenshot.
- Android: `emulator-5554`, 1280 x 2856, freshly installed debug APK in the authenticated Discover list.

## Findings

- Pass — iOS haze removal: the implementation preserves a visibly clear upper image through roughly the first quarter of the card. The earlier source shows material wash extending through the logo and top whitespace.
- Pass — iOS gradient position: the mask stays fully clear through 24%, begins fading at 32%, and reaches near-full coverage at 70%. There is no solid horizontal panel edge.
- Pass — text contrast: lower metadata remains readable over green, purple, and gold initials images while the top of each image retains more detail and color.
- Pass — lifecycle visibility: the host-owned Weeknight Soccer card shows Published. The non-host Youth Soccer Clinic card does not show a lifecycle pill.
- Pass — missing price: the non-host Youth Soccer Clinic card renders `$N/A` in the same green price capsule as explicit `Free` and paid prices.
- Pass — range safety: common Kotlin tests preserve `$500.00 - $700.00` for division price ranges while applying `$N/A` only to genuinely missing affiliate prices.
- Pass — Android pricing/lifecycle parity: the final APK uses the green price capsule and limits Published to an event managed by the current viewer.
- Pass — interaction/layout preservation: map actions remain independently tappable; titles, divisions, skill levels, dates, registration labels, type, and price remain bottom-anchored.
- Pass — stale-build diagnosis: the supplied Android image contains the retired upper type/price block, circular pin action, and `Price not specified`; none appears in the fresh APK.
- Pass — ratio parity: the loaded Android event card measures 1184 x 1184 pixels in the accessibility hierarchy, matching SwiftUI's 1:1 contract. Loading placeholders now reserve that same ratio.
- Pass — typography parity: Android now uses explicit 17 sp title, 15 sp location, and 12 sp metadata styles, corresponding to SwiftUI headline, subheadline, and caption. The side-by-side comparison shows the same information hierarchy at normalized card size.
- Pass — layout parity: both cards use 12-point horizontal and 8-point vertical content insets, 5-point row spacing, 16-point corners, a map capsule in the location row, a calendar-led date row, and the type/green-price row anchored at the bottom.
- Pass — Athena contrast: the Android glass tint now ramps continuously to 98% black at the bottom while Haze blur intensity increases. Athena's title and all four metadata rows remain readable without a separate shadow overlay.
- Pass — visible upper-quarter onset: the earlier Android implementation started the progressive shader at 24%, but both the progressive intensity and tint alpha were near zero there, delaying perceptible darkening until near the card midpoint. The corrected treatment begins a low-intensity blur at 12%, introduces a subtle tint at 18%, and reaches a clearly visible 46% tint stop at 24%.
- Pass — transition continuity: the final Pacific card has no horizontal seam. Starting the shader before the target boundary allows the blur/tint product to reach useful contrast at one-quarter while preserving a gradual transition from the clear hero image.

## Comparison history

1. P1: Regular iOS Liquid Glass and a near-top mask made the whole image look fogged.
2. P1: Published was rendered from event state alone, exposing an administrative lifecycle pill to public viewers.
3. P1: Missing affiliate prices were long plain text, and prices were not visually grouped as a value.
4. Fix: changed to clear tinted glass, held the mask clear through the upper-quarter boundary, connected the current viewer to existing host/organization permission rules, and introduced a shared Discover price label plus green capsule.
5. Post-fix evidence: the normalized comparisons show a clearer hero image, host/non-host captures prove lifecycle gating, and both native platforms show the new price capsule.
6. Android upper-quarter correction: moved the mathematical start above the target boundary and shaped the tint stops so the *visible* darkening, rather than merely the shader bounds, is established by 24% of the card height.

## Validation

- Shared pricing and host-permission model tests: passed.
- Android focused `EventCard` tests: passed.
- Android 360 dp `$500.00 - $700.00` layout regression: passed.
- Android `:composeApp:assembleDebug`: passed.
- Android fresh APK install and launch on `emulator-5554`: passed.
- Android authenticated Discover visual capture: passed.
- Android final `EventCardUiTest`: 2 tests, 0 failures, 0 errors; includes the 1:1 bounds assertion.
- Android final debug assembly after square placeholders: passed in 1 minute 2 seconds.
- Android corrected upper-quarter `EventCardUiTest`: passed.
- Android corrected upper-quarter `:composeApp:assembleDebug`: passed in 1 minute 6 seconds.
- Android exact corrected APK install and launch on `emulator-5554`: passed.
- Android Pacific card capture and normalized same-event visual comparison: passed.
- Android in-card Map interaction, selected from the UI tree: passed; opened `Google Map` with `Close Map`.
- iOS native Xcode workspace build, install, and launch: passed in 186.9 seconds.
- iOS final incremental build after giving price ranges layout priority: passed in 37.5 seconds.
- iOS authenticated host, non-host, `$N/A`, and long-content visual captures: passed.
- iOS final parity rebuild, install, and launch: passed in 169.4 seconds.
- Live iOS/Android normalized comparison reviewed: passed.
- `git diff --check`: passed.

final result: passed
