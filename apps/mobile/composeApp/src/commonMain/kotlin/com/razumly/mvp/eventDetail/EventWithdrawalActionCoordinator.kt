package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantRefundMode
import com.razumly.mvp.core.network.userMessage

internal enum class EventWithdrawalExecutionAction {
    REQUEST_REFUND,
    WITHDRAW_AND_REFUND,
    LEAVE,
}

internal sealed class EventWithdrawalExecutionResult {
    data object Success : EventWithdrawalExecutionResult()
    data class Rejected(val message: String) : EventWithdrawalExecutionResult()
    data class Failed(val message: String) : EventWithdrawalExecutionResult()
}

internal class EventWithdrawalActionCoordinator(
    private val registrationFlowCoordinator: EventRegistrationFlowCoordinator,
) {
    suspend fun runWithdrawalAction(
        action: EventWithdrawalExecutionAction,
        event: Event,
        targetUserId: String?,
        currentUserId: String,
        selectedWeeklyOccurrence: EventOccurrenceSelection?,
        isWeeklyParentEvent: Boolean,
        currentUserIsFreeAgent: Boolean,
        eventOrOccurrenceStarted: Boolean,
        refundReason: String = "",
        resolveMembership: (String) -> WithdrawTargetMembership?,
        usersTeam: () -> TeamWithPlayers?,
        removeTeamFromEvent: suspend (
            event: Event,
            team: TeamWithPlayers,
            refundMode: EventParticipantRefundMode?,
            refundReason: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        removeCurrentUserFromEvent: suspend (
            event: Event,
            targetUserId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        leaveAndRefundEvent: suspend (
            event: Event,
            reason: String,
            targetUserId: String?,
        ) -> Result<Unit>,
        refreshAfterSuccess: suspend (eventId: String, warningMessage: String) -> Unit,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
    ): EventWithdrawalExecutionResult {
        val weeklyOccurrence = if (isWeeklyParentEvent) {
            selectedWeeklyOccurrence ?: return EventWithdrawalExecutionResult.Rejected(
                action.weeklyOccurrenceRequiredMessage,
            )
        } else {
            null
        }
        val normalizedTargetUserId = registrationFlowCoordinator.normalizedWithdrawalTargetUserId(
            targetUserId = targetUserId,
            currentUserId = currentUserId,
        )
        val membership = resolveMembership(normalizedTargetUserId)
        val decision = registrationFlowCoordinator.prepareWithdrawalAction(
            event = event,
            action = action.toWithdrawalActionKind(),
            targetUserId = normalizedTargetUserId,
            currentUserId = currentUserId,
            membership = membership,
            weeklyOccurrence = weeklyOccurrence,
            currentUserIsFreeAgent = currentUserIsFreeAgent,
            eventOrOccurrenceStarted = eventOrOccurrenceStarted,
        )
        decision.errorMessage?.let { message ->
            return EventWithdrawalExecutionResult.Rejected(message)
        }

        return runCatching {
            val result = executeWithdrawalAction(
                action = action,
                event = event,
                decision = decision,
                weeklyOccurrence = weeklyOccurrence,
                refundReason = refundReason,
                usersTeam = usersTeam,
                removeTeamFromEvent = removeTeamFromEvent,
                removeCurrentUserFromEvent = removeCurrentUserFromEvent,
                leaveAndRefundEvent = leaveAndRefundEvent,
                showLoading = showLoading,
            )

            val failure = result.exceptionOrNull()
            if (failure != null) {
                EventWithdrawalExecutionResult.Failed(failure.userMessage())
            } else {
                showLoading("Reloading Event")
                refreshAfterSuccess(event.id, action.refreshWarningMessage)
                EventWithdrawalExecutionResult.Success
            }
        }.getOrElse { throwable ->
            EventWithdrawalExecutionResult.Failed(throwable.userMessage())
        }.also {
            hideLoading()
        }
    }

    private suspend fun executeWithdrawalAction(
        action: EventWithdrawalExecutionAction,
        event: Event,
        decision: WithdrawalActionDecision,
        weeklyOccurrence: EventOccurrenceSelection?,
        refundReason: String,
        usersTeam: () -> TeamWithPlayers?,
        removeTeamFromEvent: suspend (
            event: Event,
            team: TeamWithPlayers,
            refundMode: EventParticipantRefundMode?,
            refundReason: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        removeCurrentUserFromEvent: suspend (
            event: Event,
            targetUserId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        leaveAndRefundEvent: suspend (
            event: Event,
            reason: String,
            targetUserId: String?,
        ) -> Result<Unit>,
        showLoading: (String) -> Unit,
    ): Result<Unit> {
        return when (action) {
            EventWithdrawalExecutionAction.REQUEST_REFUND -> {
                showLoading("Requesting Refund ...")
                if (decision.useTeamWithdrawal) {
                    removeTeamOrFail(
                        event = event,
                        usersTeam = usersTeam,
                        refundMode = EventParticipantRefundMode.REQUEST,
                        refundReason = refundReason,
                        occurrence = weeklyOccurrence,
                        removeTeamFromEvent = removeTeamFromEvent,
                    )
                } else {
                    leaveAndRefundEvent(event, refundReason, decision.targetUserId)
                }
            }

            EventWithdrawalExecutionAction.WITHDRAW_AND_REFUND -> {
                showLoading("Withdrawing and Refunding ...")
                if (decision.useTeamWithdrawal) {
                    removeTeamOrFail(
                        event = event,
                        usersTeam = usersTeam,
                        refundMode = EventParticipantRefundMode.AUTO,
                        refundReason = null,
                        occurrence = weeklyOccurrence,
                        removeTeamFromEvent = removeTeamFromEvent,
                    )
                } else {
                    leaveAndRefundEvent(event, "", decision.targetUserId)
                }
            }

            EventWithdrawalExecutionAction.LEAVE -> {
                executeLeaveAction(
                    event = event,
                    decision = decision,
                    weeklyOccurrence = weeklyOccurrence,
                    usersTeam = usersTeam,
                    removeTeamFromEvent = removeTeamFromEvent,
                    removeCurrentUserFromEvent = removeCurrentUserFromEvent,
                    showLoading = showLoading,
                )
            }
        }
    }

    private suspend fun executeLeaveAction(
        event: Event,
        decision: WithdrawalActionDecision,
        weeklyOccurrence: EventOccurrenceSelection?,
        usersTeam: () -> TeamWithPlayers?,
        removeTeamFromEvent: suspend (
            event: Event,
            team: TeamWithPlayers,
            refundMode: EventParticipantRefundMode?,
            refundReason: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        removeCurrentUserFromEvent: suspend (
            event: Event,
            targetUserId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        showLoading: (String) -> Unit,
    ): Result<Unit> {
        return when (decision.membership ?: return missingTeamRegistrationFailure()) {
            WithdrawTargetMembership.PARTICIPANT -> {
                if (decision.useTeamWithdrawal) {
                    showLoading("Team Leaving Event ...")
                    removeTeamOrFail(
                        event = event,
                        usersTeam = usersTeam,
                        refundMode = null,
                        refundReason = null,
                        occurrence = weeklyOccurrence,
                        removeTeamFromEvent = removeTeamFromEvent,
                    )
                } else {
                    showLoading("Leaving Event ...")
                    removeCurrentUserFromEvent(event, decision.targetUserId, weeklyOccurrence)
                }
            }

            WithdrawTargetMembership.WAITLIST,
            WithdrawTargetMembership.FREE_AGENT -> {
                showLoading("Leaving Event ...")
                removeCurrentUserFromEvent(event, decision.targetUserId, weeklyOccurrence)
            }
        }
    }

    private suspend fun removeTeamOrFail(
        event: Event,
        usersTeam: () -> TeamWithPlayers?,
        refundMode: EventParticipantRefundMode?,
        refundReason: String?,
        occurrence: EventOccurrenceSelection?,
        removeTeamFromEvent: suspend (
            event: Event,
            team: TeamWithPlayers,
            refundMode: EventParticipantRefundMode?,
            refundReason: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
    ): Result<Unit> {
        val team = usersTeam() ?: return missingTeamRegistrationFailure()
        return removeTeamFromEvent(
            event,
            team,
            refundMode,
            refundReason,
            occurrence,
        )
    }

    private fun missingTeamRegistrationFailure(): Result<Unit> =
        Result.failure(IllegalStateException("Unable to resolve your team registration."))
}

private fun EventWithdrawalExecutionAction.toWithdrawalActionKind(): WithdrawalActionKind =
    when (this) {
        EventWithdrawalExecutionAction.REQUEST_REFUND -> WithdrawalActionKind.REQUEST_REFUND
        EventWithdrawalExecutionAction.WITHDRAW_AND_REFUND -> WithdrawalActionKind.WITHDRAW_AND_REFUND
        EventWithdrawalExecutionAction.LEAVE -> WithdrawalActionKind.LEAVE
    }

private val EventWithdrawalExecutionAction.weeklyOccurrenceRequiredMessage: String
    get() = when (this) {
        EventWithdrawalExecutionAction.REQUEST_REFUND ->
            "Select an occurrence before requesting a refund."
        EventWithdrawalExecutionAction.WITHDRAW_AND_REFUND ->
            "Select an occurrence before refunding this registration."
        EventWithdrawalExecutionAction.LEAVE ->
            "Select an occurrence before leaving."
    }

private val EventWithdrawalExecutionAction.refreshWarningMessage: String
    get() = when (this) {
        EventWithdrawalExecutionAction.REQUEST_REFUND ->
            "Failed to refresh event after refund request."
        EventWithdrawalExecutionAction.WITHDRAW_AND_REFUND ->
            "Failed to refresh event after refund."
        EventWithdrawalExecutionAction.LEAVE ->
            "Failed to refresh event after leaving."
    }
