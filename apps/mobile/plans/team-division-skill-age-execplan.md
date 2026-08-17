# Replace Team/Event Division Rating Type with Skill+Age Division Settings

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, team setup and event division setup will both collect a team/division profile using three explicit controls: gender, skill division, and age division. Users will no longer choose a single `ratingType` (`AGE` or `SKILL`), and teams can be configured with both skill and age constraints at the same time. This enables registrations such as “Coed Open 18+” to match event divisions consistently and prevents teams from being blocked because they only carry a single legacy division type.

The observable outcome is:

1. In Team Management, the team setup modal shows `Gender`, `Skill Division`, and `Age Division` inputs.
2. In Event Create/Edit (division editor), `Rating Type` is removed and replaced by `Skill Division` and `Age Division`.
3. Division IDs and team division type payloads remain backward compatible with existing API fields by storing a composite division type token in `divisionTypeId` and a composite label in `divisionTypeName`.

## Progress

- [x] (2026-02-23 00:54Z) Located current team and event division model usage in `Team`, `TeamApiDto`, `DivisionDetail`, `EventDetails`, and `DivisionFormatter`.
- [x] (2026-02-23 00:54Z) Verified backend source-of-truth behavior in `mvp-site` team routes: only `divisionTypeId`/`divisionTypeName` are persisted for teams.
- [x] (2026-02-23 01:03Z) Implemented shared division utility updates for dual skill+age parsing/building with legacy token fallback support.
- [x] (2026-02-23 01:07Z) Added team model/network fields and composite division type persistence mapping.
- [x] (2026-02-23 01:13Z) Updated Team Setup UI to capture gender + skill division + age division and persist those settings on save.
- [x] (2026-02-23 01:20Z) Replaced event division `Rating Type` control with `Skill Division` and `Age Division`; updated save validation, parsing, and display metadata.
- [x] (2026-02-23 01:27Z) Added backend/web compatibility matching in `mvp-site` for composite-vs-legacy division type comparisons during selection and registration.
- [ ] Run focused compile/tests and record evidence (completed: mvp-site lint; remaining: clean mvp-app compile blocked by unrelated pre-existing error in `NetworkAvatar.kt`).

## Surprises & Discoveries

- Observation: Team management in `mvp-app` currently stores only `division` string and omits backend-supported `divisionTypeId` and `divisionTypeName`, which can make team registration fail in division-gated events.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt` have no division type fields.

- Observation: Existing event division token utilities are hard-coded to `gender + ratingType + divisionTypeId` token pattern.
  Evidence: `DIVISION_TOKEN_PATTERN` and `buildDivisionToken` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`.

- Observation: Full Android Kotlin compile in this checkout fails in an unrelated pre-existing file (`NetworkAvatar.kt`) with unresolved reference `matchParentSize`, preventing full compile verification of this branch.
  Evidence: `./gradlew :composeApp:compileDebugKotlinAndroid` output on 2026-02-23 01:26Z.

## Decision Log

- Decision: Keep backend compatibility by storing the new dual division settings as a composite `divisionTypeId` token and `divisionTypeName` label instead of introducing new server contract fields in this pass.
  Rationale: `mvp-site` currently persists only `divisionTypeId`/`divisionTypeName` for teams. This allows immediate rollout without backend schema migration while still supporting skill+age semantics.
  Date/Author: 2026-02-23 / Codex

- Decision: Preserve parsing compatibility for legacy division tokens (`m_skill_open`, `m_age_u12`) while generating new tokens for edited/new divisions.
  Rationale: Existing data and events should remain editable and display correctly.
  Date/Author: 2026-02-23 / Codex

- Decision: Patch both server-side registration checks and web client pre-checks in `mvp-site` to treat composite and legacy division type IDs as equivalent where appropriate.
  Rationale: Without this compatibility layer, existing events using legacy single-axis IDs (for example `open`) reject newly edited teams carrying composite IDs (`skill_open_age_18plus`).
  Date/Author: 2026-02-23 / Codex

## Outcomes & Retrospective

Core requested behavior is implemented: Team Setup now captures division by gender + skill + age, and event division setup no longer asks for `ratingType`. Team and division payloads now preserve both dimensions through explicit fields and composite IDs. Compatibility logic was added in `mvp-site` so legacy and composite division type IDs can interoperate during registration.

Remaining gap: full `mvp-app` compile validation is blocked by an unrelated existing compiler error in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/NetworkAvatar.kt` (`matchParentSize` unresolved). `mvp-site` lint passed for all touched files.

## Context and Orientation

Division setup is currently split across these areas:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt` contains event division editor state, UI controls, save validation, and token construction.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/util/DivisionFormatter.kt` normalizes division IDs and infers display metadata from division tokens.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/DivisionDetail.kt` stores division metadata sent to and received from APIs.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamDialog.kt` is the Team Setup modal UI.
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/TeamDTO.kt` define the team persistence and API payload shape.

Important term definitions used in this plan:

- Composite division type token: a normalized string that encodes both skill and age division choices in one backend-compatible field (`divisionTypeId`).
- Legacy token: old format token with only one classification axis (`AGE` or `SKILL`).
- Dual division settings: new UI/model shape where both skill and age are present simultaneously.

## Plan of Work

First, update shared division formatting helpers to parse both legacy and new composite tokens, and to produce display labels that include both skill and age when available. This includes introducing helper functions for composite ID and name generation that can be used by both Team Management and EventDetails.

Second, extend team data structures so teams carry optional division metadata fields required by the UI (`divisionTypeId`, `divisionTypeName`, and explicit skill/age/gender fields for local state and round-tripping). Ensure network DTO mapping reads/writes these fields and defaults safely for old data.

Third, update Team Setup modal state and controls to edit gender, skill division, and age division. On save, compute and persist the composite `divisionTypeId` and `divisionTypeName` and keep `division` display text aligned.

Fourth, refactor event division editor state and controls to remove `ratingType`, add `skillDivisionTypeId` and `ageDivisionTypeId`, and update all ready-state checks, save validation, duplicate detection, and detail summaries.

Finally, run focused validation commands to ensure compile/test coverage for touched code paths.

## Concrete Steps

From `/mnt/c/Users/samue/StudioProjects/mvp-app`:

1. Edit shared division utility and data model files:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/util/DivisionFormatter.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/DivisionDetail.kt`
2. Edit team models and DTO mapping:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Team.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/TeamDtos.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/TeamDTO.kt`
3. Edit team setup UI:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamDialog.kt`
4. Edit event division editor logic/UI:
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`
5. Run validation:
   - `./gradlew :composeApp:compileDebugKotlinAndroid`
   - Add focused test command(s) if needed based on compile output.

Expected success signal is clean compilation and no unresolved references in touched modules.

## Validation and Acceptance

Acceptance criteria are behavior-focused:

1. Team Setup modal allows choosing gender, skill division, and age division, and save remains enabled only when required fields are valid.
2. Event division editor no longer shows `Rating Type`, and instead requires skill + age division selections before adding/updating a division.
3. Existing legacy divisions still load into editor controls with sensible defaults (for missing skill/age axis).
4. Compilation succeeds for Android shared target.

## Idempotence and Recovery

All edits are additive and source-level. Re-running the build is safe. If a change introduces parsing regressions, fallback behavior keeps legacy token parsing and defaults to stable values (`Coed`, `Open`, `18+`) to avoid null/blank payloads.

## Artifacts and Notes

Validation evidence:

- `mvp-app`: `./gradlew :composeApp:compileDebugKotlinAndroid` reached source compilation and failed due to unrelated existing error:
  `NetworkAvatar.kt:8:43 Unresolved reference 'matchParentSize'.`
- `mvp-site`: `npm run lint -- src/app/api/events/[eventId]/participants/route.ts src/app/api/events/[eventId]/registrationDivisionUtils.ts src/app/discover/components/EventDetailSheet.tsx src/lib/divisionTypes.ts` passed.

## Interfaces and Dependencies

No new third-party libraries are required. The change will continue using existing Compose components (`PlatformDropdown`, `PlatformTextField`) and current repository/network layers.

Expected interfaces after implementation:

- `DivisionDetail` will expose explicit skill/age division fields used by UI logic.
- Team payload mapping will continue sending `divisionTypeId`/`divisionTypeName` while deriving those values from explicit skill+age selection.
- EventDetails division editor state will no longer depend on `ratingType` as a user-controlled field.

---
Plan revision note (2026-02-23): Initial ExecPlan created to cover the requested dual skill+age division model and team management integration.
Plan revision note (2026-02-23): Updated progress, decisions, discoveries, and validation evidence after implementing team/event dual division settings and composite/legacy compatibility checks.
