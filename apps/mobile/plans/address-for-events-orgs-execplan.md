# Add Address Support For Event and Organization Locations Across Mobile and Web

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows [PLANS.md](../PLANS.md) from the repository root and must be maintained in accordance with that standard.

## Purpose / Big Picture

After this change, event and organization records will store both a place display name (`location`) and a street-style address (`address`) when the picker can provide one, while still always storing coordinates. Users on both mobile (`mvp-app`) and web (`mvp-site`) will keep seeing the location name they selected (for example, a park or store name), and backend persistence will now also preserve a separate address string when available.

A person validating the feature should be able to pick a place in create/edit event and organization forms, save, reload, and observe that name, address, and coordinates all round-trip through API responses and client models.

## Progress

- [x] (2026-03-25 01:54Z) Identified all model, API, and UI integration points in `mvp-app` and `mvp-site`.
- [ ] Add `address` to `mvp-app` event/org/place models, DTOs, and map providers (Android + iOS).
- [ ] Add `address` to `mvp-site` Prisma schema, API update allowlists, and server event upsert mapping.
- [ ] Update web place selector and forms to pass `location` name + `address` + coordinates.
- [ ] Run targeted verification (typecheck/build-focused checks) for both repositories.
- [ ] Update this plan with outcomes and final evidence.

## Surprises & Discoveries

- Observation: `mvp-app` has a dirty working tree with unrelated in-progress changes; edits must be minimal and additive.
  Evidence: `git status --short` in `C:\Users\samue\StudioProjects\mvp-app` reports many pre-existing modified files.
- Observation: `mvp-site` is hosted in WSL but accessible via UNC path from this workspace.
  Evidence: `git -C \\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site rev-parse --show-toplevel` succeeds.
- Observation: Web `LocationSelector` currently conflates `place.formatted_address` and `place.name` into one `location` value.
  Evidence: `src/components/location/LocationSelector.tsx` currently calls `onChange(address, lat, lng)` where `address` may be `formatted_address` or `place.name`.

## Decision Log

- Decision: Keep `location` as the place display name and add a new sibling `address` field instead of replacing `location`.
  Rationale: The requirement explicitly needs both values preserved; existing UI and API semantics already use `location` as display text.
  Date/Author: 2026-03-25 / Codex
- Decision: Implement schema/model/API/UI updates in both repositories in one pass.
  Rationale: Prevent contract drift where one client writes `address` but the other cannot persist or read it.
  Date/Author: 2026-03-25 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

`mvp-app` (this repo at `C:\Users\samue\StudioProjects\mvp-app`) is Kotlin Multiplatform. Event and organization data contracts live in:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Organization.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` (`OrganizationApiDto`)
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MVPPlace.kt`

Mobile place picker integration points:

- Android: `composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/util.kt` and `MapComponent.kt`
- iOS: `composeApp/src/iosMain/kotlin/com/razumly/mvp/eventMap/MapComponent.ios.kt`

Selection handlers currently set only `location` and coordinates:

- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`

`mvp-site` (external source of truth for API + DB at `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`) contains:

- Prisma schema: `prisma/schema.prisma`
- Event server persistence: `src/server/repositories/events.ts` (`upsertEventFromPayload`)
- Event routes: `src/app/api/events/route.ts`, `src/app/api/events/[eventId]/route.ts`
- Organization routes: `src/app/api/organizations/route.ts`, `src/app/api/organizations/[id]/route.ts`
- Web contracts: `src/types/index.ts`
- Web services/mappers: `src/lib/eventService.ts`, `src/lib/organizationService.ts`
- Place picker + forms: `src/components/location/LocationSelector.tsx`, `src/app/events/[id]/schedule/components/EventForm.tsx`, `src/components/ui/CreateOrganizationModal.tsx`

## Plan of Work

First, update data contracts in both codebases to include `address` as an optional string. In `mvp-app`, add `address` to `Event`, `EventDTO`, `EventApiDto`, `EventUpdateDto`, and organization DTO/model mappings so serialization includes it in both read and write paths. Add `address` to `MVPPlace`, populate it from Android/iOS Google place APIs, and then update `selectPlace` handlers in create/edit event flows to write `location = place.name`, `address = place.address`, and coordinates.

Second, update `mvp-site` persistence and API layers. Add nullable `address` columns for `Events` and `Organizations` in Prisma schema plus a migration SQL file. Update event upsert mapping in `src/server/repositories/events.ts` to persist `payload.address`. Update event PATCH allowlist (`EVENT_UPDATE_FIELDS`) and organization create schema to accept `address`. Organization PATCH already forwards payload keys and should require no whitelist update, but it still needs to safely store `address` once schema supports it.

Third, update web UI contracts and location picker callback shape so location name and address are separate values. Update `LocationSelector` props to return both values, keeping backward behavior for manual text entry by treating typed text as `location` and leaving `address` undefined unless geocoding/place APIs return it. Update `EventForm` and `CreateOrganizationModal` consumers to store both fields in form state and payloads.

Finally, run targeted compilation checks in each repository and document any residual gaps.

## Concrete Steps

From `C:\Users\samue\StudioProjects\mvp-app`:

1. Edit `plans/address-for-events-orgs-execplan.md` with progress as work proceeds.
2. Patch Kotlin files listed above to add `address` fields and mapping logic.
3. Run:
   - `./gradlew :composeApp:compileCommonMainKotlinMetadata`

From `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`:

1. Patch Prisma schema and create migration directory with SQL to add nullable `address` columns.
2. Patch server routes/repository, shared TS types, services, location selector, and form consumers.
3. Run targeted checks (based on available scripts):
   - `npm run typecheck` (or nearest equivalent script in that repo)

Expected result: compile/typecheck should pass, and changed files should show `address` flowing from place selection -> form state -> payload -> database -> response mapping.

## Validation and Acceptance

Behavior is accepted when all of the following are true:

1. Mobile event create/edit map selection writes `location` from place name, writes `address` when provided by place details, and still writes coordinates.
2. Web event form map selection updates `location` (name), `address` (formatted address when available), and coordinates; organization modal does the same.
3. Saving an event or organization through `mvp-site` persists `address` to DB and returns it in API payloads.
4. Client model hydration in both repos reads `address` without breaking existing location display behavior.
5. Targeted build/typecheck commands succeed.

## Idempotence and Recovery

All edits are additive and safe to re-run. Schema migration adds nullable columns, so reapplying code changes does not require destructive resets. If validation fails, rollback by removing newly added `address` fields in client/server mappings and reverting the migration before deployment.

## Artifacts and Notes

Evidence to capture after implementation:

- `git diff --` snippets for model + API + picker callback changes in both repos.
- Command output summaries for `:composeApp:compileCommonMainKotlinMetadata` and web typecheck command.
- Manual sanity result: place selection stores separate name and address.

## Interfaces and Dependencies

The following interfaces must exist after completion:

- Kotlin `Event` and DTO network contracts expose `address` (`String?` recommended) in:
  - `com.razumly.mvp.core.data.dataTypes.Event`
  - `com.razumly.mvp.core.data.dataTypes.dtos.EventDTO`
  - `com.razumly.mvp.core.network.dto.EventApiDto`
  - `com.razumly.mvp.core.network.dto.EventUpdateDto`
- Kotlin `Organization` and `OrganizationDTO` expose `address` (`String?`).
- Kotlin `MVPPlace` exposes `address` (`String?`) and map provider mappers populate it.
- TypeScript `Event` and `Organization` interfaces include `address?: string`.
- Web `LocationSelector` callback includes separate `name/location` and `address` values.
- Prisma models include nullable `address` on `Events` and `Organizations`.
- Server event upsert writes `address` and update allowlists include `address`.

## Plan Revision Notes

- 2026-03-25: Created initial plan and scoped all required touchpoints before code edits.
