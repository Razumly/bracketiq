package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.CreateBillRequest
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection

internal class EventPaymentPlanBillingCoordinator {
    suspend fun createPaymentPlanBillForOwner(
        event: Event,
        ownerType: String,
        ownerId: String,
        allowSplit: Boolean,
        preferredDivisionId: String?,
        selectedWeeklyOccurrence: EventOccurrenceSelection?,
        createBill: suspend (CreateBillRequest) -> Result<Bill>,
    ): Result<PaymentPlanBillStatus> {
        val paymentPlan = resolveEffectivePaymentPlan(event, preferredDivisionId)
        val normalizedOwnerId = ownerId.trim()
        if (normalizedOwnerId.isEmpty()) {
            return Result.failure(IllegalArgumentException("Unable to start payment plan: owner id is missing."))
        }
        val priceCents = paymentPlan.priceCents
        if (priceCents == null) {
            return Result.failure(IllegalArgumentException("This division does not have a price set."))
        }
        if (priceCents <= 0) {
            return Result.failure(IllegalArgumentException("This division does not have a paid price set for a payment plan."))
        }

        val useRelativeDueDates = isWeeklyParentEvent(event)
        if (useRelativeDueDates && selectedWeeklyOccurrence == null) {
            return Result.failure(
                IllegalArgumentException("Select an occurrence before starting a weekly payment plan."),
            )
        }
        val installmentDueRelativeDays = if (useRelativeDueDates) {
            paymentPlan.installmentDueRelativeDays
        } else {
            emptyList()
        }
        if (useRelativeDueDates && installmentDueRelativeDays.size != paymentPlan.installmentAmounts.size) {
            return Result.failure(
                IllegalArgumentException("Weekly payment plans need a due offset for each installment."),
            )
        }

        return createBill(
            CreateBillRequest(
                ownerType = ownerType,
                ownerId = normalizedOwnerId,
                totalAmountCents = priceCents,
                eventId = event.id,
                slotId = selectedWeeklyOccurrence?.slotId,
                occurrenceDate = selectedWeeklyOccurrence?.occurrenceDate,
                organizationId = event.organizationId,
                installmentAmounts = paymentPlan.installmentAmounts,
                installmentDueDates = if (useRelativeDueDates) {
                    emptyList()
                } else {
                    paymentPlan.installmentDueDates
                        .mapNotNull { dueDate -> dueDate.trim().takeIf(String::isNotBlank) }
                },
                installmentDueRelativeDays = installmentDueRelativeDays,
                allowSplit = allowSplit,
                paymentPlanEnabled = true,
            ),
        ).fold(
            onSuccess = { Result.success(PaymentPlanBillStatus.CREATED) },
            onFailure = { throwable ->
                if (throwable.isDuplicatePaymentPlanError()) {
                    Result.success(PaymentPlanBillStatus.ALREADY_EXISTS)
                } else {
                    Result.failure(throwable)
                }
            },
        )
    }

    suspend fun rollbackUserJoinAfterBillingFailure(
        event: Event,
        currentUserId: String,
        occurrence: EventOccurrenceSelection?,
        removeCurrentUserFromEvent: suspend (
            event: Event,
            targetUserId: String?,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        logWarning: (String, Throwable) -> Unit,
    ) {
        removeCurrentUserFromEvent(
            event,
            currentUserId,
            occurrence,
        ).onFailure { throwable ->
            logWarning("Failed to rollback user join after payment plan billing error.", throwable)
        }
    }

    suspend fun rollbackTeamJoinAfterBillingFailure(
        event: Event,
        team: TeamWithPlayers,
        occurrence: EventOccurrenceSelection?,
        removeTeamFromEvent: suspend (
            event: Event,
            team: TeamWithPlayers,
            occurrence: EventOccurrenceSelection?,
        ) -> Result<Unit>,
        logWarning: (String, Throwable) -> Unit,
    ) {
        removeTeamFromEvent(
            event,
            team,
            occurrence,
        ).onFailure { throwable ->
            logWarning("Failed to rollback team join after payment plan billing error.", throwable)
        }
    }
}
