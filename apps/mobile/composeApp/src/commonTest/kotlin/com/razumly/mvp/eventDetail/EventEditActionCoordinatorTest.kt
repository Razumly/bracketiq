package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventStaffState
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class EventEditActionCoordinatorTest {
    @Test
    fun runSaveEventAction_updates_general_fields_then_reconciles_staff_once() = runTest {
        val coordinator = EventEditActionCoordinator()
        val preparedEvent = Event(
            id = "event-1",
            eventType = EventType.LEAGUE,
            officialIds = listOf("official-2"),
            assistantHostIds = listOf("assistant-2"),
            fieldIds = listOf("field-old"),
            officialPositions = listOf(EventOfficialPosition("position-old", "Referee")),
            eventOfficials = listOf(
                EventOfficial(
                    id = "event-official-2",
                    userId = "official-2",
                    positionIds = listOf("position-old"),
                    fieldIds = listOf("field-old"),
                ),
            ),
        )
        val updated = preparedEvent.copy(
            name = "Updated",
            officialIds = listOf("official-before-save"),
            assistantHostIds = listOf("assistant-before-save"),
            fieldIds = listOf("field-new"),
            officialPositions = listOf(EventOfficialPosition("position-new", "Referee")),
            eventOfficials = emptyList(),
        )
        val final = updated.copy(
            officialIds = preparedEvent.officialIds,
            assistantHostIds = preparedEvent.assistantHostIds,
            eventOfficials = listOf(
                EventOfficial(
                    id = "event-official-2",
                    userId = "official-2",
                    positionIds = listOf("position-new"),
                    fieldIds = emptyList(),
                ),
            ),
        )
        val staffInvite = Invite(
            id = "invite-1",
            type = "STAFF",
            email = "staff@example.com",
            eventId = "event-1",
        )
        val events = mutableListOf<String>()

        val result = coordinator.runSaveEventAction(
            pendingStaffInvites = emptyList(),
            expectedStaffRevision = "staff-revision-loaded",
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = preparedEvent)
            },
            updatePreparedEvent = { prepared, staffRevision ->
                events += "updatePrepared:${prepared.event.id}:$staffRevision"
                updated
            },
            refreshStaffState = { event ->
                events += "refresh:${event.id}"
                EventStaffState(
                    event = updated,
                    staffInvites = emptyList(),
                    revision = "staff-revision-after-patch",
                )
            },
            reconcileStaffState = { event, _, expectedRevision ->
                events += "reconcile:${event.id}:${event.assistantHostIds.single()}:${event.eventOfficials.single().positionIds.single()}:$expectedRevision"
                EventStaffState(
                    event = final,
                    staffInvites = listOf(staffInvite),
                    revision = "staff-revision-2",
                )
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val success = assertIs<EventSaveActionResult.Success>(result)
        assertEquals(final, success.finalEvent)
        assertEquals(listOf(staffInvite), success.staffInvites)
        assertEquals("staff-revision-2", success.staffRevision)
        assertEquals(
            listOf(
                "show:Saving event...",
                "prepare",
                "updatePrepared:event-1:staff-revision-loaded",
                "refresh:event-1",
                "reconcile:event-1:assistant-2:position-new:staff-revision-loaded",
                "refetch:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runSaveEventAction_rejects_invalid_pending_staff_before_general_update() = runTest {
        val events = mutableListOf<String>()
        val result = EventEditActionCoordinator().runSaveEventAction(
            pendingStaffInvites = listOf(
                PendingStaffInviteDraft(
                    firstName = "Invalid",
                    lastName = "Staff",
                    email = "not-an-email",
                    roles = setOf(EventStaffRole.OFFICIAL),
                ),
            ),
            expectedStaffRevision = "staff-revision-loaded",
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            updatePreparedEvent = { _, _ ->
                events += "update"
                error("must not update")
            },
            refreshStaffState = {
                events += "refresh"
                error("must not refresh")
            },
            reconcileStaffState = { _, _, _ -> error("must not reconcile") },
            refetchMatchesOfTournament = { error("must not refetch") },
            showLoading = { events += "show" },
            hideLoading = { events += "hide" },
        )

        val failure = assertIs<EventSaveActionResult.Failure>(result)
        assertEquals("Unable to save event.", failure.fallbackMessage)
        assertEquals(false, failure.didSaveEventDetails)
        assertEquals(listOf("show", "prepare", "hide"), events)
    }

    @Test
    fun runScheduleEditAction_rejects_unsaved_staff_changes_before_the_event_update() = runTest {
        val coordinator = EventEditActionCoordinator()
        val persisted = Event(id = "event-1", assistantHostIds = listOf("assistant-1"))
        val prepared = persisted.copy(assistantHostIds = listOf("assistant-2"))
        val events = mutableListOf<String>()

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.RESCHEDULE,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = prepared)
            },
            validatePreparedEvent = { candidate ->
                requireNoUnsavedEventStaffChanges(
                    persistedEvent = persisted,
                    preparedEvent = candidate.event,
                    pendingStaffInvites = emptyList(),
                )
            },
            logPreparedFieldOwnership = { _, _ -> events += "log" },
            updateEvent = {
                events += "update"
                error("must not update")
            },
            deleteMatchesOfTournament = { error("must not delete") },
            scheduleEvent = { _, _ -> error("must not schedule") },
            refetchMatchesOfTournament = { error("must not refetch") },
            resetBracketMatchesAfterSchedule = { error("must not reset") },
            refreshLeagueStandingsAfterSchedule = { error("must not refresh standings") },
            showLoading = { events += "show" },
            hideLoading = { events += "hide" },
        )

        val failure = assertIs<EventScheduleEditResult.Failure>(result)
        assertEquals(
            "Save staff changes with Confirm before rescheduling or rebuilding the schedule.",
            failure.throwable.message,
        )
        assertEquals(listOf("show", "prepare", "hide"), events)
    }

    @Test
    fun runSaveEventAction_rejects_a_missing_loaded_revision_before_any_write_or_refresh() = runTest {
        val events = mutableListOf<String>()
        val result = EventEditActionCoordinator().runSaveEventAction(
            pendingStaffInvites = emptyList(),
            expectedStaffRevision = null,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            updatePreparedEvent = { _, _ ->
                events += "update"
                error("must not update")
            },
            refreshStaffState = {
                events += "refresh"
                error("must not refresh")
            },
            reconcileStaffState = { _, _, _ -> error("must not reconcile") },
            refetchMatchesOfTournament = { error("must not refetch") },
            showLoading = { events += "show" },
            hideLoading = { events += "hide" },
        )

        val failure = assertIs<EventSaveActionResult.Failure>(result)
        assertEquals(false, failure.didSaveEventDetails)
        assertEquals(listOf("show", "prepare", "hide"), events)
    }

    @Test
    fun runSaveEventAction_reports_partial_success_when_staff_reconcile_fails_after_update() = runTest {
        val updated = Event(id = "event-1", name = "Updated")
        val result = EventEditActionCoordinator().runSaveEventAction(
            pendingStaffInvites = emptyList(),
            expectedStaffRevision = "staff-revision-loaded",
            prepareEventForUpdate = { PreparedEventForUpdate(event = updated) },
            updatePreparedEvent = { _, _ -> updated },
            refreshStaffState = {
                EventStaffState(
                    event = updated,
                    staffInvites = emptyList(),
                    revision = "staff-revision-after-patch",
                )
            },
            reconcileStaffState = { _, _, _ -> error("staff reconcile failed") },
            refetchMatchesOfTournament = { error("must not refetch") },
            showLoading = {},
            hideLoading = {},
        )

        val failure = assertIs<EventSaveActionResult.Failure>(result)
        assertEquals(
            "Event details were saved, but staff changes were not. Review the staff entries and retry.",
            failure.fallbackMessage,
        )
        assertEquals(true, failure.didSaveEventDetails)
        assertEquals(failure.fallbackMessage, failure.userFacingMessage())
    }

    @Test
    fun runScheduleEditAction_reschedules_with_refetch_and_standings_refresh() = runTest {
        val coordinator = EventEditActionCoordinator()
        val draft = Event(id = "event-1", name = "Draft")
        val updated = draft.copy(name = "Updated")
        val scheduled = updated.copy(state = "SCHEDULED")
        val events = mutableListOf<String>()

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.RESCHEDULE,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = draft)
            },
            logPreparedFieldOwnership = { action, prepared ->
                events += "log:$action:${prepared.event.id}"
            },
            updateEvent = { prepared ->
                events += "update:${prepared.event.id}"
                updated
            },
            deleteMatchesOfTournament = { eventId ->
                events += "delete:$eventId"
            },
            scheduleEvent = { action, event ->
                events += "schedule:${action.name}:${event.id}"
                scheduled
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            resetBracketMatchesAfterSchedule = { event ->
                events += "reset:${event.id}"
            },
            refreshLeagueStandingsAfterSchedule = { event ->
                events += "standings:${event.id}"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val success = assertIs<EventScheduleEditResult.Success>(result)
        assertEquals("Event rescheduled.", success.message)
        assertEquals(scheduled, success.scheduledEvent)
        assertEquals(
            listOf(
                "show:Rescheduling event...",
                "prepare",
                "log:reschedule:event-1",
                "update:event-1",
                "schedule:RESCHEDULE:event-1",
                "refetch:event-1",
                "standings:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runScheduleEditAction_builds_brackets_with_delete_reset_and_success_message() = runTest {
        val coordinator = EventEditActionCoordinator()
        val draft = Event(id = "event-1", maxParticipants = 12)
        val updated = draft.copy(name = "Updated")
        val scheduled = updated.copy(state = "SCHEDULED")
        val events = mutableListOf<String>()

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.BUILD_BRACKETS,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = draft)
            },
            logPreparedFieldOwnership = { action, prepared ->
                events += "log:$action:${prepared.event.id}"
            },
            updateEvent = { prepared ->
                events += "update:${prepared.event.id}"
                updated
            },
            deleteMatchesOfTournament = { eventId ->
                events += "delete:$eventId"
            },
            scheduleEvent = { action, event ->
                events += "schedule:${action.name}:${event.id}"
                scheduled
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            resetBracketMatchesAfterSchedule = { event ->
                events += "reset:${event.id}"
            },
            refreshLeagueStandingsAfterSchedule = { event ->
                events += "standings:${event.id}"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val success = assertIs<EventScheduleEditResult.Success>(result)
        assertEquals("Bracket build completed.", success.message)
        assertEquals(scheduled, success.scheduledEvent)
        assertEquals(
            listOf(
                "show:Building bracket(s)...",
                "prepare",
                "log:build_brackets:event-1",
                "update:event-1",
                "delete:event-1",
                "schedule:BUILD_BRACKETS:event-1",
                "reset:event-1",
                "standings:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runScheduleEditAction_returns_failure_and_hides_loading() = runTest {
        val coordinator = EventEditActionCoordinator()
        val events = mutableListOf<String>()
        val failure = IllegalStateException("boom")

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            logPreparedFieldOwnership = { action, _ ->
                events += "log:$action"
            },
            updateEvent = {
                events += "update"
                throw failure
            },
            deleteMatchesOfTournament = { eventId ->
                events += "delete:$eventId"
            },
            scheduleEvent = { action, event ->
                events += "schedule:${action.name}:${event.id}"
                event
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            resetBracketMatchesAfterSchedule = { event ->
                events += "reset:${event.id}"
            },
            refreshLeagueStandingsAfterSchedule = { event ->
                events += "standings:${event.id}"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val error = assertIs<EventScheduleEditResult.Failure>(result)
        assertEquals(failure, error.throwable)
        assertEquals("Failed to rebuild without placeholder teams.", error.fallbackMessage)
        assertEquals(
            listOf(
                "show:Rebuilding without placeholder teams...",
                "prepare",
                "log:rebuild_without_placeholders",
                "update",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runCreateTemplateAction_skips_existing_template_and_creates_new_template() = runTest {
        val coordinator = EventEditActionCoordinator()
        val events = mutableListOf<String>()

        val alreadyTemplate = coordinator.runCreateTemplateAction(
            sourceEvent = Event(id = "template-1", state = "TEMPLATE"),
            createTemplate = { sourceEventId ->
                events += "create-existing:$sourceEventId"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        assertEquals(
            EventTemplateCreateResult.AlreadyTemplate("This event is already a template."),
            alreadyTemplate,
        )
        assertEquals(emptyList(), events)

        val organizationManaged = coordinator.runCreateTemplateAction(
            sourceEvent = Event(id = "event-org", state = "PUBLISHED", organizationId = "org-1"),
            createTemplate = { sourceEventId ->
                events += "create-org:$sourceEventId"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        assertEquals(
            EventTemplateCreateResult.OrganizationManaged("Create organization event templates from the web app."),
            organizationManaged,
        )
        assertEquals(emptyList(), events)

        val created = coordinator.runCreateTemplateAction(
            sourceEvent = Event(id = "event-1", state = "DRAFT"),
            createTemplate = { sourceEventId ->
                events += "create:$sourceEventId"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        assertEquals(
            EventTemplateCreateResult.Success("Template created and added to your templates."),
            created,
        )
        assertEquals(
            listOf(
                "show:Creating template ...",
                "create:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runPublishEventAction_skips_published_event_and_refreshes_after_update_failure() = runTest {
        val coordinator = EventEditActionCoordinator()
        val events = mutableListOf<String>()

        val alreadyPublished = coordinator.runPublishEventAction(
            currentEvent = Event(id = "event-1", state = "PUBLISHED"),
            updateEvent = {
                events += "update-published"
                Result.success(it)
            },
            refreshEvent = { eventId -> events += "refresh-published:$eventId" },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        assertEquals(EventPublishResult.AlreadyPublished, alreadyPublished)
        assertEquals(emptyList(), events)

        val failure = IllegalStateException("nope")
        val failedPublish = coordinator.runPublishEventAction(
            currentEvent = Event(id = "event-1", state = "DRAFT"),
            updateEvent = { event ->
                events += "update:${event.state}"
                Result.failure(failure)
            },
            refreshEvent = { eventId -> events += "refresh:$eventId" },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val error = assertIs<EventPublishResult.Failure>(failedPublish)
        assertEquals(failure, error.throwable)
        assertEquals("Failed to publish event.", error.fallbackMessage)
        assertEquals(
            listOf(
                "show:Publishing event...",
                "update:PUBLISHED",
                "refresh:event-1",
                "hide",
            ),
            events,
        )
    }
}
