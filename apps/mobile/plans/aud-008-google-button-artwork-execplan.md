# Isolate Google sign-in artwork by mobile platform

This ExecPlan is a living document maintained according to `PLANS.md`. The required `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections must remain current while the work proceeds.

## Purpose / Big Picture

The shared UI module currently compiles four complete Google sign-in button illustrations for every target, even though Android uses only the two Android variants and iOS uses only the two iOS variants. After this change, the same Google sign-in button remains visible and clickable in light and dark themes, while each target compiles only its own official platform artwork. This closes audit finding `AUD-008` without changing authentication behavior or the button's rendered dimensions.

## Progress

- [x] (2026-07-14 15:36Z) Recovered the audit context and confirmed no prior AUD-008 branch, worktree, commit, or dirty file set exists.
- [x] (2026-07-14 15:36Z) Created isolated worktree `/private/tmp/mvp-app-aud008-recovery` at canonical mobile commit `20f11938` on branch `codex/aud008-artwork-recovery`.
- [x] (2026-07-14 15:38Z) Moved the Android and iOS vector sources out of `commonMain` and introduced a narrow expect/actual artwork resolver.
- [x] (2026-07-14 15:44Z) Added a source-set contract regression and four focused artwork/layout tests.
- [x] (2026-07-14 15:47Z) Compiled Android and iOS production code, compiled the iOS test source, ran the four focused Android tests, and assembled the complete Android debug app.
- [x] (2026-07-14 15:48Z) Committed the isolated implementation and validation slice as `929f5e1f`; it is ready to cherry-pick onto canonical mobile.

## Surprises & Discoveries

- Observation: the four vector sources still total 2,636 lines and 150,124 bytes at the canonical recovery base.
  Evidence: `wc -l -c core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/*GoogleButton*.kt` reports four files, 2,636 total lines, and 150,124 total bytes.
- Observation: no AUD-008-specific ExecPlan or implementation branch existed when recovery began.
  Evidence: `git worktree list`, branch/ref scanning, the reflog, and dirty-worktree inspection found no AUD-008 implementation state.
- Observation: running the iOS simulator test executable concurrently with another mobile Gradle workload exhausted the machine's available build resources after compilation and during native test linking.
  Evidence: `compileKotlinIosSimulatorArm64` and `compileTestKotlinIosSimulatorArm64` completed, then the single-use Gradle daemon disappeared while `linkDebugTestIosSimulatorArm64` was active. A subsequent Android assembly initially reported no disk space; after reproducible build artifacts were cleared, the same constrained Android assembly passed. The high-memory iOS test link was not retried while AUD-004 Gradle work remained active.

## Decision Log

- Decision: preserve the exact existing `ImageVector` geometry and move it into target source sets rather than redrawing or approximating the branded button.
  Rationale: the audit concern is shared-source and cross-target build bloat; preserving the vectors avoids an unnecessary visual or branding change.
  Date/Author: 2026-07-14 / Codex.
- Decision: make common code depend on one expect/actual artwork resolver that returns both the platform vector and its aspect ratio.
  Rationale: common code should own click behavior, accessibility, and sizing while platform code is the only code that can reference platform artwork.
  Date/Author: 2026-07-14 / Codex.

## Outcomes & Retrospective

The bounded implementation is complete, validated, and committed as `929f5e1f`. There is now zero Google button vector payload in `commonMain`, two variants in `androidMain`, and two variants in `iosMain`. The source-set contract passed; all four focused theme, sizing, and fail-closed tests passed; Android and iOS production code compiled; iOS test source compiled; and the complete Android debug app assembled successfully. The exact vector blob hashes are unchanged from the recovery base, so the 189:40 Android and 199:44 iOS artwork is preserved byte for byte. Only the native iOS test executable link/run remains unobserved because it collided with concurrent build-resource pressure after successful compilation; final combined validation can run it once the other mobile Gradle work is idle.

## Context and Orientation

`core/ui/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/GoogleSignInButton.kt` renders the button used by `composeApp/src/commonMain/kotlin/com/razumly/mvp/userAuth/AuthScreen.kt`. It currently checks `Platform.isIOS` and imports four extension properties from `core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/`. Each extension constructs a full `ImageVector`, so both target compilers receive all four source payloads.

Kotlin Multiplatform's expect/actual mechanism lets common code declare a function while each target supplies its implementation. The new resolver will be declared next to `GoogleSignInButton` in `commonMain`; Android and iOS implementations will live under the matching `androidMain` and `iosMain` package paths. The four vector sources will be moved mechanically to the matching target `icons` directory without changing their path data.

This work must not modify the active AUD-004 event-detail decomposition files or the LEG-001 API-client files. Its production scope is limited to `core/ui` Google artwork and its direct regression coverage, plus this ExecPlan and a narrow source-layout contract script.

## Plan of Work

First, introduce a small immutable artwork specification containing an `ImageVector` and an aspect ratio. Declare an internal expected resolver in common code. Make `GoogleSignInButton` ask that resolver for the light or dark target artwork, then retain the current 50 dp height, aspect-derived width, rounded clipping, click callback, and accessibility description.

Second, add Android and iOS actual resolvers. Move the Android vector files under `core/ui/src/androidMain/kotlin/com/razumly/mvp/icons/` and the iOS vector files under `core/ui/src/iosMain/kotlin/com/razumly/mvp/icons/`. The Android actual must not name iOS symbols, and the iOS actual must not name Android symbols.

Third, add a pure sizing regression and a shell contract that fails if any platform Google vector returns to `commonMain`, if a target imports the opposite target's variant, or if the expected four platform files are missing. Compile both targets so expect/actual linkage and the moved source payloads are verified by the real build.

## Concrete Steps

Work from `/private/tmp/mvp-app-aud008-recovery`.

Move the vector source files, patch the common and target resolvers, and add tests. Then run:

    bash scripts/tests/google-sign-in-artwork-source-sets.sh
    ./gradlew :core:ui:testDebugUnitTest --tests 'com.razumly.mvp.core.presentation.composables.GoogleSignInButtonTest'
    ./gradlew :core:ui:compileDebugKotlinAndroid :core:ui:compileKotlinIosSimulatorArm64
    ./gradlew :composeApp:assembleDebug

Task names may differ under the current Android Gradle plugin. If Gradle reports an unknown Android compile task, use `./gradlew :core:ui:tasks --all` to select the module's current Kotlin Android compilation task and update this plan with the actual command.

## Validation and Acceptance

Acceptance requires the source-layout contract to report success, the focused sizing test to pass, and both Android and iOS target compilation to succeed. `find core/ui/src/commonMain -iname '*GoogleButton*'` must return nothing. `find core/ui/src/androidMain -iname '*GoogleButton*'` must return exactly the two Android variants, while the equivalent iOS command returns exactly the two iOS variants. The Android target must have no source reference to `iOSGoogleButton*`; the iOS target must have no source reference to `AndroidGoogleButton*`.

The common button must retain content description `Sign in with Google`, a 50 dp rendered height, 189:40 Android proportions, 199:44 iOS proportions, theme-specific artwork, rounded clipping, and a single click callback. Authentication network behavior is out of scope and must remain untouched. All of these source-level conditions are met, and the exact artwork payload hashes match the recovery base.

## Idempotence and Recovery

The source moves and tests are deterministic. All work occurs on an isolated branch, so failure cannot disturb canonical mobile or another agent's dirty files. If a compile failure reveals a source-set limitation, keep the original vectors intact in Git history, document the failure here, and adapt the resolver without rewriting path data. Do not reset, discard, or overwrite another worktree.

## Artifacts and Notes

Recovery base:

    branch codex/aud008-artwork-recovery
    HEAD   20f1193826fc546f06c2d29da6c8a3361fb56028
    state  clean before implementation

Audit evidence is recorded in `mvp-site/docs/code-audit/README.md` under `AUD-008`. It identifies the four common Kotlin vector files as 2,636 lines / 150,124 bytes and calls for platform-scoped artwork or documented generator output.

Validation evidence:

    Google sign-in artwork source-set contract passed
    GoogleSignInButtonTest: 4 tests, 0 skipped, 0 failures, 0 errors
    :core:ui:compileDebugKotlinAndroid: passed
    :core:ui:compileKotlinIosSimulatorArm64: passed
    :core:ui:compileTestKotlinIosSimulatorArm64: passed
    :composeApp:assembleDebug: BUILD SUCCESSFUL in 2m 49s, 174 tasks
    composeApp-debug.apk SHA-256: 9118f8ac241715e917b64df84b4b07b3c00508cd5e5fb09d2b990cb4f762566e

The four before/after vector blob hashes are respectively `5df4249bde5861ea0232d6fd207430c21799d4c5`, `ee55a540c305d19321076e23f74fc3f6eda213bf`, `e629139aa68a7a36969f817fd7397b811b28c620`, and `90722bd66f09a4b8e3cc5df59350ad3c0f2899e6`; each moved file matches its original hash.

## Interfaces and Dependencies

In `GoogleSignInButton.kt`, define an internal immutable artwork specification and an internal expected function equivalent to:

    internal data class GoogleSignInButtonArtwork(
        val imageVector: ImageVector,
        val aspectRatio: Float,
    )

    internal expect fun googleSignInButtonArtwork(
        isDarkTheme: Boolean,
    ): GoogleSignInButtonArtwork

Each target must provide the actual function in the same package. No new runtime dependency is required; the solution uses the existing Compose `ImageVector` API and Kotlin Multiplatform expect/actual support.

Revision note (2026-07-14 15:36Z): Created this recovery plan after proving there was no existing AUD-008 implementation state and choosing an exact-artwork, platform-source-set split.

Revision note (2026-07-14 15:47Z): Recorded the completed source split, regression results, exact vector hash preservation, Android app assembly, and the resource-constrained iOS simulator test-link observation.

Revision note (2026-07-14 15:48Z): Recorded implementation commit `929f5e1f` and canonical cherry-pick readiness.
