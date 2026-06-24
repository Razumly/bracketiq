package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel

internal const val AllPoolsDivisionOptionId = "__all_pools__"

internal data class BracketDivisionOption(
    val id: String,
    val label: String,
)

internal data class SelectedDivisionPillState(
    val selectedDivisionId: String?,
    val label: String,
    val options: List<BracketDivisionOption>,
)

internal data class SelectedDivisionSelectorState(
    val divisionState: SelectedDivisionPillState?,
    val poolState: SelectedDivisionPillState?,
)

internal fun List<BracketDivisionOption>.sortedAlphabetically(): List<BracketDivisionOption> =
    sortedWith(
        compareBy<BracketDivisionOption> { option -> option.label.trim().lowercase() }
            .thenBy { option -> option.id.trim().lowercase() },
    )

internal fun List<BracketDivisionOption>.distinctById(): List<BracketDivisionOption> =
    distinctBy { option -> option.id }
        .sortedAlphabetically()

internal fun List<BracketDivisionOption>.resolveSelectedDivisionId(preferredId: String?): String? {
    if (isEmpty()) return null
    val normalizedPreferred = preferredId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    return findBracketDivisionOption(normalizedPreferred)?.id
        ?: first().id
}

internal fun List<BracketDivisionOption>.findBracketDivisionOption(
    divisionId: String?,
): BracketDivisionOption? {
    val normalizedDivisionId = divisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedDivisionId.isBlank()) return null
    firstOrNull { option ->
        option.id.normalizeDivisionIdentifier() == normalizedDivisionId
    }?.let { option -> return option }
    return null
}

internal fun List<BracketDivisionOption>.resolveDivisionLabel(divisionId: String?): String? {
    val normalizedDivisionId = divisionId
        ?.normalizeDivisionIdentifier()
        .orEmpty()
    if (normalizedDivisionId.isBlank()) return null

    return findBracketDivisionOption(normalizedDivisionId)
        ?.label
        ?.takeIf(String::isNotBlank)
}

private fun List<BracketDivisionOption>.selectedDivisionLabel(
    divisionId: String?,
    divisionDetails: List<DivisionDetail>,
): String? =
    resolveDivisionLabel(divisionId)
        ?: divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?.toDivisionDisplayLabel(divisionDetails)

private fun List<BracketDivisionOption>.selectedDivisionIdOrRaw(divisionId: String?): String? {
    if (isEmpty()) {
        return divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
    }
    return resolveSelectedDivisionId(divisionId)
}

internal fun buildSelectedDivisionPillState(
    selectedDivisionId: String?,
    options: List<BracketDivisionOption>,
    divisionDetails: List<DivisionDetail>,
    singleDivision: Boolean,
): SelectedDivisionPillState? {
    if (singleDivision || options.size <= 1) return null
    val resolvedDivisionId = options.selectedDivisionIdOrRaw(selectedDivisionId)
    val label = options.selectedDivisionLabel(resolvedDivisionId, divisionDetails)
        ?: return null
    return SelectedDivisionPillState(
        selectedDivisionId = resolvedDivisionId,
        label = label,
        options = options,
    )
}

internal fun List<EventDetailDivisionOption>.toJoinDivisionOptions(): List<BracketDivisionOption> =
    map { option ->
        BracketDivisionOption(
            id = option.id,
            label = option.label,
        )
    }

internal fun List<EventDetailDivisionOption>.sortedEventDivisionOptionsAlphabetically(): List<EventDetailDivisionOption> =
    sortedWith(
        compareBy<EventDetailDivisionOption> { option -> option.label.trim().lowercase() }
            .thenBy { option -> option.id.trim().lowercase() },
    )
