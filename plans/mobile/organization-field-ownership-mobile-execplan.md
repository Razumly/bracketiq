# Move Mobile Rental Ownership to Field.organizationId

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This file follows the standards in `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, mobile rental and organization flows treat `Field.organizationId` as the ownership source instead of relying on `Organization.fieldIds` payloads. This keeps mobile behavior aligned with backend canonical ownership and prevents stale or missing organization field arrays from hiding valid rental inventory.

## Progress

- [x] (2026-04-01 19:08Z) Audited mobile organization and discover/rental flows; identified direct `organization.fieldIds` filtering and field-count usage.
- [x] (2026-04-01 20:20Z) Updated discover rental/suggestion flows to resolve missing organization field IDs from `Field.organizationId` map and cache.
- [x] (2026-04-01 20:24Z) Updated organization detail rental-create context to pass organization field IDs derived from loaded rental field options.
- [x] (2026-04-01 20:26Z) Verified Room schema impact: no `Organization` Room entity/table stores organization field arrays, so no Room migration was required for this ownership move.
- [x] (2026-04-01 20:48Z) Ran `:composeApp:compileCommonMainKotlinMetadata` successfully to validate touched shared Kotlin changes.
- [ ] Run Android KSP-backed compile/tests in this environment (attempted; see discoveries).

## Surprises & Discoveries

- Observation: Discover rental loading already has a fallback to derive organization field IDs from `fieldRepository.listFields()` when `organization.fieldIds` is empty.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt` in `loadRentalOrganizations`.
- Observation: Local Android compile check failed in environment due KSP/graphics init issue unrelated to changed files.
  Evidence: `:composeApp:kspDebugKotlinAndroid` failed with `NoClassDefFoundError: Could not initialize class sun.awt.PlatformGraphicsInfo`.

## Decision Log

- Decision: Prioritize runtime ownership derivation from fields over organization-provided field arrays.
  Rationale: Backend source-of-truth migration removes persistent organization field arrays and mobile must remain robust when arrays are absent.
  Date/Author: 2026-04-01 / Codex

## Outcomes & Retrospective

Mobile rental ownership behavior is now field-centric: rental suggestions and rental organization lists enrich organizations with field IDs derived from `Field.organizationId` when org arrays are missing, and rental create context now sources organization field IDs from loaded field options. No Room migration was needed because organizations are not persisted as a Room entity in this codebase. Shared-code compilation (`compileCommonMainKotlinMetadata`) succeeded; Android KSP-backed compile validation remains blocked by an environment graphics init error.

## Context and Orientation

Relevant mobile files:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Organization.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/EventSearchComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/organizationDetail/OrganizationDetailComponent.kt`
- Rental/organization card composables under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventSearch/tabs/**`

## Plan of Work

Adjust organization list filtering and rental field resolution to always derive membership from fields associated to each organization ID. Keep DTO parsing tolerant of legacy payloads during transition, but stop depending on `Organization.fieldIds` for behavior decisions. Confirm Room schema does not persist organization field arrays; if it does, add migration steps.

## Concrete Steps

From repository root `mvp-app`:

1. Update discover/rental logic to compute organization field IDs from fields grouped by `organizationId`.
2. Update UI field-count displays to use derived membership (or loaded fields) instead of `organization.fieldIds`.
3. Update DTO/model mapping if needed to de-emphasize/remove direct `fieldIds` usage.
4. Run targeted Kotlin tests/build.

## Validation and Acceptance

Acceptance criteria:

- Rentals/org discovery still surfaces organizations with owned fields when API omits `fieldIds`.
- Organization detail rental launcher resolves field options via field ownership query.
- Mobile build/tests for touched modules pass.

## Idempotence and Recovery

Changes are code-only and repeatable. If a regression appears, revert touched files and restore prior filtering logic.

## Artifacts and Notes

Pending implementation outputs.

## Interfaces and Dependencies

No new libraries. Existing `BillingRepository`, `FieldRepository`, and discover/detail components are the interfaces changed.

Revision Note (2026-04-01): Initial plan created before implementation to satisfy ExecPlan process for this cross-repo ownership migration.
Revision Note (2026-04-01): Updated progress/discoveries after implementing mobile ownership-derivation changes and recording compile-environment blocker.
