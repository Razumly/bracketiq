# Align Event Template UX Across Web And Mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows the repository standard at `PLANS.md`.

## Purpose / Big Picture

After this change, template interactions are consistent: template cards no longer open the join-style event modal, and both web and mobile route directly into editing flows for templates. Mobile profile gains a dedicated Event Templates section, and mobile event editing gains a one-tap action to create a reusable template from the current event values.

A user can verify this by opening template sections on web and mobile, tapping a template card, and observing direct navigation to editing instead of join modal behavior. On mobile, a host in edit mode can create a template and then see that template listed in the profile templates section.

## Progress

- [x] (2026-02-19 03:46Z) Audited current web template sections and confirmed org templates still open `EventDetailSheet`.
- [x] (2026-02-19 03:46Z) Audited mobile profile and event detail architecture and identified insertion points for template section and template-create action.
- [x] (2026-02-19 03:53Z) Patched web template sections to remove template-scoped create-event buttons and route organization template cards directly to schedule edit.
- [x] (2026-02-19 03:58Z) Added mobile profile Event Templates section (navigation + state + screen) backed by template-only host queries.
- [x] (2026-02-19 04:00Z) Added mobile template-create action in edit mode and defaulted template event opens to edit mode.
- [x] (2026-02-19 04:02Z) Ran targeted checks and captured successful test/build output.

## Surprises & Discoveries

- Observation: Web profile template cards already route directly to schedule edit; the modal issue is in organization template tab cards.
  Evidence: `mvp-site/src/app/profile/page.tsx` uses `router.push(`/events/${template.id}/schedule`)`, while `mvp-site/src/app/organizations/[id]/page.tsx` uses `setSelectedEvent(...); setShowEventDetailSheet(true)` for template cards.
- Observation: Mobile had no dedicated template list route in profile and no existing event-template clone utility.
  Evidence: `ProfileComponent` child stack lacked a template config/screen; `EventDetailComponent` exposes edit/publish/update but no template-create action.
- Observation: Existing worktree already included broad in-progress profile/event changes unrelated to this feature.
  Evidence: `git status --short` in both repos showed many modified files before feature edits; implementation was constrained to template-relevant hunks only.

## Decision Log

- Decision: Implement a dedicated template flow in mobile `IEventRepository` (`getEventTemplatesByHostFlow`) instead of overloading existing host event flow.
  Rationale: Host event listing currently excludes templates by backend default; explicit template flow avoids regressions in existing event management lists.
  Date/Author: 2026-02-19 / Codex
- Decision: Force mobile template card opens into edit mode by default when `event.state == "TEMPLATE"` in event detail component.
  Rationale: This guarantees template taps consistently enter edit mode regardless of caller route.
  Date/Author: 2026-02-19 / Codex
- Decision: Template creation on mobile should clone the current edit buffer (`editedEvent` when edit mode is active), clear participant/referee assignments, set `state = TEMPLATE`, and append `(TEMPLATE)` suffix when absent.
  Rationale: This matches user intent of “from current values” while preserving template cleanliness and recognizability.
  Date/Author: 2026-02-19 / Codex

## Outcomes & Retrospective

Implemented the full requested behavior across web and mobile with compile/test validation in the mobile repo.

Web outcome:
- Template-specific create-event controls were removed from profile and organization template sections.
- Organization template card clicks now route directly to `/events/{id}/schedule` instead of opening event detail/join modal.

Mobile outcome:
- Profile now has an Event Templates section in the child stack and home actions grid.
- Templates are loaded through a dedicated repository flow using `state=TEMPLATE`.
- Opening template events now starts in edit mode automatically.
- Edit mode includes a “Create Template” button that clones current values into a template-safe event payload and creates the template.

Validation outcome:
- `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest"` passed.
- `./gradlew :composeApp:assembleDebug` passed.

## Context and Orientation

This work spans two codebases used together:

1. Mobile KMP app (current repository):
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileComponent.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileScreen.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileHomeScreen.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/profile/ProfileFeatureScreens.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailScreen.kt`
   - `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`

2. Web app source of truth (`/home/camka/Projects/MVP/mvp-site`):
   - `src/app/profile/page.tsx`
   - `src/app/organizations/[id]/page.tsx`

Template state is represented as `state = "TEMPLATE"`. The backend `GET /api/events` excludes templates unless `state=TEMPLATE` is explicitly provided. Template cards must route to schedule edit page and not open join modal detail sheets.

## Plan of Work

First, patch web template UI behavior. In the profile templates section and organization template tab, remove the “Create Event” action from template-specific controls. For organization templates, replace `EventCard` click behavior from modal open (`setSelectedEvent` + `setShowEventDetailSheet`) to direct router navigation to `/events/{templateId}/schedule`.

Second, add mobile profile template navigation. Extend `ProfileComponent` with a new child config/screen and state holder for template events. Add a new profile home action card for Event Templates, and a new screen that renders template cards with refresh/pull-to-refresh and opens selected template events.

Third, implement template fetch on mobile. Extend `IEventRepository`/`EventRepository` with a template-only host flow that calls `/api/events?hostId=...&state=TEMPLATE&limit=...`, keeps cached entries in sync, and emits only template events for the current host.

Fourth, add mobile template creation/edit behavior. In event detail, add a “Create Template” action while editing, clone the current edited event into a template-safe payload (clear participants, set `state = TEMPLATE`, preserve editable structure), create via repository, and surface success/failure. Ensure that when a template is opened, event detail starts in edit mode.

## Concrete Steps

Run from `/mnt/c/Users/samue/StudioProjects/mvp-app` unless noted.

1. Edit web files in `/home/camka/Projects/MVP/mvp-site`:
   - `src/app/profile/page.tsx`
   - `src/app/organizations/[id]/page.tsx`
2. Edit mobile files listed in Context and Orientation.
3. Run targeted checks:
   - `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest"`
   - `./gradlew :composeApp:assembleDebug`

Expected outcome is a successful test run for repository changes and a successful Android debug assembly.

## Validation and Acceptance

Web acceptance:
- In web profile templates section, no template-section “Create Event” button appears.
- In organization Event Templates tab, clicking a template card routes directly to `/events/{id}/schedule`.
- No template click opens `EventDetailSheet` join modal.

Mobile acceptance:
- Profile home includes an “Event Templates” action opening a templates list screen.
- Template list loads host templates from backend `state=TEMPLATE` query.
- Tapping a template opens event detail directly in edit mode.
- In mobile event edit mode, host sees “Create Template” action; tapping it creates a template and surfaces success/error.

## Idempotence and Recovery

All code edits are additive and repeatable. If a check fails, rerun the same command after fixing code; no data migration is involved. If web or mobile behavior regresses, revert only edited hunks in the touched files and rerun targeted checks.

## Artifacts and Notes

Key evidence to capture after implementation:

- `git diff` snippets for:
  - `mvp-site/src/app/profile/page.tsx`
  - `mvp-site/src/app/organizations/[id]/page.tsx`
  - mobile profile/event-detail/repository files
- Test output for `EventRepositoryHttpTest`.
- Build output for `:composeApp:assembleDebug`.

## Interfaces and Dependencies

The following interfaces and functions must exist at completion:

- `IEventRepository.getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<Event>>>`
- `ProfileComponent.navigateToEventTemplates()` and `ProfileComponent.refreshEventTemplates()`
- `ProfileComponent` child/config entries for Event Templates screen
- `EventDetailComponent.createTemplateFromCurrentEvent()` (or equivalent explicit action function)

No new external libraries are required.

## Revision Notes

- 2026-02-19: Initial plan created before implementation to coordinate cross-repo template UX alignment and mobile template feature additions.
- 2026-02-19: Updated plan after implementation with completed progress, decision updates, and validation outcomes.
