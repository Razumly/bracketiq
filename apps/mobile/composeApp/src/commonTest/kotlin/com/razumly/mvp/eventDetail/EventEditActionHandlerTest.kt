package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantsSyncResult
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
import kotlin.test.assertFalse

class EventEditActionHandlerTest {
    @Test
    fun given_open_editor_when_authority_is_invalidated_then_editing_and_pending_requests_close() = runTest {
        val event = testEvent()
        val session = editorSession(event, emptyList())
        val repository = HandlerEventRepository(ArrayDeque(listOf(session, session)), ArrayDeque(), ArrayDeque())
        val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
        val handler = createHandler(this, event, repository, mutableListOf(), draftCoordinator = draft)
        handler.startEditingEvent()
        advanceUntilIdle()
        assertTrue(draft.isEditing.value)
        handler.invalidateAuthority()
        assertFalse(draft.isEditing.value)
        val pending = CompletableDeferred<Unit>()
        repository.openEditorGate = pending
        handler.startEditingEvent()
        advanceUntilIdle()
        handler.invalidateAuthority()
        pending.complete(Unit)
        advanceUntilIdle()
        assertFalse(draft.isEditing.value)
        assertNull(handler.eventEditorSnapshot.value)
    }

    @Test
    fun given_pending_editor_when_viewer_changes_then_previous_viewer_cannot_open_it() = runTest {
        val event = testEvent()
        val repository = HandlerEventRepository(ArrayDeque(listOf(editorSession(event, emptyList()))), ArrayDeque(), ArrayDeque())
        val pending = CompletableDeferred<Unit>()
        repository.openEditorGate = pending
        var viewerId = "viewer"
        val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
        val handler = createHandler(this, event, repository, mutableListOf(), draftCoordinator = draft, currentUserId = { viewerId })
        handler.startEditingEvent()
        advanceUntilIdle()
        viewerId = "another-viewer"
        pending.complete(Unit)
        advanceUntilIdle()
        assertFalse(draft.isEditing.value)
    }

    @Test
    fun given_revoked_authority_when_opening_editor_then_fresh_denial_blocks_editing_and_explains_permission() = runTest {
        val event = testEvent()
        val permitted = editorSession(event, emptyList())
        val denied = EventEditorSessionMapper.fromEditSnapshot(permitted.snapshot.copy(
            capabilities = permitted.snapshot.capabilities.copy(canEdit = false, readOnly = true, readOnlyReason = "NOT_AUTHORIZED"),
        ))
        val repository = HandlerEventRepository(ArrayDeque(listOf(denied)), ArrayDeque(), ArrayDeque())
        val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
        val errors = mutableListOf<String>()
        createHandler(this, event, repository, errors, draftCoordinator = draft).startEditingEvent()
        advanceUntilIdle()
        assertEquals(false, draft.isEditing.value)
        assertEquals(listOf("Your account does not have permission to manage this Event."), errors)
        assertTrue(repository.saveCommands.isEmpty())
    }

    @Test
    fun given_authorized_split_playoffs_when_opening_editor_then_playoff_configuration_is_retained() = runTest {
        val event = testEvent().copy(includePlayoffs = true, splitLeaguePlayoffDivisions = true,
            divisionDetails = listOf(com.razumly.mvp.core.data.dataTypes.DivisionDetail(
                id = "playoff", kind = "PLAYOFF", maxParticipants = 4, playoffTeamCount = 4)))
        val session = editorSession(event, emptyList())
        val repository = HandlerEventRepository(ArrayDeque(listOf(session)), ArrayDeque(), ArrayDeque())
        val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
        val handler = createHandler(this, event, repository, mutableListOf(), draftCoordinator = draft)
        handler.startEditingEvent()
        advanceUntilIdle()
        assertTrue(draft.isEditing.value)
        assertEquals(session.canonicalState.event.divisionDetails, draft.editedEvent.value.divisionDetails)
    }

    @Test
    fun given_authorized_external_event_with_payment_plans_when_editing_destination_then_configuration_is_retained() = runTest {
        val event = testEvent().copy(
            affiliateUrl = "https://organizer.example/register",
            allowPaymentPlans = true, installmentCount = 2, installmentAmounts = listOf(2500, 2500),
        )
        val session = editorSession(event, emptyList())
        val repository = HandlerEventRepository(ArrayDeque(listOf(session)), ArrayDeque(), ArrayDeque())
        val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
        val errors = mutableListOf<String>()
        val handler = createHandler(this, event, repository, errors, draftCoordinator = draft)
        handler.startEditingEvent()
        advanceUntilIdle()
        assertTrue(draft.isEditing.value)
        val before = draft.editedEvent.value
        handler.editEventField { copy(affiliateUrl = "https://new-organizer.example/join") }
        assertEquals(before.copy(affiliateUrl = "https://new-organizer.example/join"), draft.editedEvent.value)
        assertTrue(errors.isEmpty())
    }

    @Test
    fun given_schedule_view_when_an_operation_is_selected_then_reviews_without_saving_event_settings() = runTest {
        for (operation in EventEditorMaintenanceOperation.entries) {
            val event = testEvent()
            val session = editorSession(event, listOf(operation))
            val proposal = maintenanceProposal(operation)
            val repository = HandlerEventRepository(
                editorSessions = ArrayDeque(listOf(session)),
                saveOutcomes = ArrayDeque(),
                proposalResponses = ArrayDeque(listOf(EventEditorMaintenanceResponseDto.Proposed(proposal))),
            )
            val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
            val handler = createHandler(this, event, repository, mutableListOf(), draftCoordinator = draft)

            handler.openScheduleMaintenance()
            advanceUntilIdle()
            assertEquals(listOf(operation), handler.scheduleMaintenanceOptions.value?.operations)
            handler.selectScheduleMaintenanceOperation(operation)
            advanceUntilIdle()

            assertEquals(proposal, handler.scheduleMaintenanceReview.value?.proposal)
            assertEquals(operation, repository.maintenanceRequests.single().operation)
            assertEquals(session.snapshot.revisionBinding, repository.maintenanceRequests.single().expectedRevisions)
            assertTrue(repository.saveCommands.isEmpty())
            assertEquals(false, draft.isEditing.value)
        }
    }

    @Test
    fun given_ineligible_schedule_snapshot_when_an_operation_is_requested_then_no_proposal_is_submitted() = runTest {
        val event = testEvent()
        val permitted = editorSession(event, listOf(EventEditorMaintenanceOperation.BUILD))
        val readOnly = EventEditorSessionMapper.fromEditSnapshot(permitted.snapshot.copy(
            capabilities = permitted.snapshot.capabilities.copy(canEdit = false),
        ))
        val sessions = listOf(
            readOnly,
            editorSession(event.copy(isAutomatedScheduling = false), listOf(EventEditorMaintenanceOperation.BUILD)),
            editorSession(event.copy(eventType = EventType.EVENT), listOf(EventEditorMaintenanceOperation.BUILD)),
            editorSession(event.copy(state = "TEMPLATE"), listOf(EventEditorMaintenanceOperation.BUILD)),
            editorSession(event.copy(id = "another-event"), listOf(EventEditorMaintenanceOperation.BUILD)),
            editorSession(event, emptyList()),
        )
        for (session in sessions) {
            val repository = HandlerEventRepository(ArrayDeque(listOf(session)), ArrayDeque(), ArrayDeque())
            val handler = createHandler(this, event, repository, mutableListOf())
            handler.openScheduleMaintenance()
            advanceUntilIdle()
            assertEquals(emptyList(), handler.scheduleMaintenanceOptions.value?.operations)
            assertNotNull(handler.scheduleMaintenanceOptions.value?.message)
            handler.selectScheduleMaintenanceOperation(EventEditorMaintenanceOperation.BUILD)
            advanceUntilIdle()
            assertTrue(repository.maintenanceRequests.isEmpty())
            assertTrue(repository.saveCommands.isEmpty())
            assertNull(handler.scheduleMaintenanceReview.value)
        }
    }

    @Test
    fun given_schedule_actions_loading_when_cancelled_then_a_late_response_does_not_reopen_them() = runTest {
        val event = testEvent()
        val session = editorSession(event, listOf(EventEditorMaintenanceOperation.COMPLETE))
        val gate = CompletableDeferred<Unit>()
        val repository = HandlerEventRepository(ArrayDeque(listOf(session, session)), ArrayDeque(), ArrayDeque())
        repository.refreshEditorGate = gate
        val handler = createHandler(this, event, repository, mutableListOf())
        handler.openScheduleMaintenance()
        advanceUntilIdle()
        handler.dismissScheduleMaintenanceOptions()
        handler.openScheduleMaintenance()
        advanceUntilIdle()
        assertEquals(true, handler.scheduleMaintenanceOptions.value?.isLoading)
        handler.dismissScheduleMaintenanceOptions()
        gate.complete(Unit)
        advanceUntilIdle()
        assertNull(handler.scheduleMaintenanceOptions.value)
        assertTrue(repository.maintenanceRequests.isEmpty())
    }

    @Test
    fun given_stale_schedule_proposal_when_retried_then_uses_fresh_server_revisions() = runTest {
        val event = testEvent()
        val original = editorSession(event, listOf(EventEditorMaintenanceOperation.COMPLETE))
        val fresh = editorSession(event, listOf(EventEditorMaintenanceOperation.COMPLETE),
            editorRevision = "fresh-editor", scheduleRevision = "fresh-schedule")
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(original, fresh)), saveOutcomes = ArrayDeque(),
            proposalResponses = ArrayDeque(listOf(EventEditorMaintenanceResponseDto.Proposed(
                maintenanceProposal(EventEditorMaintenanceOperation.COMPLETE),
            ))),
            proposalFailures = ArrayDeque(listOf(staleMaintenanceFailure())),
        )
        val handler = createHandler(this, event, repository, mutableListOf())
        handler.openScheduleMaintenance()
        advanceUntilIdle()
        handler.selectScheduleMaintenanceOperation(EventEditorMaintenanceOperation.COMPLETE)
        advanceUntilIdle()
        handler.requestFreshScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals(fresh.snapshot.revisionBinding, repository.maintenanceRequests.last().expectedRevisions)
        assertEquals(EventScheduleMaintenanceReviewPhase.PROPOSED, handler.scheduleMaintenanceReview.value?.phase)
        assertTrue(repository.saveCommands.isEmpty())
    }

    @Test
    fun given_partial_maintenance_when_accepting_then_confirmation_is_required_before_the_request() = runTest {
        val event = testEvent()
        val session = editorSession(event = event, operations = listOf(EventEditorMaintenanceOperation.REBUILD))
        val complete = maintenanceProposal(EventEditorMaintenanceOperation.REBUILD)
        val unplaced = complete.graph.matches.single().copy(
            placementState = "UNPLACED", fieldId = null, start = null, end = null,
            phase = "POOL", phaseDivisionId = "pool-a",
        )
        val proposal = complete.copy(
            graph = complete.graph.copy(matches = listOf(unplaced)),
            scheduleOutcome = complete.scheduleOutcome.copy(
                status = EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE,
                isComplete = false, placedMatchCount = 0, unplacedMatchCount = 1,
                matches = listOf(unplaced),
                unscheduledMatches = listOf(com.razumly.mvp.core.network.dto.EventEditorMaintenanceUnscheduledMatchDto(
                    id = unplaced.id, matchId = unplaced.matchId, phase = "POOL", phaseDivisionId = "pool-a",
                )),
                affectedCompetitionPhases = listOf(com.razumly.mvp.core.network.dto.EventEditorMaintenanceAffectedCompetitionPhaseDto(
                    id = "pool-a", name = "Pool A", phase = "POOL",
                )),
            ),
        )
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(session)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(session))),
            proposalResponses = ArrayDeque(listOf(EventEditorMaintenanceResponseDto.Proposed(proposal))),
        )
        repository.acceptMaintenanceResult = acceptedMaintenanceResult(proposal)
        repository.detailEvents = listOf(event)
        val handler = createHandler(this, event, repository, mutableListOf())
        handler.startEditingEvent()
        advanceUntilIdle()
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(EventScheduleMaintenanceReviewPhase.CONFIRMING_PARTIAL, handler.scheduleMaintenanceReview.value?.phase)
        assertTrue(repository.acceptanceRequests.isEmpty())
        handler.dismissScheduleMaintenanceReview()
        assertEquals(EventScheduleMaintenanceReviewPhase.PROPOSED, handler.scheduleMaintenanceReview.value?.phase)
        handler.acceptScheduleMaintenanceProposal()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(proposal.proposalRevision, repository.acceptanceRequests.single().proposalRevision)
        assertNull(handler.scheduleMaintenanceReview.value)
    }

    @Test
    fun given_offline_restore_when_back_is_selected_then_setup_remains_available_and_recovery_is_retained() = runTest {
        val event = testEvent()
        val session = editorSession(event = event, operations = listOf(EventEditorMaintenanceOperation.REBUILD))
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(session)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(session))),
            proposalResponses = ArrayDeque(listOf(EventEditorMaintenanceResponseDto.Proposed(
                maintenanceProposal(EventEditorMaintenanceOperation.REBUILD),
            ))),
            saveFailure = IllegalStateException("offline"),
        )
        val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
        val handler = createHandler(this, event, repository, mutableListOf(), draftCoordinator = draft)
        handler.startEditingEvent()
        advanceUntilIdle()
        handler.editEventField { copy(name = "Retained offline setup") }
        val setup = draft.editedEvent.value
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.dismissScheduleMaintenanceReview()
        advanceUntilIdle()

        assertEquals(false, handler.scheduleMaintenanceReview.value?.isVisible)
        assertEquals(EventScheduleMaintenanceReviewPhase.STALE, handler.scheduleMaintenanceReview.value?.phase)
        assertEquals(setup, draft.editedEvent.value)
        assertTrue(draft.isEditing.value)
        handler.cancelEditingEvent()
        assertTrue(draft.isEditing.value)
        assertEquals(setup, draft.editedEvent.value)
        assertEquals(true, handler.scheduleMaintenanceReview.value?.isVisible)
        handler.dismissScheduleMaintenanceReview()
        assertEquals(false, handler.scheduleMaintenanceReview.value?.isVisible)
        handler.rebuildWithoutPlaceholderTeams()
        assertEquals(true, handler.scheduleMaintenanceReview.value?.isVisible)
        assertEquals(1, repository.maintenanceRequests.size)
        assertTrue(repository.acceptanceRequests.isEmpty())
    }

    @Test
    fun given_edited_setup_when_proposal_is_dismissed_then_server_settings_restore_without_losing_the_draft() = runTest {
        val event = testEvent()
        val session = editorSession(event = event, operations = listOf(EventEditorMaintenanceOperation.REBUILD))
        val changedSession = editorSession(event = event.copy(name = "My revised setup"),
            operations = listOf(EventEditorMaintenanceOperation.REBUILD))
        val repository = HandlerEventRepository(
            editorSessions = ArrayDeque(listOf(session)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(changedSession), saveOutcome(session))),
            proposalResponses = ArrayDeque(listOf(EventEditorMaintenanceResponseDto.Proposed(
                maintenanceProposal(EventEditorMaintenanceOperation.REBUILD),
            ))),
        )
        val draft = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false)
        val handler = createHandler(this, event, repository, mutableListOf(), draftCoordinator = draft)
        handler.startEditingEvent()
        advanceUntilIdle()
        handler.editEventField { copy(name = "My revised setup") }
        val setup = draft.editedEvent.value
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.dismissScheduleMaintenanceReview()
        advanceUntilIdle()

        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(setup, draft.editedEvent.value)
        assertTrue(draft.isEditing.value)
        assertEquals(listOf("My revised setup", event.name), repository.saveCommands.map { it.draft.basics.name })
        assertEquals(listOf(false, false), repository.savePersistenceModes)
        assertTrue(repository.acceptanceRequests.isEmpty())
    }

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
        assertEquals(EventScheduleMaintenanceReviewPhase.FAILED, handler.scheduleMaintenanceReview.value?.phase)
        assertEquals("proposal transport failed", handler.scheduleMaintenanceReview.value?.message)
        handler.requestFreshScheduleMaintenanceProposal()
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
    fun given_event_restore_failure_after_stale_proposal_then_blocks_normal_retry() = runTest {
        val event = testEvent()
        val session = editorSession(
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
            editorSessions = ArrayDeque(listOf(session, freshSession)),
            saveOutcomes = ArrayDeque(listOf(saveOutcome(session), saveOutcome(freshSession))),
            proposalResponses = ArrayDeque(
                listOf(
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(
                            EventEditorMaintenanceOperation.REBUILD,
                            operationId = "proposal-operation-1",
                        ),
                    ),
                    EventEditorMaintenanceResponseDto.Proposed(
                        maintenanceProposal(
                            EventEditorMaintenanceOperation.REBUILD,
                            operationId = "proposal-operation-2",
                        ),
                    ),
                ),
            ),
            saveFailure = IllegalStateException("rollback transport failed"),
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
        handler.editEventField { copy(name = "Changed event") }
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        handler.acceptScheduleMaintenanceProposal()
        advanceUntilIdle()

        assertEquals(
            "The Event changes could not be restored. Refresh the editor before continuing.",
            errors.last(),
        )
        val errorCount = errors.size
        handler.rebuildWithoutPlaceholderTeams()
        advanceUntilIdle()
        assertEquals(1, repository.maintenanceRequests.size)
        assertEquals(errorCount + 1, errors.size)
        assertEquals(
            "The Event changes could not be restored. Refresh the editor before continuing.",
            errors.last(),
        )

        handler.requestFreshScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(2, repository.maintenanceRequests.size)
        assertEquals(
            EventScheduleMaintenanceReviewPhase.PROPOSED,
            handler.scheduleMaintenanceReview.value?.phase,
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
            originalReview.reviewedProposal.operationId,
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
            originalReview.reviewedProposal.operationId,
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
            saveOutcomes = ArrayDeque(
                listOf(
                    saveOutcome(initialSession),
                    saveOutcome(initialSession),
                    saveOutcome(freshSession),
                ),
            ),
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
        assertEquals("Old server value", repository.saveCommands[1].draft.basics.name)
        assertEquals("New server value", repository.saveCommands[2].draft.basics.name)
        assertEquals(3, repository.saveCommands.size)
        assertEquals(listOf(false, false, false), repository.savePersistenceModes)
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
    fun given_accepted_maintenance_when_refreshing_then_uses_atomic_detail_sync_before_exposing_success() = runTest {
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
        repository.detailEvents = listOf(event.copy(name = "Accepted fresh event"))
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

        assertEquals(listOf(event.id), repository.detailSyncRequests)
        assertTrue(repository.eventBatchRequests.isEmpty())
        assertTrue(matchRepository.batchRequests.isEmpty())
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
            detailSyncFailures = ArrayDeque(listOf(IllegalStateException("schedule sync failed"))),
        )
        repository.acceptMaintenanceResult = acceptedMaintenanceResult(proposal)
        repository.detailEvents = listOf(event)
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
        assertEquals(2, repository.detailSyncRequests.size)
        assertTrue(repository.acceptedSyncRequests.isEmpty())
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
        repository.detailEvents = listOf(event.copy(name = "Accepted server event"))
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
        assertTrue(repository.acceptedSyncRequests.isEmpty())
        assertEquals(listOf(event.id), repository.detailSyncRequests)
        assertTrue(repository.eventBatchRequests.isEmpty())
        assertTrue(matchRepository.batchRequests.isEmpty())
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
            detailSyncFailures = ArrayDeque(listOf(IllegalStateException("schedule sync failed"))),
        )
        repository.rejectMaintenanceFailure = acceptanceConflictFailure()
        repository.detailEvents = listOf(event.copy(name = "Accepted server event"))
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
        assertEquals(1, repository.detailSyncRequests.size)
        assertTrue(repository.acceptedSyncRequests.isEmpty())
        assertTrue(errors.last().contains("accepted by another client"))

        handler.rejectScheduleMaintenanceProposal()
        advanceUntilIdle()
        assertEquals(1, repository.rejectionRequests.size)

        handler.retryAcceptedScheduleSync()
        advanceUntilIdle()

        assertNull(handler.scheduleMaintenanceReview.value)
        assertEquals(2, repository.detailSyncRequests.size)
        assertEquals(2, repository.editorRequests.size)
        assertTrue(repository.acceptedSyncRequests.isEmpty())
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
            saveOutcomes = ArrayDeque(listOf(saveOutcome(editorSession(
                event = event.copy(eventType = EventType.TOURNAMENT),
                operations = emptyList(),
            )))),
            proposalResponses = ArrayDeque(),
        )
        val notices = mutableListOf<String>()
        val handler = createHandler(
            scope = this,
            event = event,
            repository = repository,
            errors = notices,
        )

        handler.startEditingEvent()
        advanceUntilIdle()
        handler.editEventField { copy(eventType = EventType.TOURNAMENT) }
        handler.updateEvent()

        val confirmation = assertNotNull(handler.eventTypeTransitionConfirmation.value)
        assertEquals("Change type", confirmation.actionLabel)
        assertTrue(confirmation.message.contains("preserves the current schedule"))
        assertTrue(confirmation.message.contains("has not been rebuilt and does not conform"))
        assertTrue(confirmation.message.contains("pool, playoff, scoring, and Match duration settings"))
        assertTrue(confirmation.message.contains("Use Rebuild Schedule"))
        assertEquals(emptyList(), repository.saveCommands)
        handler.dismissEventTypeTransitionConfirmation()
        assertEquals(emptyList(), repository.saveCommands)
        handler.updateEvent()
        handler.confirmEventTypeTransition()
        advanceUntilIdle()
        assertEquals(1, repository.saveCommands.size)
        assertTrue(notices.last().contains("has not been rebuilt and does not conform"))
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
                handlerRepository.detailEvents = listOf(event)
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
            assertTrue(repository.acceptedSyncRequests.isEmpty())
            assertEquals(1, repository.detailSyncRequests.size)
        }

    private fun createHandler(
        scope: CoroutineScope,
        event: Event,
        repository: HandlerEventRepository,
        errors: MutableList<String>,
        matchRepository: IMatchRepository = HandlerMatchRepository(),
        refreshLeagueStandingsAfterSchedule: suspend (Event) -> Unit = {},
        draftCoordinator: EventEditDraftCoordinator = EventEditDraftCoordinator(initialEvent = event, canEditInitial = false),
        currentUserId: () -> String = { "viewer" },
    ): EventEditActionHandler {
        val loadingHandler = CreateEvent_FakeLoadingHandler()
        return EventEditActionHandler(
            currentUserId = currentUserId,
            scope = scope,
            editActionCoordinator = EventEditActionCoordinator(),
            editDraftCoordinator = draftCoordinator,
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
    private val detailSyncFailures: ArrayDeque<Throwable> = ArrayDeque(),
    private val saveFailure: Throwable? = null,
) : IEventRepository by CreateEvent_FakeEventRepository() {
    val editorRequests = mutableListOf<String>()
    val saveCommands = mutableListOf<com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto>()
    val savePersistenceModes = mutableListOf<Boolean>()
    val maintenanceRequests = mutableListOf<EventEditorMaintenanceRequestDto>()
    val acceptanceRequests = mutableListOf<EventEditorAcceptMaintenanceProposalDto>()
    val rejectionRequests = mutableListOf<EventEditorRejectMaintenanceProposalDto>()
    val eventBatchRequests = mutableListOf<List<String>>()
    val detailSyncRequests = mutableListOf<String>()
    val acceptedSyncRequests = mutableListOf<EventEditorMaintenanceAcceptedResultDto>()
    var acceptMaintenanceFailure: Throwable? = null
    var acceptMaintenanceResult: EventEditorMaintenanceAcceptedResultDto? = null
    var rejectMaintenanceFailure: Throwable? = null
    var rejectMaintenanceResult: EventEditorMaintenanceRejectedResultDto? = null
    var detailEvents: List<Event> = emptyList()
    var refreshEditorGate: CompletableDeferred<Unit>? = null
    var openEditorGate: CompletableDeferred<Unit>? = null
    private var lastSaveOutcome: EventEditorSaveOutcome? = null

    override suspend fun getEventEditor(eventId: String): Result<EventEditorSession> {
        editorRequests += eventId
        val session = editorSessions.removeFirst()
        openEditorGate?.await()
        if (editorRequests.size > 1) {
            refreshEditorGate?.await()
        }
        return Result.success(session)
    }

    override suspend fun saveEventEditor(
        eventId: String,
        command: com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto,
        persistLocally: Boolean,
    ): Result<EventEditorSaveOutcome> {
        saveCommands += command
        savePersistenceModes += persistLocally
        if (saveFailure != null && saveCommands.size == 2) {
            return Result.failure(saveFailure)
        }
        val outcome = if (saveOutcomes.isNotEmpty()) {
            saveOutcomes.removeFirst()
        } else {
            lastSaveOutcome ?: error("missing test editor save outcome")
        }
        lastSaveOutcome = outcome
        return Result.success(outcome)
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
        if (detailSyncFailures.isNotEmpty()) {
            return Result.failure(detailSyncFailures.removeFirst())
        }
        return Result.success(detailEvents)
    }

    override suspend fun updateLocalEvent(newEvent: Event): Result<Event> = Result.success(newEvent)

    override suspend fun syncEventDetail(
        event: Event,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ): Result<EventDetailSyncResult> {
        assertNull(occurrence)
        assertTrue(manage)
        detailSyncRequests += event.id
        if (detailSyncFailures.isNotEmpty()) {
            return Result.failure(detailSyncFailures.removeFirst())
        }
        return Result.success(EventDetailSyncResult(
            participants = EventParticipantsSyncResult(detailEvents.single { it.id == event.id }),
        ))
    }
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
            capabilities = createSession.snapshot.capabilities.copy(viewerUserId = "viewer"),
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
