# Room-backed Event Participant Management

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It describes the change needed so the EventDetails participants manage mode reads host registration and compliance data from Room, with remote refreshes writing into Room.

## Purpose / Big Picture

Hosts should not see the participants list flicker or reload just because they switch into manage mode. After this change, opening a manageable event refreshes the host-only `manage=true` participant payload and compliance summaries into the local Room database. The UI observes that local database as the source of truth. Entering or leaving manage mode only changes presentation state; it does not trigger the remote registration-detail fetch.

## Progress

- [x] (2026-05-20T06:24:46Z) Confirmed that only the normal roster and current-user registration cache are Room-backed today; host management registration sections and compliance summaries are returned directly from network calls.
- [x] (2026-05-20T06:40:07Z) Added Room entities and DAOs for management registration sections, team compliance summaries, and user compliance summaries.
- [x] (2026-05-20T06:40:07Z) Updated `EventRepository` so remote host-management calls replace local Room rows and observation flows read those rows back into domain models.
- [x] (2026-05-20T06:40:07Z) Updated `EventDetailComponent` so manageable event entry and selected weekly occurrence changes prefetch host management data, while `startManagingParticipants` only validates occurrence selection.
- [x] (2026-05-20T06:40:07Z) Generated schema version 22 through the Room KSP compile path and ran focused compilation/tests.

## Surprises & Discoveries

- Observation: `EventRegistrationCacheEntry` is scoped to the current user and cannot represent host manage-mode sections.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/EventRegistrationCacheEntry.kt` uses table `current_user_event_registrations` and has no host compliance fields.
- Observation: `getEventParticipantManagementSnapshot`, `getEventTeamCompliance`, and `getEventUserCompliance` currently return network DTO mappings directly.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt` maps the API response in those methods without reading a Room table.
- Observation: The documented `:composeApp:roomGenerateSchema` task is not present in this Gradle project.
  Evidence: Running it failed with "task 'roomGenerateSchema' not found"; `:composeApp:tasks --all` lists `copyRoomSchemas` and KSP tasks instead, and `compileDebugKotlinAndroid` generated `composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/22.json`.

## Decision Log

- Decision: Store host management registration sections and compliance summaries in new Room tables instead of keeping a component-level map.
  Rationale: The app convention is Room as local source of truth. Component caches mask repeat loads but do not make data durable or consistently observable.
  Date/Author: 2026-05-20 / Codex
- Decision: Fetch host management data when the event or selected weekly occurrence becomes manageable by the current user, and keep manual refresh/mutations as explicit refresh triggers.
  Rationale: This matches the requested user experience: event entry hydrates local data, while mode switches avoid network-triggered flicker.
  Date/Author: 2026-05-20 / Codex

## Outcomes & Retrospective

Implemented. EventDetails now observes Room for participant-management and compliance data. The remote `manage=true` and compliance requests run when a manageable event or weekly occurrence loads, and explicit refresh/mutation paths replace the local rows again. Toggling manage mode no longer starts those remote requests.

## Context and Orientation

The shared Kotlin app lives under `composeApp/src/commonMain/kotlin/com/razumly/mvp`. Event detail state is owned by `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailComponent.kt`. Event and participant network/local data is owned by `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`. Room database wiring is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt`, with DAOs under `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/daos`.

The phrase "manage=true participant payload" means the backend event participants endpoint variant that includes host registration sections. The existing regular participant sync updates event, team, and user roster rows, but not those host registration sections. The phrase "compliance summaries" means payment and required-document status rows returned by the event team/user compliance endpoints.

## Plan of Work

Add three Room entity shapes: management registration section rows, team compliance rows, and user compliance rows. Use non-null cache scope columns for event id, selected slot id, and selected occurrence date so non-weekly events and weekly occurrences can be replaced independently. Add DAOs that can replace all rows for a scope and observe rows for a scope.

Update `EventRepository` so `getEventParticipantManagementSnapshot`, `getEventTeamCompliance`, and `getEventUserCompliance` are refresh methods: they fetch from the backend, write replacement rows to Room, and return the refreshed domain data. Add observation methods to `IEventRepository` that read Room rows and map them back to `EventParticipantManagementSnapshot`, `EventTeamComplianceSummary`, and `EventComplianceUserSummary`.

Update `EventDetailComponent` to observe the repository's local flows for the selected event and selected weekly occurrence. Add a prefetch collector that refreshes host management data when the selected event is manageable by the current user. Keep explicit refresh and participant mutation paths refreshing Room. Remove the component-level cache key and stop calling the remote refresh from `startManagingParticipants`.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-app`.

Run focused validation after edits:

    ./gradlew :composeApp:compileDebugKotlinAndroid
    ./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.eventDetail.EventDetailMobileJoinFlowTest.eventEntryLoadsRegistrationDetailsAndManageModeReusesThemUntilRefresh" --tests "com.razumly.mvp.eventDetail.composables.ParticipantsViewTeamFilterTest"
    ./gradlew :composeApp:copyRoomSchemas
    git diff --check

The command `./gradlew :composeApp:roomGenerateSchema` is documented in `AGENTS.md`, but this checkout does not expose that task. The available Room schema task is `copyRoomSchemas`, and the KSP compile path generated schema version 22.

## Validation and Acceptance

Acceptance is that entering a host-manageable EventDetails screen refreshes management/compliance data before manage mode is toggled, switching into manage mode does not increment management or compliance remote call counters, and `refreshEventDetails` does increment those counters because refresh is explicit. Room schema generation should create schema version 22 including the new tables.

## Idempotence and Recovery

The DAOs replace rows for one event/occurrence scope before inserting refreshed rows, so repeating a refresh should be safe. The app already deletes the local Room database when the schema version changes on Android and iOS, so this additive schema change does not require preserving old local cache rows.

## Artifacts and Notes

Pending final test output.

## Interfaces and Dependencies

`IEventRepository` must expose local observation methods for management snapshot, team compliance, and user compliance. `DatabaseService` must expose the new DAOs, with default erroring getters so existing repository test doubles that do not touch these tables remain source-compatible. `MVPDatabaseService` must include the new entities and abstract DAO accessors.
