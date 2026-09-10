# Share product icons across site and mobile

## Purpose and Big Picture

The BracketIQ site and mobile app currently keep icon sources in separate trees. The site has a generated projection for sport SVGs under `shared/icons/sports`, `apps/site/public/icons/sports`, and `apps/site/src/components/ui/sharedIconManifest.generated.ts`. The mobile app has product vectors under `apps/mobile/core/ui/src/commonMain/kotlin/com/razumly/mvp/icons` and several unused SVG resources under `apps/mobile/composeApp/src/commonMain/composeResources/drawable`.

This change creates one shared icon manifest and one canonical SVG source tree. The first product-icon slice covers `Trophy`, `TournamentBracket`, and `Groups`. The generator projects the canonical assets to site public SVGs, a generated site manifest, generated mobile `xml-images` inputs, and a generated semantic mobile adapter for the existing Compose Vectorize plugin. The mobile app migrates the current product-icon callers to that adapter. The site exposes a matching `SharedIcon` adapter without changing unrelated page design.

The seam is the manifest and its generated asset map. Web code consumes public SVG hrefs. Mobile code consumes generated `ImageVector` projections. Neither client imports the other platform's source or types.

## Progress

- [x] 2026-09-10T13:02:42-07:00 Read repository plan and platform rules.
- [x] 2026-09-10T13:24:37-07:00 Inventory mobile icon sources and callers.
- [x] 2026-09-10T13:24:37-07:00 Choose first shared icon contract.
- [x] 2026-09-10T13:24:37-07:00 Create shared product icon sources.
- [x] 2026-09-10T13:24:37-07:00 Generalize shared icon manifest.
- [x] 2026-09-10T13:24:37-07:00 Generate web and mobile projections.
- [x] 2026-09-10T13:24:37-07:00 Add site shared icon adapter.
- [x] 2026-09-10T13:24:37-07:00 Migrate mobile icon callers.
- [x] 2026-09-10T13:24:37-07:00 Remove migrated mobile duplicates.
- [x] 2026-09-10T13:24:37-07:00 Add cross-platform icon checks.
- [x] 2026-09-10T13:24:37-07:00 Run site and mobile verification.
- [x] 2026-09-10T13:27:36-07:00 Review scoped changes and report.

The worktree already contains unrelated unstaged changes. Preserve them. The earlier sport-icon migration is part of this change and must remain intact.

## Surprises & Discoveries

- `apps/mobile/core/ui` is the shared KMP UI module and already depends on Compose UI and Material icons, but it did not apply the Compose Vectorize plugin.
- The version catalog already contains `dev.sergiobelda.compose.vectorize:compose-vectorize-core` and the Compose Vectorize plugin. The plugin reads `xml-images` and generates common `ImageVector` Kotlin sources.
- `MVPIcons.Trophy`, `MVPIcons.TournamentBracket`, and `MVPIcons.Groups` were used by event-detail tabs, event-detail floating actions, and the profile home screen. The available language server has no mobile server, so exact repository search was the fallback for call-site proof.
- `apps/mobile/composeApp/src/commonMain/composeResources/drawable/trophy.svg` and `tournament-bracket.svg` were not referenced by mobile code. The used product vectors were the three `core/ui` Kotlin files.
- The prior site sport projection already validates source/output parity. Generalizing that generator is safer than adding a second icon pipeline.
- `apps/site/public/icons` also contains unrelated icon files. The generalized sync command now manages only its `sports` and `product` subdirectories and preserves unrelated public icons.

## Decision Log

- Use SVG as the canonical interchange format. It is directly usable by the site and can be converted to the XML input required by Compose Vectorize.
- Use a single root manifest at `shared/icons/manifest.json`. Keep the existing flat sport keys and add a `category` field for product keys. Generated adapters expose the category-specific API shapes.
- Keep existing sport public URLs and `#sport-icon` fragments stable. Product assets use `#shared-icon`. The generated href map owns this detail.
- Use the existing mobile product geometry for the first product slice. Record the existing-mobile provenance and review-required license status in the manifest instead of claiming an unverified external license.
- Keep the mobile adapter in `core:ui`. Do not import generated vector classes from feature code. Feature code depends on the generated `SharedIcons` semantic object.
- Do not migrate every Material icon in the mobile app. Search results show many unrelated utility icons. This slice migrates only the three named product icons and every current caller of those icons.
- Do not add new product icons to unrelated site pages. The site adapter and focused behavior test establish the consumer seam for later page work without inventing product design changes.

## Outcomes & Retrospective

The implementation now uses one 27-entry manifest for the migrated shared set. It generates 27 site SVGs, 27 mobile XML inputs, typed site metadata, and a semantic mobile adapter. The three migrated mobile callers use `SharedIcons`, and the old duplicate Kotlin vectors and unused duplicate SVG resources are removed. Other mobile-only icons remain outside this first slice by decision.

The product sources retain the existing mobile attribution where it is known. Their manifest license status remains `review-required`; this change does not claim an external license that the repository cannot prove.

The new site adapter is covered by DOM behavior tests. It is not mounted on an existing site page in this slice, so no unrelated page design changed.

## Context and Orientation

Relevant files:

- `shared/icons/manifest.json`: canonical icon inventory after this change.
- `shared/icons/sports/*.svg`: existing Tabler-derived sport sources.
- `shared/icons/product/*.svg`: first shared product sources.
- `scripts/sync-shared-icons.mjs`: generalized source validation and projection script.
- `apps/site/src/components/ui/SportIcon.tsx`: existing sport adapter and public type boundary.
- `apps/site/src/components/ui/SharedIcon.tsx`: new site adapter.
- `apps/site/src/components/ui/__tests__/SportIcon.test.tsx`: existing source/output and behavior checks.
- `apps/site/src/components/ui/__tests__/SharedIcon.test.tsx`: product adapter behavior and source/output checks.
- `apps/mobile/core/ui/build.gradle.kts`: KMP UI module build and generated vector configuration.
- `apps/mobile/core/ui/xml-images/shared/*.xml`: generated mobile vector inputs.
- `apps/mobile/core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/sharedIcons.generated.kt`: generated mobile semantic adapter.
- `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailTabNavigation.kt`: tab icon callers.
- `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailFloatingActions.kt`: participant action caller.
- `apps/mobile/composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileHomeScreen.kt`: profile action caller.

The site uses Next.js, React, TypeScript, and external SVG `<use>` references. The mobile app uses Kotlin Multiplatform and Compose Multiplatform. The backend contract is not involved.

## Context Boundary

Read only the root policy, `PLANS.md`, the site and mobile policy files, the named icon sources, their direct callers, and the build/test files needed for the projection. Do not inspect or edit unrelated site components, backend code, Prisma output, deployment files, or mobile features that do not use the three migrated icons.

## Plan of Work

1. Finish the source and caller inventory. Confirm the exact Compose Vectorize configuration and the type expected by each mobile caller.
2. Move the sport manifest to the root manifest and add product entries. Add canonical product SVGs that preserve the selected mobile geometry and identify provenance.
3. Extend the sync script. Validate all entries, preserve stable sport output, write product web assets, write generated site key/href data, and write mobile XML vector inputs.
4. Apply Compose Vectorize to `core:ui`. Add a semantic mobile adapter over generated vectors. Migrate all three product icon call paths without exposing generated names to feature code.
5. Add site adapter behavior checks and mobile common tests for key-to-vector selection. Remove the migrated duplicate Kotlin vectors and unused duplicate resource references only when no caller remains.
6. Run focused site checks, TypeScript and lint checks, the mobile compile/test commands, and the shared icon sync check. Inspect the final scoped diff without resetting unrelated work.

## Concrete Steps

### Discovery and contract

- Read the exact mobile caller signatures before editing.
- Confirm Compose Vectorize's generated package and category names from the first core:ui compile.
- Use exact repository search for all references when no language server is available.
- Record the stable web keys and mobile semantic names in the manifest.

### Canonical sources and generator

- Move `shared/icons/sports/manifest.json` to `shared/icons/manifest.json`.
- Add `trophy`, `tournament-bracket`, and `groups` product entries with source, output, fragment, provenance, and license metadata.
- Keep source SVGs monochrome and compatible with external `<use>` and Compose Vectorize.
- Generate `apps/site/public/icons/...`, `apps/mobile/core/ui/xml-images/shared/...`, and the generated mobile semantic adapter from the manifest.
- Generate the site TypeScript key, viewBox, and href maps. Never hand-edit generated files.
- Keep `npm run icons:sync` and `npm run icons:check` usable from the repository root and `apps/site`.

### Mobile integration

- Add the Vectorize plugin and core dependency to `core:ui`.
- Configure a stable generated package.
- Generate the semantic `SharedIcons` ImageVector adapter in `core:ui`.
- Change feature callers to use the semantic adapter. Preserve existing labels, sizes, and layout.
- Remove `Trophy.kt`, `TournamentBracket.kt`, and `Groups.kt` only after all references are gone.

### Site integration

- Add `SharedIcon` with the same semantic keys and existing accessibility conventions.
- Keep `SportIcon` behavior and public key values stable while reading its href from the generalized generated map.
- Test product hrefs, labels, hidden decorative usage, and source/generated parity.

## Validation and Acceptance

Run from the repository root:

    node scripts/sync-shared-icons.mjs --check

Run from `apps/site`:

    npm test -- --runInBand src/components/ui/__tests__/SportIcon.test.tsx src/components/ui/__tests__/SharedIcon.test.tsx
    npx tsc --noEmit
    npx eslint src/components/ui/SportIcon.tsx src/components/ui/SharedIcon.tsx src/components/ui/__tests__/SportIcon.test.tsx src/components/ui/__tests__/SharedIcon.test.tsx
    npx prettier --check src/components/ui/SportIcon.tsx src/components/ui/SharedIcon.tsx src/components/ui/__tests__/SportIcon.test.tsx src/components/ui/__tests__/SharedIcon.test.tsx

Run from `apps/mobile`:

    sh gradlew :core:ui:compileDebugKotlinAndroid --no-daemon
    sh gradlew :core:ui:testDebugUnitTest --no-daemon
    sh gradlew :composeApp:compileDebugKotlinAndroid --no-daemon

Acceptance criteria:

- One root manifest lists all existing sport icons and the three product icons.
- The sync check proves source, site, and mobile generated projections are current.
- Site code can render each first-slice product key through `SharedIcon` with an accessible label.
- Mobile code can render each first-slice product key through `SharedIcon` and no migrated feature caller imports the deleted vector files.
- Existing sport icon tests and URLs continue to pass.
- No backend contract, runtime state, deployment, or unrelated feature changes occur.

## Idempotence and Recovery

The sync script is deterministic. Run its write mode after changing a canonical SVG or manifest entry. Run check mode before review. Generated files are disposable and must not be edited by hand.

If a generated mobile source fails to compile, inspect the generated XML and the Compose Vectorize output under `apps/mobile/core/ui/build/images`. Fix the canonical SVG or converter, rerun the sync, then rerun the focused compile. Do not patch build output.

If a validation command exposes an unrelated pre-existing failure, record the command and failure in this plan and keep the scoped checks separate. Do not reset unrelated worktree changes.

## Artifacts and Notes

Generated artifacts:

- `apps/site/public/icons/sports/*.svg` and `apps/site/public/icons/product/*.svg`.
- `apps/site/src/components/ui/sharedIconManifest.generated.ts`.
- `apps/mobile/core/ui/xml-images/shared/*.xml`.
- `apps/mobile/core/ui/src/commonMain/kotlin/com/razumly/mvp/icons/sharedIcons.generated.kt`.

The generated Compose Vectorize Kotlin files remain under `apps/mobile/core/ui/build` and are not committed. The canonical SVG, generated XML, and generated semantic adapter are the reviewable cross-platform inputs.

## Interfaces and Dependencies

The manifest entry shape includes a stable semantic key, category, canonical source path, generated output path, SVG fragment id, and provenance/license metadata. The site generated module exposes typed all-icon keys, viewBoxes, and hrefs plus sport-only keys. The mobile generated adapter exposes product names and returns `ImageVector` values without leaking generated category names.

Dependencies remain platform-local. Site code uses React and SVG. Mobile code uses Compose UI, Compose Vectorize core, and generated common Kotlin vectors. No server or API dependency changes.

## Revision Note

- 2026-09-10T13:02:42-07:00 Initial plan created after repository, policy, and mobile icon inventory. LSP references were attempted but no mobile language server was available; exact repository search is required before deletion.
- 2026-09-10T13:24:37-07:00 Implemented the root manifest, product sources, deterministic site/mobile projections, adapters, caller migration, duplicate cleanup, and focused checks. The sync command manages only generated icon directories so existing unrelated public icons remain untouched.
- 2026-09-10T13:27:36-07:00 Verification passed: shared projection check, two site icon suites with eight tests, site TypeScript, scoped ESLint, Prettier, mobile core UI unit tests, and mobile Compose compilation. Gradle emitted existing Windows/iOS and deprecation warnings only.
