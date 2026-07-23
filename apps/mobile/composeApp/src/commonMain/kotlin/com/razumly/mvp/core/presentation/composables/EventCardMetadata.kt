package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.util.divisionDisplayLabels
import com.razumly.mvp.core.data.util.findDivisionDetailByIdentifier

data class NativeEventCardMetadata(
    val divisionLabel: String,
    val skillLevelLabel: String?,
)

fun buildNativeEventCardMetadata(event: Event): NativeEventCardMetadata {
    val divisionLabels = event
        .divisionDisplayLabels()
        .map(String::removeStandaloneSkillWordForCard)
        .filter(String::isNotBlank)

    val skillLevelLabels = event.divisions
        .mapNotNull { divisionId ->
            event.divisionDetails
                .findDivisionDetailByIdentifier(divisionId)
                ?.skillDivisionTypeName
                ?.trim()
                ?.takeIf(String::isNotBlank)
        }
        .distinctBy(String::lowercase)

    return NativeEventCardMetadata(
        divisionLabel = compactEventCardMetadataLabel(
            singularPrefix = "Division",
            pluralPrefix = "Divisions",
            values = divisionLabels,
            emptyLabel = "Division: TBD",
        ) ?: "Division: TBD",
        skillLevelLabel = compactEventCardMetadataLabel(
            singularPrefix = "Skill",
            pluralPrefix = "Skills",
            values = skillLevelLabels,
            emptyLabel = null,
        ),
    )
}

internal fun compactEventCardMetadataLabel(
    singularPrefix: String,
    pluralPrefix: String,
    values: List<String>,
    emptyLabel: String?,
    visibleValueLimit: Int = 2,
): String? {
    val distinctValues = values
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinctBy(String::lowercase)
    if (distinctValues.isEmpty()) return emptyLabel

    val prefix = if (distinctValues.size == 1) singularPrefix else pluralPrefix
    val visibleValues = distinctValues.take(visibleValueLimit)
    val remainingCount = distinctValues.size - visibleValues.size
    val suffix = if (remainingCount > 0) " +$remainingCount" else ""
    return "$prefix: ${visibleValues.joinToString()}$suffix"
}

private val standaloneSkillWordForCardRegex = Regex("\\bskill\\b", RegexOption.IGNORE_CASE)
private val cardWhitespaceRegex = Regex("\\s+")

private fun String.removeStandaloneSkillWordForCard(): String =
    replace(standaloneSkillWordForCardRegex, " ")
        .replace(cardWhitespaceRegex, " ")
        .trim()
