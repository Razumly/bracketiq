package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.divisionPriceRange
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import com.razumly.mvp.core.data.dataTypes.usesManualRegistrationPayments

internal data class EventDetailWithdrawalPresentation(
    val platformRefundsAvailable: Boolean,
    val selectableWithdrawTargets: List<WithdrawTargetOption>,
    val refundableWithdrawTargets: List<WithdrawTargetOption>,
    val canRequestRefundAfterStart: Boolean,
    val actionWithdrawTargets: List<WithdrawTargetOption>,
    val canLeaveEvent: Boolean,
    val leaveOrRefundActionLabel: String,
)

internal fun buildEventDetailWithdrawalPresentation(
    event: Event,
    withdrawTargets: List<WithdrawTargetOption>,
    refundPolicy: EventRefundPolicy,
    hasAnyPaidDivision: Boolean,
    isUserInEvent: Boolean,
    isCaptain: Boolean,
    isFreeAgent: Boolean,
    isWaitListed: Boolean,
): EventDetailWithdrawalPresentation {
    val teamSignup = event.teamSignup
    val canLeaveSelf = isUserInEvent && (!teamSignup || isCaptain || isFreeAgent || isWaitListed)
    val platformRefundsAvailable = hasAnyPaidDivision && !event.usesManualRegistrationPayments()
    val selectableWithdrawTargets = withdrawTargets.filter { target ->
        if (!target.isSelf) return@filter true
        when (target.membership) {
            WithdrawTargetMembership.PARTICIPANT -> !teamSignup || isCaptain
            WithdrawTargetMembership.WAITLIST -> true
            WithdrawTargetMembership.FREE_AGENT -> true
        }
    }
    val refundableWithdrawTargets = if (!platformRefundsAvailable) {
        emptyList()
    } else {
        withdrawTargets.filter { it.membership == WithdrawTargetMembership.PARTICIPANT }
    }
    val canRequestRefundAfterStart = refundPolicy.eventHasStarted && refundableWithdrawTargets.isNotEmpty()
    val actionWithdrawTargets = if (canRequestRefundAfterStart) {
        refundableWithdrawTargets
    } else {
        selectableWithdrawTargets
    }
    val canLeaveEvent = !refundPolicy.eventHasStarted &&
        (canLeaveSelf || selectableWithdrawTargets.isNotEmpty())
    val singleWithdrawTarget = selectableWithdrawTargets.singleOrNull()
    val leaveMessage = when {
        selectableWithdrawTargets.size > 1 -> "Withdraw Profile"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.FREE_AGENT -> "Leave as Free Agent"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.WAITLIST -> "Leave Waitlist"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT &&
            platformRefundsAvailable && refundPolicy.canAutoRefund -> "Withdraw and Get Refund"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT &&
            platformRefundsAvailable -> "Withdraw and Request Refund"
        singleWithdrawTarget?.membership == WithdrawTargetMembership.PARTICIPANT -> "Leave Event"
        isFreeAgent -> "Leave as Free Agent"
        isWaitListed -> "Leave Waitlist"
        platformRefundsAvailable && refundPolicy.canAutoRefund -> "Leave and Get Refund"
        platformRefundsAvailable -> "Leave and Request Refund"
        else -> "Leave Event"
    }
    val leaveOrRefundActionLabel = if (canRequestRefundAfterStart) {
        if (actionWithdrawTargets.size > 1) "Request Refunds" else "Request Refund"
    } else {
        leaveMessage
    }

    return EventDetailWithdrawalPresentation(
        platformRefundsAvailable = platformRefundsAvailable,
        selectableWithdrawTargets = selectableWithdrawTargets,
        refundableWithdrawTargets = refundableWithdrawTargets,
        canRequestRefundAfterStart = canRequestRefundAfterStart,
        actionWithdrawTargets = actionWithdrawTargets,
        canLeaveEvent = canLeaveEvent,
        leaveOrRefundActionLabel = leaveOrRefundActionLabel,
    )
}

internal data class EventDetailJoinPresentation(
    val priceCents: Int,
    val options: List<JoinOption>,
)

internal fun buildEventDetailJoinPresentation(
    event: Event,
    selectedDivision: String?,
    selectedJoinOptionDivisionId: String?,
    hasAnyPaidDivision: Boolean,
    tournamentPoolPlayEnabled: Boolean,
    isUserInEvent: Boolean,
    selectedWeeklyOccurrenceJoined: Boolean,
    isEventFull: Boolean,
    joinBlockedByStart: Boolean,
    isWeeklyParentEvent: Boolean,
    hasSelectedWeeklyOccurrence: Boolean,
    isAffiliateEvent: Boolean,
    isRegistrationPaymentFailed: Boolean,
    onJoinEvent: () -> Unit,
    onSelectTeam: (String?) -> Unit,
): EventDetailJoinPresentation {
    val preferredDivisionId = selectedJoinOptionDivisionId ?: if (tournamentPoolPlayEnabled) {
        event.resolveBracketDivisionForPool(selectedDivision) ?: selectedDivision
    } else {
        selectedDivision
    }
    val priceCents = when {
        !preferredDivisionId.isNullOrBlank() -> event.resolvedDivisionPriceCents(preferredDivisionId) ?: 0
        event.singleDivision -> event.resolvedDivisionPriceCents() ?: 0
        hasAnyPaidDivision -> event.divisionPriceRange().maxPriceCents
        else -> 0
    }
    val options = when {
        isAffiliateEvent -> listOf(
            JoinOption(
                label = "Register on website",
                requiresPayment = false,
                onClick = onJoinEvent,
            ),
        )

        joinBlockedByStart ||
            (isWeeklyParentEvent && (!hasSelectedWeeklyOccurrence || selectedWeeklyOccurrenceJoined)) ||
            (!isWeeklyParentEvent && isUserInEvent) -> emptyList()

        else -> buildList {
            if (isEventFull) {
                if (event.teamSignup) {
                    add(
                        JoinOption(
                            label = if (priceCents > 0) {
                                "Join Waitlist as Team (No Payment Yet)"
                            } else {
                                "Join Waitlist as Team"
                            },
                            requiresPayment = priceCents > 0,
                            onClick = { onSelectTeam(selectedJoinOptionDivisionId) },
                        ),
                    )
                } else {
                    add(
                        JoinOption(
                            label = if (priceCents > 0) "Join Waitlist (No Payment Yet)" else "Join Waitlist",
                            requiresPayment = priceCents > 0,
                            onClick = onJoinEvent,
                        ),
                    )
                }
            } else if (event.teamSignup) {
                add(
                    JoinOption(
                        label = "Join as Free Agent",
                        requiresPayment = false,
                        onClick = onJoinEvent,
                    ),
                )
                add(
                    JoinOption(
                        label = when {
                            priceCents <= 0 -> "Join as Team"
                            isRegistrationPaymentFailed -> "Complete payment"
                            else -> "Purchase Ticket for Team"
                        },
                        requiresPayment = priceCents > 0,
                        onClick = { onSelectTeam(selectedJoinOptionDivisionId) },
                    ),
                )
            } else {
                add(
                    JoinOption(
                        label = when {
                            priceCents <= 0 -> "Join Event"
                            isRegistrationPaymentFailed -> "Complete payment"
                            else -> "Purchase Ticket"
                        },
                        requiresPayment = priceCents > 0,
                        onClick = onJoinEvent,
                    ),
                )
            }
        }
    }

    return EventDetailJoinPresentation(
        priceCents = priceCents,
        options = options,
    )
}
