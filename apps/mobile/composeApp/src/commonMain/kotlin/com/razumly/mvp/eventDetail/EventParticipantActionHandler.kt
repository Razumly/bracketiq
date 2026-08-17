package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.presentation.INavigationHandler
import com.razumly.mvp.core.util.LoadingHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

internal class EventParticipantActionHandler(
    private val scope: CoroutineScope,
    private val participantManagementCoordinator: EventParticipantManagementCoordinator,
    private val participantBootstrapCoordinator: EventParticipantBootstrapCoordinator,
    private val eventRepository: IEventRepository,
    private val billingRepository: IBillingRepository,
    private val navigationHandler: INavigationHandler,
    private val loadingHandler: () -> LoadingHandler,
    private val selectedEvent: () -> Event,
    private val selectedDivision: (String) -> Unit,
    private val requireSelectedWeeklyOccurrence: (Event, String) -> EventOccurrenceSelection?,
    private val setMessage: (String) -> Unit,
) {
    fun createNewTeam() {
        val event = selectedEvent()
        navigationHandler.navigateToTeams(
            freeAgents = event.freeAgents,
            eventId = event.id,
            selectedFreeAgentId = null,
        )
    }

    fun inviteFreeAgentToTeam(userId: String) {
        val normalizedUserId = userId.trim().takeIf(String::isNotBlank) ?: return
        val event = selectedEvent()
        navigationHandler.navigateToTeams(
            freeAgents = event.freeAgents,
            eventId = event.id,
            selectedFreeAgentId = normalizedUserId,
        )
    }

    fun startManagingParticipants() {
        val event = selectedEvent()
        if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(
                event,
                "Select an occurrence before managing participants.",
            )
        }
    }

    fun moveTeamParticipantDivision(team: TeamWithPlayers, divisionId: String) {
        scope.launch {
            val event = selectedEvent()
            val occurrence = selectedOccurrenceOrNull(
                event = event,
                errorMessage = "Select an occurrence before moving teams.",
            ) ?: if (isWeeklyParentEvent(event)) return@launch else null
            val loadingOperation = loadingHandler().newOperation()
            applyParticipantMutationResult(
                participantManagementCoordinator.moveTeamParticipantDivision(
                    event = event,
                    team = team,
                    divisionId = divisionId,
                    occurrence = occurrence,
                    moveTeamDivision = { targetEvent, targetTeam, targetDivisionId, selectedOccurrence ->
                        eventRepository.moveTeamParticipantDivision(
                            event = targetEvent,
                            team = targetTeam,
                            preferredDivisionId = targetDivisionId,
                            occurrence = selectedOccurrence,
                        )
                    },
                    applySuccessfulMove = { result, normalizedDivisionId ->
                        participantBootstrapCoordinator.applyParticipantSyncResult(result)
                        selectedDivision(normalizedDivisionId)
                        participantBootstrapCoordinator.refreshSelectedWeeklyOccurrenceSummaryIfNeeded(result.event)
                        participantBootstrapCoordinator.refreshParticipantManagementSnapshotIfNeeded(result.event)
                        participantBootstrapCoordinator.refreshParticipantComplianceIfNeeded(result.event)
                    },
                    showLoading = loadingOperation::showLoading,
                    hideLoading = loadingOperation::hideLoading,
                ),
            )
        }
    }

    fun removeTeamParticipant(team: TeamWithPlayers) {
        scope.launch {
            val event = selectedEvent()
            val occurrence = selectedOccurrenceOrNull(
                event = event,
                errorMessage = "Select an occurrence before removing participants.",
            ) ?: if (isWeeklyParentEvent(event)) return@launch else null
            val loadingOperation = loadingHandler().newOperation()
            applyParticipantMutationResult(
                participantManagementCoordinator.removeTeamParticipant(
                    event = event,
                    team = team,
                    occurrence = occurrence,
                    removeTeam = { targetEvent, targetTeam, selectedOccurrence ->
                        eventRepository.removeTeamFromEvent(
                            targetEvent,
                            targetTeam,
                            occurrence = selectedOccurrence,
                        )
                    },
                    refreshAfterSuccess = participantBootstrapCoordinator::refreshEventAfterParticipantMutation,
                    showLoading = loadingOperation::showLoading,
                    hideLoading = loadingOperation::hideLoading,
                ),
            )
        }
    }

    fun removeUserParticipant(userId: String) {
        scope.launch {
            val event = selectedEvent()
            val occurrence = selectedOccurrenceOrNull(
                event = event,
                errorMessage = "Select an occurrence before removing participants.",
            ) ?: if (isWeeklyParentEvent(event)) return@launch else null
            val loadingOperation = loadingHandler().newOperation()
            applyParticipantMutationResult(
                participantManagementCoordinator.removeUserParticipant(
                    event = event,
                    userId = userId,
                    occurrence = occurrence,
                    removeUser = { targetEvent, targetUserId, selectedOccurrence ->
                        eventRepository.removeCurrentUserFromEvent(
                            targetEvent,
                            targetUserId = targetUserId,
                            occurrence = selectedOccurrence,
                        )
                    },
                    refreshAfterSuccess = participantBootstrapCoordinator::refreshEventAfterParticipantMutation,
                    showLoading = loadingOperation::showLoading,
                    hideLoading = loadingOperation::hideLoading,
                ),
            )
        }
    }

    suspend fun getParticipantBillingSnapshot(teamId: String): Result<EventTeamBillingSnapshot> {
        return participantManagementCoordinator.getParticipantBillingSnapshot(
            eventId = selectedEvent().id,
            teamId = teamId,
            loadSnapshot = billingRepository::getEventTeamBillingSnapshot,
        )
    }

    suspend fun createParticipantBill(
        teamId: String,
        request: EventTeamBillCreateRequest,
    ): Result<Unit> {
        return participantManagementCoordinator.createParticipantBill(
            eventId = selectedEvent().id,
            teamId = teamId,
            request = request,
            createBill = billingRepository::createEventTeamBill,
            refreshAfterSuccess = {
                participantBootstrapCoordinator.refreshParticipantComplianceIfNeeded(selectedEvent())
            },
        )
    }

    suspend fun createParticipantPaymentCheckout(
        teamId: String,
        request: EventTeamPaymentCheckoutRequest,
    ): Result<EventTeamPaymentCheckout> {
        return participantManagementCoordinator.createParticipantPaymentCheckout(
            eventId = selectedEvent().id,
            teamId = teamId,
            request = request,
            createCheckout = billingRepository::createEventTeamPaymentCheckout,
        )
    }

    suspend fun refundParticipantPayment(
        teamId: String,
        billPaymentId: String,
        amountCents: Int,
    ): Result<Unit> {
        return participantManagementCoordinator.refundParticipantPayment(
            eventId = selectedEvent().id,
            teamId = teamId,
            billPaymentId = billPaymentId,
            amountCents = amountCents,
            refundPayment = billingRepository::refundEventTeamBillPayment,
            refreshAfterSuccess = {
                participantBootstrapCoordinator.refreshParticipantComplianceIfNeeded(selectedEvent())
            },
        )
    }

    suspend fun reviewParticipantManualPaymentProof(
        billId: String,
        billPaymentId: String,
        proofId: String,
        decision: String,
        amountAcceptedCents: Int?,
        reviewNote: String?,
    ): Result<Unit> {
        return billingRepository.reviewManualPaymentProof(
            billId = billId,
            billPaymentId = billPaymentId,
            proofId = proofId,
            decision = decision,
            amountAcceptedCents = amountAcceptedCents,
            reviewNote = reviewNote,
        ).mapCatching {
            participantBootstrapCoordinator.refreshParticipantComplianceIfNeeded(selectedEvent())
        }
    }

    private fun selectedOccurrenceOrNull(event: Event, errorMessage: String): EventOccurrenceSelection? {
        return if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(event, errorMessage)
        } else {
            null
        }
    }

    private fun applyParticipantMutationResult(result: ParticipantMutationResult) {
        val message = when (result) {
            ParticipantMutationResult.NoOp -> null
            is ParticipantMutationResult.Success -> result.message
            is ParticipantMutationResult.Rejected -> result.message
            is ParticipantMutationResult.Failed -> result.message
        } ?: return
        setMessage(message)
    }
}
