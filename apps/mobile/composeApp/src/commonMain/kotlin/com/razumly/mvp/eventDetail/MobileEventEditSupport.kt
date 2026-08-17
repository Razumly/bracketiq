package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal enum class MobileEventEditUnsupportedFeature(val label: String) {
    SPLIT_LEAGUE_PLAYOFFS("split league/playoff divisions"),
    PAYMENT_PLANS("payment plans/installments"),
}

internal fun mobileEventEditUnsupportedFeatures(event: Event): List<MobileEventEditUnsupportedFeature> = buildList {
    if (event.hasSplitLeaguePlayoffDivisionsForMobile()) {
        add(MobileEventEditUnsupportedFeature.SPLIT_LEAGUE_PLAYOFFS)
    }
    if (event.hasPaymentPlanConfigurationForMobile()) {
        add(MobileEventEditUnsupportedFeature.PAYMENT_PLANS)
    }
}

internal fun mobileEventEditUnsupportedMessage(
    features: List<MobileEventEditUnsupportedFeature>,
): String {
    val reason = features.joinToReadableList { it.label }
    return "This event can't be edited on mobile because it uses $reason. Teams and matches can still be managed here."
}

internal fun canEditEventDetailsOnMobile(
    event: Event,
    isHost: Boolean,
    canManageTemplate: Boolean,
): Boolean {
    val hasRole = if (event.state.equals("TEMPLATE", ignoreCase = true)) {
        canManageTemplate
    } else {
        isHost
    }
    return hasRole && mobileEventEditUnsupportedFeatures(event).isEmpty()
}

private fun Event.hasSplitLeaguePlayoffDivisionsForMobile(): Boolean {
    if (eventType != EventType.LEAGUE || !includePlayoffs) return false
    return divisionDetails.any { detail ->
        detail.kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true
    }
}

private fun Event.hasPaymentPlanConfigurationForMobile(): Boolean =
    hasPaymentPlanConfiguration(
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentAmounts = installmentAmounts,
        installmentDueDates = installmentDueDates,
        installmentDueRelativeDays = installmentDueRelativeDays,
    ) || divisionDetails.any(DivisionDetail::hasPaymentPlanConfigurationForMobile)

private fun DivisionDetail.hasPaymentPlanConfigurationForMobile(): Boolean =
    hasPaymentPlanConfiguration(
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentAmounts = installmentAmounts,
        installmentDueDates = installmentDueDates,
        installmentDueRelativeDays = installmentDueRelativeDays,
    )

private fun hasPaymentPlanConfiguration(
    allowPaymentPlans: Boolean?,
    installmentCount: Int?,
    installmentAmounts: List<Int>,
    installmentDueDates: List<String>,
    installmentDueRelativeDays: List<Int>,
): Boolean =
    allowPaymentPlans == true ||
        (installmentCount ?: 0) > 0 ||
        installmentAmounts.isNotEmpty() ||
        installmentDueDates.any { it.isNotBlank() } ||
        installmentDueRelativeDays.isNotEmpty()

private fun <T> List<T>.joinToReadableList(label: (T) -> String): String =
    when (size) {
        0 -> "unsupported settings"
        1 -> label(first())
        2 -> "${label(this[0])} and ${label(this[1])}"
        else -> dropLast(1).joinToString(", ") { label(it) } + ", and ${label(last())}"
    }
