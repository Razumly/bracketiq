package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import com.razumly.mvp.core.data.repositories.EventEditorSession
import com.razumly.mvp.core.data.repositories.EventEditorSessionMapper
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.EventEditorMaintenanceAcceptanceConflictException
import com.razumly.mvp.core.data.repositories.EventEditorMaintenanceAcceptedSyncPendingException
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.TeamApiDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorRejectMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorErrorDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRejectedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorScheduleTransitionMode
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.eventCreate.CreateEvent_FakeBillingRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeEventRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeLoadingHandler
import com.razumly.mvp.eventCreate.CreateEvent_FakeMatchRepository
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.eventDetail.data.IMatchRepository
import kotlinx.coroutines.CompletableDeferred

import com.razumly.mvp.eventCreate.createEventEditorSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class EventEditActionHandlerTest {
    @Test
    fun given_failed_proposal_transport_when_retrying_unchanged_action_then_reuses_operation_id() = runTest {
        val event = testEvent().copy(maxParticipants = 8)
        val session = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.COMPLETE),
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(session, session)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(session), saveOutcome(session))),
            proposalResponses = ArrayDeque(
                listOf(
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(EventEditorMaintenanceOperation.COMPLETE),
                    ),
                ),
            ),
            proposalFailures = ArrayDeque(listOf(IllegalStateException("proposal transport failed"))),
        )
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rescheduleEvent()
        advanceUntilIdle()
        handler.rescheduleEvent()
        advanceUntilIdle()

        assertEquals(2, repository.maintenanceRequests.size)
        assertEquals(
            repository.maintenanceRequests[0].operationId,
            repository.maintenanceRequests[1].operationId,
        )
        assertEquals(8, repository.maintenanceRequests[0].participantCount)
        assertEquals(8, repository.maintenanceRequests[1].participantCount)
        assertEquals(null, repository.maintenanceRequests[0].includePlaceholderTeams)
        assertEquals(null, repository.maintenanceRequests[1].includePlaceholderTeams)
        assertEquals(
            EventEditorRevisionBindingDto(
                editorRevision = "editor-revision",
                staffRevision = null,
                scheduleRevision = "schedule-revision",
                availabilityRevision = "availability-revision",
            ),
            repository.maintenanceRequests[0].expectedRevisions,
        )
    }

    @Test
    fun given_failed_proposal_transport_when_saved_inputs_change_then_allocates_new_operation_id() = runTest {
        val initialEvent = testEvent().copy(maxParticipants = 8)
        val changedEvent = initialEvent.copy(maxParticipants = 10)
        val initialSession = editorSession(
            event = initialEvent,
            operations = listOf(EventEditorMaintenanceOperation.COMPLETE),
        )
        val changedSession = editorSession(
            event = changedEvent,
            operations = listOf(EventEditorMaintenanceOperation.COMPLETE),
            editorRevision = "changed-editor-revision",
            scheduleRevision = "changed-schedule-revision",
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession, changedSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession), saveOutcome(changedSession))),
            proposalResponses = ArrayDeque(
                listOf(
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(EventEditorMaintenanceOperation.COMPLETE),
                    ),
                ),
            ),
            proposalFailures = ArrayDeque(listOf(IllegalStateException("proposal transport failed"))),
        )
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = initialEvent,
            repository = repository,
            errors = errors,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rescheduleEvent()
        advanceUntilIdle()
        handler.editEventField { copy(maxParticipants = 10) }
        handler.rescheduleEvent()
        advanceUntilIdle()

        assertEquals(2, repository.maintenanceRequests.size)
        assertNotEquals(
            repository.maintenanceRequests[0].operationId,
            repository.maintenanceRequests[1].operationId,
        )
        assertEquals(8, repository.maintenanceRequests[0].participantCount)
        assertEquals(10, repository.maintenanceRequests[1].participantCount)
    }

    @Test
    fun given_stale_complete_when_fresh_snapshot_lacks_complete_then_keeps_old_review_and_shows_unavailable() = runTest {
        val event = testEvent()
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.COMPLETE),
        )
        val freshSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            editorRevision = "fresh-editor-revision",
            scheduleRevision = "fresh-schedule-revision",
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession, freshSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession))),
            proposalResponses = ArrayDeque(
                listOf(
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(EventEditorMaintenanceOperation.COMPLETE),
                    ),
                ),
            ),
        )
        repository.acceptMaintenanceFailure = staleMaintenanceFailure()
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rescheduleEvent()
        advanceUntilIdle()
        val originalReview = assertNotNull(handler.scheduleMaintenanceReview.value)

        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(EventScheduleMaintenanceReviewPhase.STALE, handler.scheduleMaintenanceReview.value?.phase)
        assertEquals(
            originalReview.proposal.operationId,
            repository.acceptanceRequests.single().operationId,
        )
        assertEquals(
            originalReview.acceptanceOperationId,
            repository.acceptanceRequests.single().acceptanceOperationId,
        )

        handler.requestFreshScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals(listOf("event-1", "event-1"), repository.editorRequests)
        assertEquals(1, repository.maintenanceRequests.size)
        assertEquals(
            originalReview.proposal.operationId,
            handler.scheduleMaintenanceReview.value?.proposal?.operationId,
        )
        assertEquals(
            originalReview.acceptanceOperationId,
            handler.scheduleMaintenanceReview.value?.acceptanceOperationId,
        )
        assertEquals(
            "Schedule maintenance is not available for this event.",
            errors.lastOrNull(),
        )
    }

    @Test
    fun given_stale_rebuild_without_placeholders_when_operation_remains_available_then_replays_same_intent() = runTest {
        val event = testEvent().copy(timeZone = "America/Los_Angeles")
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
        )
        val freshSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            editorRevision = "fresh-editor-revision",
            scheduleRevision = "fresh-schedule-revision",
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession, freshSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession), saveOutcome(freshSession))),
            proposalResponses = ArrayDeque(
                listOf(
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(
                            operation = EventEditorMaintenanceOperation.REBUILD,
                            operationId = "proposal-operation-1",
                            proposalRevision = "proposal-revision-1",
                        ),
                    ),
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(
                            operation = EventEditorMaintenanceOperation.REBUILD,
                            operationId = "proposal-operation-2",
                            proposalRevision = "proposal-revision-2",
                        ),
                    ),
                ),
            ),
        )
        repository.acceptMaintenanceFailure = staleMaintenanceFailure()
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        val originalReview = assertNotNull(handler.scheduleMaintenanceReview.value)
        assertEquals(false, originalReview.includePlaceholderTeams)
        assertEquals("America/Los_Angeles", originalReview.eventTimeZone)

        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()
        handler.requestFreshScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals(2, repository.editorRequests.size)
        assertEquals(2, repository.maintenanceRequests.size)
        assertEquals(EventEditorMaintenanceOperation.REBUILD, repository.maintenanceRequests[1].operation)
        assertEquals(false, repository.maintenanceRequests[1].includePlaceholderTeams)
        assertEquals(
            "proposal-operation-2",
            handler.scheduleMaintenanceReview.value?.proposal?.operationId,
        )
        assertEquals(false, handler.scheduleMaintenanceReview.value?.includePlaceholderTeams)
        assertEquals(emptyList(), errors)
    }

    @Test
    fun given_stale_proposal_when_refreshing_then_reseeds_fresh_canonical_draft_before_retry() = runTest {
        val event = testEvent().copy(name = "Old server value")
        val freshEvent = event.copy(name = "New server value")
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
        )
        val freshSession = editorSession(
            event = freshEvent,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            editorRevision = "fresh-editor-revision",
            scheduleRevision = "fresh-schedule-revision",
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession, freshSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession), saveOutcome(freshSession))),
            proposalResponses = ArrayDeque(
                listOf(
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(
                            operation = EventEditorMaintenanceOperation.REBUILD,
                            operationId = "proposal-operation-1",
                        ),
                    ),
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(
                            operation = EventEditorMaintenanceOperation.REBUILD,
                            operationId = "proposal-operation-2",
                            proposalRevision = "proposal-revision-2",
                        ),
                    ),
                ),
            ),
        )
        repository.acceptMaintenanceFailure = staleMaintenanceFailure()
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.editEventField { copy(name = "Local draft value") }
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(EventScheduleMaintenanceReviewPhase.STALE, handler.scheduleMaintenanceReview.value?.phase)

        handler.requestFreshScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals("Local draft value", repository.saveCommands[0].draft.basics.name)
        assertEquals("New server value", repository.saveCommands[1].draft.basics.name)
        assertEquals(2, repository.saveCommands.size)
        assertEquals(2, repository.maintenanceRequests.size)
        assertEquals(emptyList(), errors)
    }

    @Test
    fun given_stale_proposal_when_refresh_tapped_twice_then_only_one_refresh_runs_and_dismiss_wins() = runTest {
        val event = testEvent()
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
        )
        val freshSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            editorRevision = "fresh-editor-revision",
            scheduleRevision = "fresh-schedule-revision",
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession, freshSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession), saveOutcome(freshSession))),
            proposalResponses = ArrayDeque(
                listOf(
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(EventEditorMaintenanceOperation.REBUILD),
                    ),
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(
                            operation = EventEditorMaintenanceOperation.REBUILD,
                            operationId = "proposal-operation-2",
                            proposalRevision = "proposal-revision-2",
                        ),
                    ),
                ),
            ),
        )
        repository.acceptMaintenanceFailure = staleMaintenanceFailure()
        val refreshGate = CompletableDeferred<Unit>()
        repository.refreshEditorGate = refreshGate
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()
        handler.requestFreshScheduleMaintenanceProposal()
        advanceUntilIdle()

        handler.requestFreshScheduleMaintenanceProposal()
        assertEquals(2, repository.editorRequests.size)
        assertEquals(1, repository.maintenanceRequests.size)

        handler.dismissScheduleMaintenanceReview()
        refreshGate.complete(Unit)
        advanceUntilIdle()

        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(2, repository.editorRequests.size)
        assertEquals(1, repository.maintenanceRequests.size)
        assertEquals(1, repository.saveCommands.size)
        assertEquals(emptyList(), errors)
    }

    @Test
    fun given_accepted_maintenance_when_refreshing_then_uses_fresh_batch_event_and_match_reads_before_exposing_success() = runTest {
        val event = testEvent()
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
        )
        val savedSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            editorRevision = "saved-editor-revision",
            scheduleRevision = "saved-schedule-revision",
        )
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(savedSession))),
            proposalResponses = ArrayDeque(
                listOf(EventEditorMaintenanceResponseDto.Proposed(proposal)),
            ),
        )
        repository.acceptMaintenanceResult = acceptedMaintenanceResult(proposal)
        repository.batchEvents = listOf(event.copy(name = "Accepted fresh event"))
        val matchRepository = HandlerMatchRepository()
        val errors = mutableListOf<String>()
        var handlerReference: EventEditActionHandler? = null
        val reviewPhasesDuringSync = mutableListOf<EventScheduleMaintenanceReviewPhase?>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
            matchRepository = matchRepository,
            refreshLeagueStandingsAfterSchedule = {
                reviewPhasesDuringSync += handlerReference?.scheduleMaintenanceReview?.value?.phase
            },
        )
        handlerReference = handler

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals(listOf(listOf(event.id)), repository.eventBatchRequests)
        assertEquals(listOf(listOf(event.id)), matchRepository.batchRequests)
        assertEquals(emptyList(), matchRepository.singularRequests)
        assertEquals(listOf<EventScheduleMaintenanceReviewPhase?>(EventScheduleMaintenanceReviewPhase.ACCEPTING), reviewPhasesDuringSync)
        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(listOf("Schedule rebuilt."), errors)
    }
    @Test
    fun given_accepted_maintenance_when_schedule_sync_fails_then_exposes_retry_only_terminal_review() = runTest {
        val event = testEvent()
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
        )
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession))),
            proposalResponses = ArrayDeque(
                listOf(EventEditorMaintenanceResponseDto.Proposed(proposal)),
            ),
            batchFailures = ArrayDeque(listOf(IllegalStateException("schedule sync failed"))),
        )
        repository.acceptMaintenanceResult = acceptedMaintenanceResult(proposal)
        repository.batchEvents = listOf(event)
        val matchRepository = HandlerMatchRepository()
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
            matchRepository = matchRepository,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals(
            EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
            handler.scheduleMaintenanceReview.value?.phase,
        )
        assertEquals("acceptance-operation-1", handler.scheduleMaintenanceReview.value?.acceptanceOperationId)
        val pendingReview = assertNotNull(handler.scheduleMaintenanceReview.value)
        handler.rebuildWithoutPlaceholderTeams()
        assertEquals(1, repository.maintenanceRequests.size)
        handler.dismissScheduleMaintenanceReview()
        handler.cancelEditingEvent()
        assertEquals(pendingReview, handler.scheduleMaintenanceReview.value)
        handler.acceptScheduleMaintenanceProposal()
        handler.rejectScheduleMaintenanceProposal()
        assertEquals(1, repository.acceptanceRequests.size)
        assertEquals(1, repository.maintenanceRequests.size)

        handler.retryAcceptedScheduleSync()
        advanceUntilIdle()

        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(1, repository.acceptanceRequests.size)
        assertEquals(2, repository.eventBatchRequests.size)
    }

    @Test
    fun given_acceptance_conflict_when_accepted_schedule_refresh_succeeds_then_exits_editing_with_current_schedule() = runTest {
        val event = testEvent()
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
        )
        val refreshedSession = editorSession(
            event = event.copy(name = "Accepted server event"),
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            editorRevision = "accepted-editor-revision",
            scheduleRevision = "accepted-schedule-revision",
        )
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession, refreshedSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession))),
            proposalResponses = ArrayDeque(
                listOf(EventEditorMaintenanceResponseDto.Proposed(proposal)),
            ),
        )
        repository.acceptMaintenanceFailure = acceptanceConflictFailure()
        repository.batchEvents = listOf(event.copy(name = "Accepted server event"))
        val matchRepository = HandlerMatchRepository()
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
            matchRepository = matchRepository,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(1, repository.acceptedSyncRequests.size)
        assertEquals(
            listOf("generated-placeholder"),
            repository.acceptedSyncRequests.single().graph.event.teams.mapNotNull { team -> team.id },
        )
        assertEquals(listOf(listOf(event.id)), repository.eventBatchRequests)
        assertEquals(listOf(listOf(event.id)), matchRepository.batchRequests)
        assertEquals(2, repository.editorRequests.size)
        assertTrue(errors.last().contains("accepted by another client"))

        handler.rejectScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(0, repository.rejectionRequests.size)
    }

    @Test
    fun given_rejection_acceptance_conflict_when_schedule_refresh_fails_then_retry_sync_is_only_action_and_converges() = runTest {
        val event = testEvent()
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
        )
        val refreshedSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            editorRevision = "accepted-editor-revision",
            scheduleRevision = "accepted-schedule-revision",
        )
        val proposal = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession, refreshedSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession))),
            proposalResponses = ArrayDeque(
                listOf(EventEditorMaintenanceResponseDto.Proposed(proposal)),
            ),
            batchFailures = ArrayDeque(listOf(IllegalStateException("schedule sync failed"))),
        )
        repository.rejectMaintenanceFailure = acceptanceConflictFailure()
        repository.batchEvents = listOf(event.copy(name = "Accepted server event"))
        val matchRepository = HandlerMatchRepository()
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
            matchRepository = matchRepository,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.rejectScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals(
            EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
            handler.scheduleMaintenanceReview.value?.phase,
        )
        assertEquals(1, repository.rejectionRequests.size)
        assertEquals(1, repository.eventBatchRequests.size)
        assertEquals(1, repository.acceptedSyncRequests.size)
        assertTrue(errors.last().contains("accepted by another client"))

        handler.rejectScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(1, repository.rejectionRequests.size)

        handler.retryAcceptedScheduleSync()
        advanceUntilIdle()

        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(2, repository.eventBatchRequests.size)
        assertEquals(2, repository.editorRequests.size)
        assertEquals(2, repository.acceptedSyncRequests.size)
        assertTrue(errors.last().contains("accepted by another client"))
    }


    @Test
    fun given_event_type_change_when_update_requested_then_confirms_preserving_schedule_for_explicit_follow_up() = runTest {
        val event = testEvent()
        val session = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.COMPLETE),
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(session)),
            saveOutcomes = ArrayDeque(),
            proposalResponses = ArrayDeque(),
        )
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = mutableListOf(),
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.editEventField { copy(eventType = EventType.TOURNAMENT) }
        handler.updateEvent()

        val confirmation = assertNotNull(handler.eventTypeTransitionConfirmation.value)
        assertEquals("Change type", confirmation.actionLabel)
        assertTrue(confirmation.message.contains("preserves the current schedule"))
        assertTrue(confirmation.message.contains("Build or Rebuild explicitly"))
        assertEquals(emptyList(), repository.saveCommands)
    }

    @Test
    fun given_dirty_draft_when_save_disables_automation_then_does_not_post_old_operation() = runTest {
        val event = testEvent()
        val initialSession = editorSession(
            event = event,
            operations = listOf(EventEditorMaintenanceOperation.COMPLETE),
        )
        val savedEvent = event.copy(
            eventType = EventType.TOURNAMENT,
            isAutomatedScheduling = false,
        )
        val savedSession = editorSession(
            event = savedEvent,
            operations = emptyList(),
            editorRevision = "saved-editor-revision",
            scheduleRevision = "saved-schedule-revision",
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(initialSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(savedSession))),
            proposalResponses = ArrayDeque(),
        )
        val errors = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = errors,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.editEventField {
            copy(
                eventType = EventType.TOURNAMENT,
                isAutomatedScheduling = false,
            )
        }
        handler.rescheduleEvent()
        advanceUntilIdle()

        assertEquals(emptyList(), repository.saveCommands)
        assertEquals(emptyList(), repository.maintenanceRequests)
        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(
            "Schedule maintenance is not available for this event.",
            errors.lastOrNull(),
        )
    }

    @Test
    fun given_repository_accepted_sync_pending_failure_when_accepting_then_keeps_review_and_retry_does_not_reaccept() =
        runTest {
            val event = testEvent()
            val initialSession = editorSession(
                event = event,
                operations = listOf(EventEditorMaintenanceOperation.REBUILD),
            )
            val proposal = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)
            val accepted = acceptedMaintenanceResult(proposal)
            val repository = HandlerEventRepository(
                editorSessions = ArrayDeque(listOf(initialSession)),
                saveOutcomes = ArrayDeque(listOf(saveOutcome(initialSession))),
                proposalResponses = ArrayDeque(
                    listOf(EventEditorMaintenanceResponseDto.Proposed(proposal)),
                ),
            ).also { handlerRepository ->
                handlerRepository.acceptMaintenanceFailure =
                    EventEditorMaintenanceAcceptedSyncPendingException(
                        result = accepted,
                        cause = IllegalStateException("Room write failed"),
                    )
                handlerRepository.batchEvents = listOf(event)
            }
            val errors = mutableListOf<String>()
            val handler = createHandler(
                scope = this,
                event = event,
                repository = repository,
                errors = errors,
            )

            handler.startEditingEvent()
            advanceUntilIdle()
            handler.rebuildWithoutPlaceholderTeams()
            advanceUntilIdle()
            handler.acceptScheduleMaintenanceProposal()
            advanceUntilIdle()

            val pendingReview = assertNotNull(handler.scheduleMaintenanceReview.value)
            assertEquals(
                EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
                pendingReview.phase,
            )
            assertEquals(accepted.acceptanceOperationId, pendingReview.acceptanceOperationId)
            assertEquals(1, repository.acceptanceRequests.size)

            handler.acceptScheduleMaintenanceProposal()
            advanceUntilIdle()
            assertEquals(1, repository.acceptanceRequests.size)

            handler.retryAcceptedScheduleSync()
            advanceUntilIdle()

            assertNull(handler.scheduleMaintenanceReview.value)
            assertEquals(1, repository.acceptanceRequests.size)
            assertEquals(1, repository.acceptedSyncRequests.size)
            assertEquals(accepted, repository.acceptedSyncRequests.single())
            assertEquals(1, repository.eventBatchRequests.size)
        }

    private fun createHandler(
        scope: CoroutineScope,
        event: Event,
        repository: HandlerEventRepository,
        errors: MutableList<String>,
        matchRepository: IMatchRepository = HandlerMatchRepository(),
        refreshLeagueStandingsAfterSchedule: suspend (Event) -> Unit = {},
    ): EventEditActionHandler {
        val loadingHandler = CreateEvent_FakeLoadingHandler()
        return EventEditActionHandler(
            scope = scope,
            editActionCoordinator = EventEditActionCoordinator(),
            editDraftCoordinator = EventEditDraftCoordinator(
                initialEvent = event,
                canEditInitial = false,
            ),
            rentalResourcesCoordinator = EventRentalResourcesCoordinator(),
            sportsCatalogCoordinator = EventSportsCatalogCoordinator(),
            inviteCoordinator = EventInviteCoordinator(),
            eventRepository = repository,
            billingRepository = CreateEvent_FakeBillingRepository(),
            matchRepository = matchRepository,
            loadingHandler = { loadingHandler },
            selectedEvent = { event },
            eventWithRelations = {
                EventWithFullRelations(
                    event = event,
                    players = emptyList(),
                    matches = emptyList(),
                    teams = emptyList(),
                )
            },
            eventFields = { emptyList() },
            setStaffState = { _, _ -> },
            loadSports = {},
            refreshLeagueStandingsAfterSchedule = refreshLeagueStandingsAfterSchedule,
            setError = { message -> errors += message },
        )
    }
}

private class HandlerEventRepository(
    private val editorSessions: ArrayDeque<EventEditorSession>,
    private val saveOutcomes: ArrayDeque<EventEditorSaveOutcome>,
    private val proposalResponses: ArrayDeque<EventEditorMaintenanceResponseDto>,
    private val proposalFailures: ArrayDeque<Throwable> = ArrayDeque(),
    private val batchFailures: ArrayDeque<Throwable> = ArrayDeque(),
) : IEventRepository by CreateEvent_FakeEventRepository() {
    val editorRequests = mutableListOf<String>()
    val saveCommands = mutableListOf<com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto>()
    val maintenanceRequests = mutableListOf<EventEditorMaintenanceRequestDto>()
    val acceptanceRequests = mutableListOf<EventEditorAcceptMaintenanceProposalDto>()
    val rejectionRequests = mutableListOf<EventEditorRejectMaintenanceProposalDto>()
    val eventBatchRequests = mutableListOf<List<String>>()
    val acceptedSyncRequests = mutableListOf<EventEditorMaintenanceAcceptedResultDto>()
    var acceptMaintenanceFailure: Throwable? = null
    var acceptMaintenanceResult: EventEditorMaintenanceAcceptedResultDto? = null
    var rejectMaintenanceFailure: Throwable? = null
    var rejectMaintenanceResult: EventEditorMaintenanceRejectedResultDto? = null
    var batchEvents: List<Event> = emptyList()
    var refreshEditorGate: CompletableDeferred<Unit>? = null

    override suspend fun getEventEditor(eventId: String): Result<EventEditorSession> {
        editorRequests += eventId
        val session = editorSessions.removeFirst()
        if (editorRequests.size > 1) {
            refreshEditorGate?.await()
        }
        return Result.success(session)
    }

    override suspend fun saveEventEditor(
        eventId: String,
        command: com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto,
    ): Result<EventEditorSaveOutcome> {
        saveCommands += command
        return Result.success(saveOutcomes.removeFirst())
    }
    override suspend fun proposeEventScheduleMaintenance(
        request: EventEditorMaintenanceRequestDto,
    ): Result<EventEditorMaintenanceResponseDto> {
        maintenanceRequests += request
        if (proposalFailures.isNotEmpty()) {
            return Result.failure(proposalFailures.removeFirst())
        }
        return Result.success(proposalResponses.removeFirst())
    }

    override suspend fun acceptEventScheduleMaintenance(
        request: EventEditorAcceptMaintenanceProposalDto,
    ): Result<EventEditorMaintenanceAcceptedResultDto> {
        acceptanceRequests += request
        return acceptMaintenanceFailure?.let { failure -> Result.failure(failure) }
            ?: acceptMaintenanceResult?.let { result -> Result.success(result) }
            ?: Result.failure(IllegalStateException("unused"))
    }
    override suspend fun syncAcceptedEventScheduleMaintenance(
        result: EventEditorMaintenanceAcceptedResultDto,
    ): Result<Unit> {
        acceptedSyncRequests += result
        return Result.success(Unit)
    }
    override suspend fun rejectEventScheduleMaintenance(
        request: EventEditorRejectMaintenanceProposalDto,
    ): Result<EventEditorMaintenanceRejectedResultDto> {
        rejectionRequests += request
        return rejectMaintenanceFailure?.let { failure -> Result.failure(failure) }
            ?: rejectMaintenanceResult?.let { result -> Result.success(result) }
            ?: Result.failure(IllegalStateException("unused"))
    }

    override suspend fun getEvent(eventId: String): Result<Event> =
        Result.failure(IllegalStateException("singular event refresh should not be used"))
    override suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>> {
        eventBatchRequests += eventIds
        if (batchFailures.isNotEmpty()) {
            return Result.failure(batchFailures.removeFirst())
        }
        return Result.success(batchEvents)
    }

    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> = Result.success(newEvent)
}

private class HandlerMatchRepository : IMatchRepository by CreateEvent_FakeMatchRepository() {
    val batchRequests = mutableListOf<List<String>>()
    val singularRequests = mutableListOf<String>()

    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>> {
        singularRequests += tournamentId
        return Result.failure(IllegalStateException("singular match refresh should not be used"))
    }

    override suspend fun getMatchesByEventIds(
        eventIds: List<String>,
        fieldIds: List<String>?,
        rangeStart: kotlin.time.Instant?,
        rangeEnd: kotlin.time.Instant?,
    ): Result<List<MatchMVP>> {
        batchRequests += eventIds
        return Result.success(emptyList())
    }
}

private fun testEvent(): Event = Event(
    id = "event-1",
    name = "Maintenance event",
    eventType = EventType.LEAGUE,
    isAutomatedScheduling = true,
    state = "PUBLISHED",
    start = kotlin.time.Instant.parse("2030-06-01T15:00:00Z"),
    end = kotlin.time.Instant.parse("2030-06-01T19:00:00Z"),
)

private fun editorSession(
    event: Event,
    operations: List<EventEditorMaintenanceOperation>,
    editorRevision: String = "editor-revision",
    scheduleRevision: String = "schedule-revision",
): EventEditorSession {
    val createSession = createEventEditorSession(event = event)
    return EventEditorSessionMapper.fromEditSnapshot(
        createSession.snapshot.copy(
            mode = "EDIT",
            eventId = event.id,
            editorRevision = editorRevision,
            scheduleState = EventEditorScheduleStateDto(
                sourceType = "EVENT",
                matchCount = 1,
                revision = scheduleRevision,
                hasProtectedHistory = false,
                availableMaintenanceOperations = operations,
            ),
            revisionBinding = EventEditorRevisionBindingDto(
                editorRevision = editorRevision,
                staffRevision = null,
                scheduleRevision = scheduleRevision,
                availabilityRevision = "availability-revision",
            ),
        ),
    )
}

private fun saveOutcome(session: EventEditorSession): EventEditorSaveOutcome = EventEditorSaveOutcome(
    session = session,
    staffEmailDelivery = "NOT_REQUESTED",
    scheduleOutcome = com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeDto(
        status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
        matchCount = 0,
    ),
)

private fun staleMaintenanceFailure(): Throwable = com.razumly.mvp.core.data.repositories.EventEditorProposalStaleException(
    statusCode = 409,
    url = "http://example.test/api/events/event-1/schedule",
    payload = EventEditorErrorDto(
        error = "The schedule changed while you were editing.",
        code = "EDITOR_MAINTENANCE_STALE",
    ),
    responseBody = null,
)
private fun acceptanceConflictFailure(): Throwable =
    EventEditorMaintenanceAcceptanceConflictException(
        statusCode = 409,
        url = "http://example.test/api/events/event-1/schedule",
        payload = EventEditorErrorDto(
            error = "The proposal was already accepted by another acceptance operation.",
            code = "EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT",
        ),
        responseBody = null,
    )

private fun maintenanceProposal(
    operation: EventEditorMaintenanceOperation,
    operationId: String = "proposal-operation-1",
    proposalRevision: String = "proposal-revision-1",
): EventEditorMaintenanceProposalDto {
    val matches = listOf(
        com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto(
            id = "match-1",
            matchId = 1,
            eventId = "event-1",
            placementState = "PLACED",
            fieldId = "field-1",
        ),
    )
    return EventEditorMaintenanceProposalDto(
        status = EventEditorMaintenanceResponseStatus.PROPOSED,
        contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
        eventId = "event-1",
        operation = operation,
        operationId = operationId,
        proposalRevision = proposalRevision,
        revisionBinding = EventEditorRevisionBindingDto(
            editorRevision = "editor-revision",
            scheduleRevision = "schedule-revision",
            availabilityRevision = "availability-revision",
        ),
        graph = EventEditorMaintenanceGraphDto(
            event = EventApiDto(
                id = "event-1",
                eventType = "LEAGUE",
                teams = listOf(
                    TeamApiDto(
                        id = "generated-placeholder",
                        name = "Generated placeholder",
                    ),
                ),
            ),
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

private fun acceptedMaintenanceResult(
    proposal: EventEditorMaintenanceProposalDto,
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
    scheduleOutcome = proposal.scheduleOutcome,
    acceptanceOperationId = "acceptance-operation-1",
)
