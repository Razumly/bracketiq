package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.util.divisionDisplayDetails
import com.razumly.mvp.core.data.util.divisionDisplayLabels
import com.razumly.mvp.core.data.util.extractDivisionTokenFromId
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

    val displayDetails = event.divisionDisplayDetails()
    if (displayDetails.size > 2) {
        return NativeEventCardMetadata(
            divisionLabel = buildEventDivisionRangeLabel(displayDetails),
            skillLevelLabel = null,
        )
    }

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

private data class EventDivisionAxes(
    val gender: String?,
    val ageId: String?,
    val ageLabel: String?,
    val skillId: String?,
    val skillLabel: String?,
)

private val dualAxisTokenRegex = Regex("^([mfc])_skill_(.+)_age_(.+)$", RegexOption.IGNORE_CASE)
private val singleAxisTokenRegex = Regex("^([mfc])_(age|skill)_(.+)$", RegexOption.IGNORE_CASE)
private val compactAgeTokenRegex = Regex("^[mfc]_(u\\d+|\\d+u|\\d+plus)$", RegexOption.IGNORE_CASE)
private val underAgeRegex = Regex("^(?:u(\\d+)|(\\d+)u)$", RegexOption.IGNORE_CASE)
private val plusAgeRegex = Regex("^(\\d+)(?:plus|\\+)$", RegexOption.IGNORE_CASE)
private val exactAgeLabelRegex = Regex("^(?:u?\\d+u?|\\d+\\+)$", RegexOption.IGNORE_CASE)
private val skillOrder = mapOf(
    "recreational" to 0,
    "rec" to 0,
    "beginner" to 1,
    "novice" to 1,
    "developmental" to 2,
    "local" to 3,
    "intermediate" to 4,
    "select" to 5,
    "competitive" to 6,
    "advanced" to 7,
    "premier" to 8,
    "elite" to 9,
    "national" to 10,
    "open" to 11,
)

private fun buildEventDivisionRangeLabel(details: List<DivisionDetail>): String {
    val axes = details.map(DivisionDetail::toEventDivisionAxes)
    val genders = axes.mapNotNull(EventDivisionAxes::gender).distinct()
    val ages = axes
        .mapNotNull { axis -> axis.ageId?.let { id -> id to (axis.ageLabel ?: compactAxisToken(id)) } }
        .distinctBy { (id, _) -> id.lowercase() }
        .sortedWith(compareBy<Pair<String, String>> { (id, _) -> ageOrder(id) }.thenBy { (_, label) -> label })
    val skills = axes
        .mapNotNull { axis -> axis.skillId?.let { id -> id to (axis.skillLabel ?: compactAxisToken(id)) } }
        .distinctBy { (id, _) -> id.lowercase() }
        .sortedWith(compareBy<Pair<String, String>> { (id, _) -> skillSortOrder(id) }.thenBy { (_, label) -> label })

    return buildList {
        formatGenderRange(genders)?.let(::add)
        formatAxisRange(ages)?.let(::add)
        formatAxisRange(skills)?.let(::add)
        add("${details.size} divisions")
    }.joinToString(" · ")
}

private fun DivisionDetail.toEventDivisionAxes(): EventDivisionAxes {
    val token = (key.ifBlank { id }).extractDivisionTokenFromId()
        ?: key.ifBlank { id }.trim().lowercase()
    val dualMatch = dualAxisTokenRegex.matchEntire(token)
    val singleMatch = singleAxisTokenRegex.matchEntire(token)
    val compactAgeMatch = compactAgeTokenRegex.matchEntire(token)
    val normalizedName = name.trim()
    val nameIsOnlyAge = exactAgeLabelRegex.matches(normalizedName)

    val tokenGender = dualMatch?.groupValues?.get(1)
        ?: singleMatch?.groupValues?.get(1)
        ?: compactAgeMatch?.value?.substringBefore('_')
    val resolvedGender = gender.trim().ifBlank { tokenGender.orEmpty() }
        .uppercase()
        .takeIf { value -> value in setOf("M", "F", "C") }

    val tokenAgeId = dualMatch?.groupValues?.get(3)
        ?: singleMatch?.takeIf { match -> match.groupValues[2].equals("age", ignoreCase = true) }
            ?.groupValues?.get(3)
        ?: compactAgeMatch?.groupValues?.get(1)
    val tokenSkillId = dualMatch?.groupValues?.get(2)
        ?: singleMatch?.takeIf { match -> match.groupValues[2].equals("skill", ignoreCase = true) }
            ?.groupValues?.get(3)
    val resolvedAgeId = tokenAgeId.orEmpty().ifBlank { ageDivisionTypeId.trim() }
        .ifBlank { normalizedName.takeIf { nameIsOnlyAge }.orEmpty() }
        .normalizeAxisId()
        .takeIf(String::isNotBlank)
    val resolvedSkillId = if (compactAgeMatch != null) {
        null
    } else {
        tokenSkillId.orEmpty().ifBlank { skillDivisionTypeId.trim() }
            .ifBlank { skillDivisionTypeName.trim() }
            .normalizeAxisId()
            .takeIf { value ->
                value.isNotBlank() &&
                    !(nameIsOnlyAge && tokenSkillId == null && skillDivisionTypeId.isBlank() &&
                        skillDivisionTypeName.isBlank())
            }
    }

    return EventDivisionAxes(
        gender = resolvedGender,
        ageId = resolvedAgeId,
        ageLabel = ageDivisionTypeName.trim().takeIf(String::isNotBlank)
            ?: normalizedName.takeIf { nameIsOnlyAge },
        skillId = resolvedSkillId,
        skillLabel = skillDivisionTypeName.trim().takeIf(String::isNotBlank),
    )
}

private fun String.normalizeAxisId(): String = trim().lowercase().replace(" ", "_")

private fun compactAxisToken(value: String): String {
    val normalized = value.normalizeAxisId()
    underAgeRegex.matchEntire(normalized)?.let { match ->
        return "U${match.groupValues[1].ifBlank { match.groupValues[2] }}"
    }
    plusAgeRegex.matchEntire(normalized)?.let { match -> return "${match.groupValues[1]}+" }
    if (normalized == "recreational" || normalized == "rec") return "Rec"
    return normalized
        .replace('_', ' ')
        .split(' ')
        .filter(String::isNotBlank)
        .joinToString(" ") { word ->
            when {
                word.matches(Regex("^[a-z]\\d+$")) -> word.uppercase()
                word.length <= 2 -> word.uppercase()
                else -> word.replaceFirstChar { char -> char.uppercaseChar() }
            }
        }
}

private fun ageOrder(value: String): Int {
    val normalized = value.normalizeAxisId()
    return underAgeRegex.matchEntire(normalized)
        ?.let { match -> match.groupValues[1].ifBlank { match.groupValues[2] }.toIntOrNull() }
        ?: plusAgeRegex.matchEntire(normalized)?.groupValues?.get(1)?.toIntOrNull()
        ?: Int.MAX_VALUE
}

private fun skillSortOrder(value: String): Int {
    val normalized = value.normalizeAxisId()
    skillOrder[normalized]?.let { return it }
    Regex("^[a-z]+(\\d+)$").matchEntire(normalized)?.groupValues?.get(1)?.toIntOrNull()?.let { return 100 + it }
    return 1_000
}

private fun formatGenderRange(genders: List<String>): String? {
    val labels = listOf("M" to "Men", "F" to "Women", "C" to "Coed")
        .filter { (id, _) -> id in genders }
        .map { (_, label) -> label }
    return labels.takeIf(List<String>::isNotEmpty)?.joinToString("/")
}

private fun formatAxisRange(values: List<Pair<String, String>>): String? = when (values.size) {
    0 -> null
    1 -> compactAxisToken(values.single().second)
    else -> "${compactAxisToken(values.first().second)}–${compactAxisToken(values.last().second)}"
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
