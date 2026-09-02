package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import com.razumly.mvp.core.data.repositories.EventEditorProposalStaleException
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleWarningDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventEditorErrorDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRejectedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
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
        scheduleOutcome: EventEditorScheduleOutcomeDto = EventEditorScheduleOutcomeDto(
            status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
            matchCount = 0,
        ),
    ): EventEditorSaveOutcome {
        val baseline = com.razumly.mvp.eventCreate.createEventEditorSession(event = event)
        val canonical = baseline.canonicalState.copy(pendingStaffInvites = staffInvites)
        return EventEditorSaveOutcome(
            session = baseline.copy(
                canonicalState = canonical,
                baseline = canonical,
            ),
            staffEmailDelivery = delivery,
            scheduleOutcome = scheduleOutcome,
        )
    }


    @Test
    fun given_schedule_maintenance_when_proposal_is_created_then_it_stays_transient_until_acceptance() = runTest {
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.BUILD)
        val events = mutableListOf<String>()
        var operationIdCalls = 0

        val result = EventEditActionCoordinator().runScheduleMaintenanceAction(
            action = EventScheduleEditAction.BUILD_SCHEDULE,
            prepareEventForUpdate = {
                events += "prepare"
                PreparedEventForUpdate(event = Event(id = "event-1"))
            },
            logPreparedFieldOwnership = { action, _ -> events += "log:$action" },
            updateEvent = { prepared ->
                events += "update:${prepared.event.id}"
                saveOutcome(prepared.event)
            },
            proposeMaintenance = { action, event ->
                events += "propose:${action.maintenanceOperation}:${event.id}"
                EventEditorMaintenanceResponseDto.Proposed(proposal)
            },
            refreshAcceptedSchedule = {
                events += "refresh"
                error("proposal must remain transient")
            },
            showLoading = {},
            hideLoading = {},
            newOperationId = {
                operationIdCalls += 1
                "acceptance-operation-1"
            },
        )

        val proposed = assertIs<EventScheduleMaintenanceActionResult.Proposed>(result)
        assertEquals(EventScheduleMaintenanceReviewPhase.PROPOSED, proposed.review.phase)
        assertEquals("acceptance-operation-1", proposed.review.acceptanceOperationId)
        assertEquals(true, proposed.review.includePlaceholderTeams)
        assertEquals(1, operationIdCalls)
        assertEquals(
            listOf(
                "prepare",
                "log:build_schedule",
                "update:event-1",
                "propose:BUILD:event-1",
            ),
            events,
        )
    }

    @Test
    fun given_accepted_schedule_maintenance_when_refreshing_then_fresh_schedule_is_loaded_before_success() = runTest {
        val updated = Event(id = "event-1", name = "Updated")
        val scheduled = updated.copy(name = "Fresh schedule")
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.COMPLETE)
        val accepted = maintenanceAcceptedResult(
            proposal = proposal,
            warnings = listOf(
                EventEditorScheduleWarningDto(
                    code = "RESOURCE_LIMIT",
                    message = "One resource limited concurrency.",
                    restrictingFactor = "RESOURCE",
                ),
            ),
        )
        val events = mutableListOf<String>()

        val result = EventEditActionCoordinator().runScheduleMaintenanceAction(
            action = EventScheduleEditAction.RESCHEDULE,
            prepareEventForUpdate = {
                PreparedEventForUpdate(event = updated)
            },
            logPreparedFieldOwnership = { action, _ -> events += "log:$action" },
            updateEvent = {
                events += "update"
                saveOutcome(updated)
            },
            proposeMaintenance = { _, _ ->
                EventEditorMaintenanceResponseDto.Accepted(accepted)
            },
            refreshAcceptedSchedule = { eventId ->
                events += "refresh:$eventId"
                scheduled
            },
            showLoading = {},
            hideLoading = {},
            newOperationId = { error("accepted response must not allocate a review operation") },
        )

        val success = assertIs<EventScheduleMaintenanceActionResult.Accepted>(result)
        assertEquals(scheduled, success.scheduledEvent)
        assertEquals("Schedule completed.\nOne resource limited concurrency.", success.message)
        assertEquals(listOf("log:complete_schedule", "update", "refresh:event-1"), events)
    }

    @Test
    fun given_accepted_proposal_when_schedule_refresh_fails_then_event_is_not_rolled_back() = runTest {
        val updated = Event(id = "event-1", name = "Updated")
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.COMPLETE)
        val accepted = maintenanceAcceptedResult(proposal)
        var rollbackCalls = 0

        val result = EventEditActionCoordinator().runScheduleMaintenanceAction(
            action = EventScheduleEditAction.RESCHEDULE,
            prepareEventForUpdate = { PreparedEventForUpdate(event = updated) },
            logPreparedFieldOwnership = { _, _ -> },
            updateEvent = { saveOutcome(updated) },
            proposeMaintenance = { _, _ ->
                EventEditorMaintenanceResponseDto.Accepted(accepted)
            },
            rollbackEvent = {
                rollbackCalls += 1
                true
            },
            refreshAcceptedSchedule = { error("schedule refresh failed") },
            showLoading = {},
            hideLoading = {},
            newOperationId = { error("accepted response must not allocate a review operation") },
        )

        val failure = assertIs<EventScheduleMaintenanceActionResult.Failure>(result)
        assertEquals(0, rollbackCalls)
        assertEquals(false, failure.settingsSaved)
    }

    @Test
    fun given_rejected_schedule_maintenance_when_handled_then_success_is_not_reported() = runTest {
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)
        var refreshCalls = 0

        val result = EventEditActionCoordinator().runScheduleMaintenanceAction(
            action = EventScheduleEditAction.REBUILD_SCHEDULE,
            prepareEventForUpdate = { PreparedEventForUpdate(event = Event(id = "event-1")) },
            logPreparedFieldOwnership = { _, _ -> },
            updateEvent = { prepared -> saveOutcome(prepared.event) },
            proposeMaintenance = { _, _ ->
                EventEditorMaintenanceResponseDto.Rejected(maintenanceRejectedResult(proposal))
            },
            rollbackEvent = { true },
            refreshAcceptedSchedule = {
                refreshCalls += 1
                error("rejected proposal must not refresh")
            },
            showLoading = {},
            hideLoading = {},
            newOperationId = { "unused" },
        )

        val rejected = assertIs<EventScheduleMaintenanceActionResult.Rejected>(result)
        assertEquals("The schedule proposal was rejected. Request a new proposal.", rejected.message)
        assertEquals(0, refreshCalls)
    }

    @Test
    fun given_stale_schedule_maintenance_when_handled_then_success_is_not_reported() = runTest {
        val stale = EventEditorProposalStaleException(
            statusCode = 409,
            url = "http://example.test/api/events/event-1/schedule",
            payload = EventEditorErrorDto(
                error = "The schedule changed while you were editing.",
                code = "EDITOR_MAINTENANCE_STALE",
            ),
            responseBody = null,
        )

        val result = EventEditActionCoordinator().runScheduleMaintenanceAction(
            action = EventScheduleEditAction.RESCHEDULE,
            prepareEventForUpdate = { PreparedEventForUpdate(event = Event(id = "event-1")) },
            logPreparedFieldOwnership = { _, _ -> },
            updateEvent = { prepared -> saveOutcome(prepared.event) },
            proposeMaintenance = { _, _ -> throw stale },
            rollbackEvent = { true },
            refreshAcceptedSchedule = { error("stale proposal must not refresh") },
            showLoading = {},
            hideLoading = {},
            newOperationId = { "unused" },
        )

        val failure = assertIs<EventScheduleMaintenanceActionResult.Failure>(result)
        assertEquals(stale, failure.throwable)
        assertEquals(false, failure.settingsSaved)
        assertEquals(false, failure.rollbackFailed)
    }

    @Test
    fun given_stale_schedule_maintenance_when_event_restore_fails_then_reports_terminal_failure() = runTest {
        val stale = EventEditorProposalStaleException(
            statusCode = 409,
            url = "http://example.test/api/events/event-1/schedule",
            payload = EventEditorErrorDto(
                error = "The schedule changed while you were editing.",
                code = "EDITOR_MAINTENANCE_STALE",
            ),
            responseBody = null,
        )

        val result = EventEditActionCoordinator().runScheduleMaintenanceAction(
            action = EventScheduleEditAction.RESCHEDULE,
            prepareEventForUpdate = { PreparedEventForUpdate(event = Event(id = "event-1")) },
            logPreparedFieldOwnership = { _, _ -> },
            updateEvent = { prepared -> saveOutcome(prepared.event) },
            proposeMaintenance = { _, _ -> throw stale },
            rollbackEvent = { false },
            refreshAcceptedSchedule = { error("stale proposal must not refresh") },
            showLoading = {},
            hideLoading = {},
            newOperationId = { "unused" },
        )

        val failure = assertIs<EventScheduleMaintenanceActionResult.Failure>(result)
        assertEquals(true, failure.settingsSaved)
        assertEquals(true, failure.rollbackFailed)
        assertEquals(
            "Schedule maintenance failed and the Event changes could not be restored.",
            failure.throwable.message,
        )
    }

    @Test
    fun given_placeholder_free_schedule_maintenance_when_retried_then_the_intent_is_preserved() = runTest {
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)

        val result = EventEditActionCoordinator().runScheduleMaintenanceAction(
            action = EventScheduleEditAction.REBUILD_WITHOUT_PLACEHOLDER_TEAMS,
            prepareEventForUpdate = { PreparedEventForUpdate(event = Event(id = "event-1")) },
            logPreparedFieldOwnership = { _, _ -> },
            updateEvent = { prepared -> saveOutcome(prepared.event) },
            proposeMaintenance = { _, _ ->
                EventEditorMaintenanceResponseDto.Proposed(proposal)
            },
            refreshAcceptedSchedule = { error("proposal must remain transient") },
            showLoading = {},
            hideLoading = {},
            newOperationId = { "acceptance-operation-1" },
        )

        val proposed = assertIs<EventScheduleMaintenanceActionResult.Proposed>(result)
        assertEquals(false, proposed.review.includePlaceholderTeams)
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

private fun maintenanceProposal(
    operation: EventEditorMaintenanceOperation,
): EventEditorMaintenanceProposalDto {
    val matches = listOf(
        EventEditorMatchProjectionDto(
            id = "match-1",
            matchId = 1,
            eventId = "event-1",
            placementState = "PLACED",
            fieldId = "field-1",
        ),
    )
    return EventEditorMaintenanceProposalDto(
        status = EventEditorMaintenanceResponseStatus.PROPOSED,
        contractVersion = 3,
        eventId = "event-1",
        operation = operation,
        operationId = "maintenance-operation-1",
        proposalRevision = "proposal-revision-1",
        revisionBinding = EventEditorRevisionBindingDto(
            editorRevision = "editor-revision-1",
            scheduleRevision = "schedule-revision-1",
            availabilityRevision = "availability-revision-1",
        ),
        graph = EventEditorMaintenanceGraphDto(
            event = EventApiDto(id = "event-1", eventType = "LEAGUE"),
            matches = matches,
        ),
        protectedMatchIds = listOf("match-protected"),
        scheduleOutcome = EventEditorMaintenanceScheduleOutcomeDto(
            status = EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
            isComplete = true,
            matchCount = 1,
            placedMatchCount = 1,
            unplacedMatchCount = 0,
            matches = matches,
            unscheduledMatches = emptyList(),
            affectedCompetitionPhases = emptyList(),
            warnings = emptyList(),
        ),
    )
}

private fun maintenanceAcceptedResult(
    proposal: EventEditorMaintenanceProposalDto,
    warnings: List<EventEditorScheduleWarningDto> = emptyList(),
): EventEditorMaintenanceAcceptedResultDto = EventEditorMaintenanceAcceptedResultDto(
    status = EventEditorMaintenanceResponseStatus.ACCEPTED,
    contractVersion = proposal.contractVersion,
    eventId = proposal.eventId,
    operation = proposal.operation,
    operationId = proposal.operationId,
    proposalRevision = proposal.proposalRevision,
    revisionBinding = proposal.revisionBinding,
    graph = proposal.graph,
    protectedMatchIds = proposal.protectedMatchIds,
    scheduleOutcome = proposal.scheduleOutcome.copy(warnings = warnings),
    acceptanceOperationId = "acceptance-operation-1",
)

private fun maintenanceRejectedResult(
    proposal: EventEditorMaintenanceProposalDto,
): EventEditorMaintenanceRejectedResultDto = EventEditorMaintenanceRejectedResultDto(
    status = EventEditorMaintenanceResponseStatus.REJECTED,
    contractVersion = proposal.contractVersion,
    eventId = proposal.eventId,
    operation = proposal.operation,
    operationId = proposal.operationId,
    proposalRevision = proposal.proposalRevision,
)
