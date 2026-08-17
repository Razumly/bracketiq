package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier

data class PaymentPlanPreviewDialogState(
    val ownerLabel: String,
    val totalAmountCents: Int,
    val installmentAmounts: List<Int>,
    val installmentDueDates: List<String>,
    val installmentDueRelativeDays: List<Int> = emptyList(),
    val divisionLabel: String? = null,
)

internal data class EffectivePaymentPlan(
    val priceCents: Int?,
    val allowPaymentPlans: Boolean,
    val installmentAmounts: List<Int>,
    val installmentDueDates: List<String>,
    val installmentDueRelativeDays: List<Int>,
) {
    val configuredPriceCents: Int get() = priceCents ?: 0
}

internal fun buildPaymentPlanPreviewDialogState(
    event: Event,
    ownerLabel: String,
    forTeamJoin: Boolean,
    preferredDivisionId: String?,
    currentUserIsMinor: Boolean,
    isEventFull: Boolean,
): PaymentPlanPreviewDialogState? {
    if (currentUserIsMinor) return null
    val paymentPlan = resolveEffectivePaymentPlan(
        event = event,
        preferredDivisionId = preferredDivisionId,
    )
    val shouldPreview = if (forTeamJoin) {
        paymentPlan.allowPaymentPlans && paymentPlan.configuredPriceCents > 0 && !isEventFull
    } else {
        paymentPlan.allowPaymentPlans &&
            paymentPlan.configuredPriceCents > 0 &&
            !isEventFull &&
            !event.teamSignup
    }
    if (!shouldPreview) return null

    val divisionLabel = if (event.singleDivision) {
        null
    } else {
        resolveSelectedDivisionDetail(event, preferredDivisionId)
            ?.name
            ?.trim()
            ?.takeIf(String::isNotBlank)
    }

    return PaymentPlanPreviewDialogState(
        ownerLabel = ownerLabel,
        totalAmountCents = paymentPlan.configuredPriceCents,
        installmentAmounts = paymentPlan.installmentAmounts,
        installmentDueDates = paymentPlan.installmentDueDates,
        installmentDueRelativeDays = paymentPlan.installmentDueRelativeDays,
        divisionLabel = divisionLabel,
    )
}

internal fun resolveSelectedDivisionDetail(
    event: Event,
    preferredDivisionId: String?,
): DivisionDetail? {
    if (event.divisions.isEmpty()) {
        return null
    }
    val normalizedPreferredDivision = preferredDivisionId
        ?.normalizeDivisionIdentifier()
        ?.ifEmpty { null }
    val divisionDetails = mergeDivisionDetailsForDivisions(
        divisions = event.divisions,
        existingDetails = event.divisionDetails,
        eventId = event.id,
    )
    if (divisionDetails.isEmpty()) {
        return null
    }
    return if (!normalizedPreferredDivision.isNullOrBlank()) {
        divisionDetails.firstOrNull { detail ->
            detail.id.normalizeDivisionIdentifier() == normalizedPreferredDivision
        } ?: divisionDetails.firstOrNull()
    } else {
        divisionDetails.firstOrNull()
    }
}

internal fun resolveEffectivePaymentPlan(
    event: Event,
    preferredDivisionId: String?,
): EffectivePaymentPlan {
    val selectedDivision = resolveSelectedDivisionDetail(event, preferredDivisionId)
    val priceCents = event.resolvedDivisionPriceCents(preferredDivisionId)
    if (selectedDivision?.allowPaymentPlans != true) {
        return EffectivePaymentPlan(
            priceCents = priceCents,
            allowPaymentPlans = false,
            installmentAmounts = emptyList(),
            installmentDueDates = emptyList(),
            installmentDueRelativeDays = emptyList(),
        )
    }
    val useRelativeDueDates = event.eventType == EventType.WEEKLY_EVENT &&
        event.timeSlotIds.any { slotId -> slotId.isNotBlank() }

    return EffectivePaymentPlan(
        priceCents = priceCents,
        allowPaymentPlans = true,
        installmentAmounts = selectedDivision.installmentAmounts
            .takeIf { amounts -> amounts.isNotEmpty() }
            .orEmpty()
            .map { amount -> amount.coerceAtLeast(0) },
        installmentDueDates = if (!useRelativeDueDates) {
            val configuredDueDates = selectedDivision.installmentDueDates
                .takeIf { dueDates -> dueDates.isNotEmpty() }
                ?: emptyList()
            configuredDueDates
                .map { dueDate -> dueDate.trim() }
                .filter(String::isNotBlank)
        } else {
            emptyList()
        },
        installmentDueRelativeDays = if (useRelativeDueDates) {
            selectedDivision.installmentDueRelativeDays
                .takeIf { dueDays -> dueDays.isNotEmpty() }
                .orEmpty()
        } else {
            emptyList()
        },
    )
}
