package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class EventEditActionCoordinatorTest {
    @Test
    fun runSaveEventAction_saves_the_canonical_editor_outcome_then_refetches_league_matches() = runTest {
        val coordinator = EventEditActionCoordinator()
        val preparedEvent = Event(id = "event-1", eventType = EventType.LEAGUE)
        val finalEvent = preparedEvent.copy(name = "Updated")
        val staffInvite = Invite(
            id = "invite-1",
            type = "STAFF",
            email = "staff@example.com",
            eventId = "event-1",
        )
        val events = mutableListOf<String>()

        val result = coordinator.runSaveEventAction(
            pendingStaffInvites = emptyList(),
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = preparedEvent)
            },
            savePreparedEvent = { prepared, pendingInvites ->
                events += "save:${prepared.event.id}:${pendingInvites.size}"
                saveOutcome(finalEvent, listOf(staffInvite))
            },
            refetchMatchesOfTournament = { eventId ->
                events += "refetch:$eventId"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )

        val success = assertIs<EventSaveActionResult.Success>(result)
        assertEquals(finalEvent.id, success.finalEvent.id)
        assertEquals(finalEvent.name, success.finalEvent.name)
        assertEquals(listOf(staffInvite), success.staffInvites)
        assertEquals("test-staff-revision", success.staffRevision)
        assertEquals("SENT", success.staffEmailDelivery)
        assertEquals(
            listOf(
                "show:Saving event...",
                "prepare",
                "save:event-1:0",
                "refetch:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runSaveEventAction_rejects_invalid_pending_staff_before_the_editor_write() = runTest {
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
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            savePreparedEvent = { _, _ ->
                error("must not save")
            },
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
    fun runSaveEventAction_reports_editor_write_failure_without_claiming_partial_success() = runTest {
        val failure = IllegalStateException("editor write failed")
        val result = EventEditActionCoordinator().runSaveEventAction(
            pendingStaffInvites = emptyList(),
            prepareEventForUpdate = {
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            savePreparedEvent = { _, _ -> throw failure },
            refetchMatchesOfTournament = { error("must not refetch") },
            showLoading = {},
            hideLoading = {},
        )

        val resultFailure = assertIs<EventSaveActionResult.Failure>(result)
        assertEquals(failure, resultFailure.throwable)
        assertEquals(false, resultFailure.didSaveEventDetails)
    }

    @Test
    fun runSaveEventAction_preserves_staff_delivery_status_from_atomic_outcome() = runTest {
        val result = EventEditActionCoordinator().runSaveEventAction(
            pendingStaffInvites = emptyList(),
            prepareEventForUpdate = {
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            savePreparedEvent = { _, _ ->
                saveOutcome(Event(id = "event-1"), delivery = "FAILED")
            },
            refetchMatchesOfTournament = {},
            showLoading = {},
            hideLoading = {},
        )

        val success = assertIs<EventSaveActionResult.Success>(result)
        assertEquals("FAILED", success.staffEmailDelivery)
    }

    private fun saveOutcome(
        event: Event,
        staffInvites: List<Invite> = emptyList(),
        delivery: String = "SENT",
    ): EventEditorSaveOutcome {
        val baseline = com.razumly.mvp.eventCreate.createEventEditorSession(event = event)
        val canonical = baseline.canonicalState.copy(pendingStaffInvites = staffInvites)
        return EventEditorSaveOutcome(
            session = baseline.copy(
                canonicalState = canonical,
                baseline = canonical,
            ),
            staffEmailDelivery = delivery,
        )
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
    fun runScheduleEditAction_builds_brackets_without_deleting_existing_matches_and_resets_after_schedule() = runTest {
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
                "schedule:BUILD_BRACKETS:event-1",
                "reset:event-1",
                "standings:event-1",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun runScheduleEditAction_reports_schedule_failure_after_saving_settings_and_hides_loading() = runTest {
        val coordinator = EventEditActionCoordinator()
        val events = mutableListOf<String>()
        val draft = Event(id = "event-1")
        val updated = draft.copy(name = "Updated")
        val failure = IllegalStateException("schedule failed")

        val result = coordinator.runScheduleEditAction(
            action = EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = draft)
            },
            logPreparedFieldOwnership = { action, _ ->
                events += "log:$action"
            },
            updateEvent = {
                events += "update"
                updated
            },
            scheduleEvent = { action, event ->
                events += "schedule:${action.name}:${event.id}"
                throw failure
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
        assertEquals(true, error.settingsSaved)
        assertEquals(
            listOf(
                "show:Rebuilding without placeholder teams...",
                "prepare",
                "log:rebuild_without_placeholders",
                "update",
                "schedule:REBUILD_WITHOUT_PLACEHOLDER_TEAMS:event-1",
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
