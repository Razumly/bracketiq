package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameterOption
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.toDropdownOptions
import com.razumly.mvp.core.data.util.buildEventDivisionId
import com.razumly.mvp.core.data.util.buildGenderSkillAgeDivisionToken
import com.razumly.mvp.core.data.util.divisionsEquivalent
import com.razumly.mvp.core.data.util.extractDivisionTokenFromId
import com.razumly.mvp.core.data.util.normalizeDivisionDetail
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.data.util.toDivisionDisplayLabel
import com.razumly.mvp.core.presentation.composables.DropdownOption
internal data class DivisionEditorState(
    val editingId: String? = null,
    val gender: String = "",
    val skillDivisionTypeId: String = "",
    val skillDivisionTypeName: String = "",
    val ageDivisionTypeId: String = "",
    val ageDivisionTypeName: String = "",
    val name: String = "",
    val priceCents: Int = 0,
    val maxParticipants: Int? = 2,
    val playoffTeamCount: Int? = null,
    val poolCount: Int? = null,
    val allowPaymentPlans: Boolean = false,
    val installmentCount: Int = 0,
    val installmentDueDates: List<String> = emptyList(),
    val installmentDueRelativeDays: List<Int> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
    val leagueConfig: LeagueConfig = LeagueConfig(),
    val playoffConfig: TournamentConfig = TournamentConfig(),
    val nameTouched: Boolean = false,
    val error: String? = null,
)

internal data class ParsedDivisionToken(
    val gender: String,
    val skillDivisionTypeId: String,
    val ageDivisionTypeId: String,
)

internal val DIVISION_TOKEN_PATTERN = Regex("^([mfc])_(age|skill)_(.+)$")
internal val COMBINED_DIVISION_TOKEN_PATTERN = Regex("^([mfc])_skill_(.+)_age_(.+)$")
internal val DIVISION_NAME_WHITESPACE_PATTERN = Regex("\\s+")
private val DIVISION_COMPONENT_PLUS_TOKEN_PATTERN = Regex("^(\\d+)plus$")
private val DIVISION_COMPONENT_LEADING_U_TOKEN_PATTERN = Regex("^u(\\d+)$")
private val DIVISION_COMPONENT_TRAILING_U_TOKEN_PATTERN = Regex("^(\\d+)u$")

internal fun defaultDivisionEditorState(
    defaultPriceCents: Int,
    defaultMaxParticipants: Int,
    defaultPlayoffTeamCount: Int?,
    defaultPoolCount: Int? = null,
    defaultAllowPaymentPlans: Boolean,
    defaultInstallmentCount: Int?,
    defaultInstallmentDueDates: List<String>,
    defaultInstallmentDueRelativeDays: List<Int> = emptyList(),
    defaultInstallmentAmounts: List<Int>,
    defaultLeagueConfig: LeagueConfig = LeagueConfig(),
    defaultPlayoffConfig: TournamentConfig = TournamentConfig(),
): DivisionEditorState {
    val fallbackMax = defaultMaxParticipants.takeIf { value -> value >= 2 }
    val fallbackPlayoff = defaultPlayoffTeamCount?.coerceAtLeast(2)
    val fallbackPoolCount = defaultPoolCount?.takeIf { value -> value >= 1 }
    val normalizedInstallmentAmounts = defaultInstallmentAmounts.map { amount ->
        amount.coerceAtLeast(0)
    }
    val normalizedInstallmentDueDates = defaultInstallmentDueDates
        .map { dueDate -> dueDate.trim() }
        .filter(String::isNotBlank)
    val normalizedInstallmentDueRelativeDays = defaultInstallmentDueRelativeDays
    val normalizedInstallmentCount = maxOf(
        defaultInstallmentCount ?: 0,
        normalizedInstallmentAmounts.size,
        normalizedInstallmentDueDates.size,
        normalizedInstallmentDueRelativeDays.size,
    ).takeIf { count -> count > 0 } ?: 0
    val normalizedAllowPaymentPlans = defaultAllowPaymentPlans &&
        normalizedInstallmentCount > 0 &&
        defaultPriceCents.coerceAtLeast(0) > 0
    return DivisionEditorState(
        editingId = null,
        gender = "",
        skillDivisionTypeId = "",
        skillDivisionTypeName = "",
        ageDivisionTypeId = "",
        ageDivisionTypeName = "",
        name = "",
        priceCents = defaultPriceCents.coerceAtLeast(0),
        maxParticipants = fallbackMax,
        playoffTeamCount = fallbackPlayoff,
        poolCount = fallbackPoolCount,
        allowPaymentPlans = normalizedAllowPaymentPlans,
        installmentCount = if (normalizedAllowPaymentPlans) normalizedInstallmentCount else 0,
        installmentDueDates = if (normalizedAllowPaymentPlans) normalizedInstallmentDueDates else emptyList(),
        installmentDueRelativeDays = if (normalizedAllowPaymentPlans) {
            normalizedInstallmentDueRelativeDays
        } else {
            emptyList()
        },
        installmentAmounts = if (normalizedAllowPaymentPlans) normalizedInstallmentAmounts else emptyList(),
        leagueConfig = defaultLeagueConfig,
        playoffConfig = defaultPlayoffConfig,
        nameTouched = false,
        error = null,
    )
}

internal fun divisionDefaultsFromSavedEditor(editor: DivisionEditorState): DivisionEditorState {
    return editor.copy(
        editingId = null,
        gender = "",
        skillDivisionTypeId = "",
        skillDivisionTypeName = "",
        ageDivisionTypeId = "",
        ageDivisionTypeName = "",
        name = "",
        nameTouched = false,
        error = null,
    )
}

internal fun buildDivisionDropdownOptions(
    existingDetails: List<DivisionDetail>,
    selectedDivisionIds: List<String>,
): List<DropdownOption> {
    val options = linkedMapOf<String, DropdownOption>()
    val seenLabels = mutableSetOf<String>()

    fun canonicalDivisionId(rawDivisionId: String): String {
        val normalized = rawDivisionId.normalizeDivisionIdentifier()
        if (normalized.isBlank()) return ""
        val matchingDetail = existingDetails.firstOrNull { detail ->
            divisionsEquivalent(detail.id, normalized) || divisionsEquivalent(detail.key, normalized)
        }
        return matchingDetail
            ?.id
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: normalized
    }

    fun addOption(rawDivisionId: String, rawLabel: String? = null) {
        val normalizedId = canonicalDivisionId(rawDivisionId)
        if (normalizedId.isBlank() || options.containsKey(normalizedId)) return
        val label = rawLabel
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: normalizedId.toDivisionDisplayLabel(existingDetails)
        val labelKey = label.normalizeDivisionNameKey()
        if (!seenLabels.add(labelKey)) return
        options[normalizedId] = DropdownOption(value = normalizedId, label = label)
    }

    existingDetails.forEach { detail ->
        addOption(
            rawDivisionId = detail.id.ifBlank { detail.key },
            rawLabel = detail.name,
        )
    }
    selectedDivisionIds.forEach { divisionId ->
        addOption(rawDivisionId = divisionId)
    }

    return options.values.toList()
}

internal fun buildSkillDivisionTypeOptions(
    existingDetails: List<DivisionDetail>,
    skillDivisionTypes: List<DivisionTypeParameterOption> = emptyList(),
): List<DropdownOption> {
    val options = linkedMapOf<String, String>()
    fun addOption(divisionTypeId: String, label: String? = null) {
        val normalizedId = divisionTypeId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank()) return
        options[normalizedId] = sanitizeDivisionComponentLabel(
            divisionTypeId = normalizedId,
            label = label,
        )
    }

    skillDivisionTypes.toDropdownOptions().forEach { option ->
        addOption(
            divisionTypeId = option.value,
            label = option.label,
        )
    }
    existingDetails.forEach { detail ->
        val normalizedDetail = detail.normalizeDivisionDetail()
        addOption(
            divisionTypeId = normalizedDetail.skillDivisionTypeId,
            label = normalizedDetail.skillDivisionTypeName,
        )
    }
    return options.map { (value, label) ->
        DropdownOption(value = value, label = label)
    }
}

internal fun buildAgeDivisionTypeOptions(
    existingDetails: List<DivisionDetail>,
    ageDivisionTypes: List<DivisionTypeParameterOption> = emptyList(),
): List<DropdownOption> {
    val options = linkedMapOf<String, String>()
    fun addOption(divisionTypeId: String, label: String? = null) {
        val normalizedId = divisionTypeId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank()) return
        options[normalizedId] = sanitizeDivisionComponentLabel(
            divisionTypeId = normalizedId,
            label = label,
        )
    }

    ageDivisionTypes.toDropdownOptions().forEach { option ->
        addOption(
            divisionTypeId = option.value,
            label = option.label,
        )
    }
    existingDetails.forEach { detail ->
        val normalizedDetail = detail.normalizeDivisionDetail()
        addOption(
            divisionTypeId = normalizedDetail.ageDivisionTypeId,
            label = normalizedDetail.ageDivisionTypeName,
        )
    }
    return options.map { (value, label) ->
        DropdownOption(value = value, label = label)
    }
}

internal fun buildGenderOptions(
    existingDetails: List<DivisionDetail>,
    genderTypes: List<DivisionTypeParameterOption> = emptyList(),
): List<DropdownOption> {
    val options = linkedMapOf<String, String>()
    fun addOption(gender: String?, label: String? = null) {
        val normalizedGender = gender?.trim()?.uppercase().orEmpty()
        if (normalizedGender.isBlank()) return
        options[normalizedGender] = label?.trim()?.takeIf(String::isNotBlank)
            ?: normalizedGender.toGenderDisplayLabel()
    }

    genderTypes.toDropdownOptions().forEach { option ->
        addOption(option.value, option.label)
    }
    existingDetails.forEach { detail ->
        addOption(detail.gender)
    }
    return options.map { (value, label) ->
        DropdownOption(value = value, label = label)
    }
}

internal fun resolveDivisionTypeName(
    divisionTypeId: String,
    existingDetails: List<DivisionDetail>,
    fallbackOptions: List<DropdownOption>,
): String {
    val normalizedDivisionTypeId = divisionTypeId.normalizeDivisionIdentifier()
    if (normalizedDivisionTypeId.isBlank()) return ""
    existingDetails.firstOrNull { detail ->
        val normalizedDetail = detail.normalizeDivisionDetail()
        normalizedDetail.skillDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId ||
            normalizedDetail.ageDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId ||
            normalizedDetail.divisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId
    }?.let { matchedDetail ->
        val normalizedDetail = matchedDetail.normalizeDivisionDetail()
        val resolvedName = when {
            normalizedDetail.skillDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId -> {
                normalizedDetail.skillDivisionTypeName
            }
            normalizedDetail.ageDivisionTypeId.normalizeDivisionIdentifier() == normalizedDivisionTypeId -> {
                normalizedDetail.ageDivisionTypeName
            }
            else -> normalizedDetail.divisionTypeName
        }.trim()
        val sanitizedName = sanitizeDivisionComponentLabel(
            divisionTypeId = normalizedDivisionTypeId,
            label = resolvedName,
        )
        if (sanitizedName.isNotBlank()) {
            return sanitizedName
        }
    }

    fallbackOptions.firstOrNull { option ->
        option.value.normalizeDivisionIdentifier() == normalizedDivisionTypeId
    }?.label?.takeIf { it.isNotBlank() }?.let { return it }

    return normalizedDivisionTypeId.toDivisionComponentDisplayLabel()
}

private fun sanitizeDivisionComponentLabel(
    divisionTypeId: String,
    label: String?,
): String {
    val normalizedId = divisionTypeId.normalizeDivisionIdentifier()
    val fallbackLabel = normalizedId.toDivisionComponentDisplayLabel()
    val trimmedLabel = label?.trim().orEmpty()
    if (trimmedLabel.isBlank()) return fallbackLabel
    val normalizedLabel = trimmedLabel
        .replace(DIVISION_NAME_WHITESPACE_PATTERN, " ")
        .lowercase()
    val hasGenderPrefix = listOf(
        "coed ",
        "co-ed ",
        "men ",
        "mens ",
        "men's ",
        "women ",
        "womens ",
        "women's ",
    ).any(normalizedLabel::startsWith)
    val hasEmbeddedFallbackInLongLabel =
        normalizedLabel.contains(" ") && normalizedLabel.contains(fallbackLabel.lowercase())
    if (hasGenderPrefix || hasEmbeddedFallbackInLongLabel) {
        return fallbackLabel
    }
    return trimmedLabel
}

private fun String.toGenderDisplayLabel(): String = when (uppercase()) {
    "M" -> "Men"
    "F" -> "Women"
    "C" -> "Coed"
    else -> this
}

private fun String.toDivisionComponentDisplayLabel(): String {
    val normalized = normalizeDivisionIdentifier()
    if (normalized.isBlank()) return ""
    return when (normalized) {
        "a", "aa", "b", "bb", "c" -> normalized.uppercase()
        "open" -> "Open"
        "beginner" -> "Beginner"
        "intermediate" -> "Intermediate"
        "advanced" -> "Advanced"
        "expert" -> "Expert"
        else -> {
            DIVISION_COMPONENT_PLUS_TOKEN_PATTERN.matchEntire(normalized)?.let { match ->
                return "${match.groupValues[1]}+"
            }
            DIVISION_COMPONENT_LEADING_U_TOKEN_PATTERN.matchEntire(normalized)?.let { match ->
                return "U${match.groupValues[1]}"
            }
            DIVISION_COMPONENT_TRAILING_U_TOKEN_PATTERN.matchEntire(normalized)?.let { match ->
                return "U${match.groupValues[1]}"
            }
            normalized.replaceFirstChar { char ->
                if (char.isLowerCase()) char.uppercaseChar() else char
            }
        }
    }
}

internal fun parseDivisionToken(detail: DivisionDetail): ParsedDivisionToken {
    val tokenFromDetail = detail.key.normalizeDivisionIdentifier().ifBlank {
        detail.id.extractDivisionTokenFromId().orEmpty()
    }
    val combinedMatch = COMBINED_DIVISION_TOKEN_PATTERN.matchEntire(tokenFromDetail)
    if (combinedMatch != null) {
        return ParsedDivisionToken(
            gender = combinedMatch.groupValues[1].uppercase(),
            skillDivisionTypeId = combinedMatch.groupValues[2].normalizeDivisionIdentifier(),
            ageDivisionTypeId = combinedMatch.groupValues[3].normalizeDivisionIdentifier(),
        )
    }
    val legacyMatch = DIVISION_TOKEN_PATTERN.matchEntire(tokenFromDetail)
    if (legacyMatch != null) {
        val normalizedLegacyDivisionTypeId = legacyMatch.groupValues[3]
            .normalizeDivisionIdentifier()
        val legacyRatingType = legacyMatch.groupValues[2].uppercase()
        return ParsedDivisionToken(
            gender = legacyMatch.groupValues[1].uppercase(),
            skillDivisionTypeId = if (legacyRatingType == "SKILL") {
                normalizedLegacyDivisionTypeId
            } else {
                ""
            },
            ageDivisionTypeId = if (legacyRatingType == "AGE") {
                normalizedLegacyDivisionTypeId
            } else {
                ""
            },
        )
    }
    val normalizedDetail = detail.normalizeDivisionDetail()
    return ParsedDivisionToken(
        gender = normalizedDetail.gender.trim().uppercase(),
        skillDivisionTypeId = normalizedDetail.skillDivisionTypeId.normalizeDivisionIdentifier(),
        ageDivisionTypeId = normalizedDetail.ageDivisionTypeId.normalizeDivisionIdentifier(),
    )
}

internal fun buildUniqueDivisionIdForToken(
    eventId: String,
    divisionToken: String,
    existingDivisionIds: List<String>,
): String {
    val usedDivisionIds = existingDivisionIds
        .map { divisionId -> divisionId.normalizeDivisionIdentifier() }
        .filter(String::isNotBlank)
        .toSet()

    var suffix = 1
    while (true) {
        val scopedEventId = if (suffix == 1) eventId else "${eventId}_$suffix"
        val candidate = buildEventDivisionId(scopedEventId, divisionToken)
            .normalizeDivisionIdentifier()
        if (!usedDivisionIds.contains(candidate)) {
            return candidate
        }
        suffix += 1
    }
}

internal fun divisionRecordMatchesSelection(
    detail: DivisionDetail,
    selection: String?,
): Boolean {
    if (selection.isNullOrBlank()) return false
    val normalizedSelection = selection.normalizeDivisionIdentifier()
    if (normalizedSelection.isBlank()) return false

    val normalizedId = detail.id.normalizeDivisionIdentifier()
    val normalizedKey = detail.key.normalizeDivisionIdentifier()
    if (normalizedId == normalizedSelection || normalizedKey == normalizedSelection) {
        return true
    }

    return normalizedKey.isBlank() && divisionsEquivalent(detail.id, normalizedSelection)
}

internal fun divisionIdentityToken(detail: DivisionDetail): String {
    val parsedToken = parseDivisionToken(detail)
    return buildDivisionToken(
        gender = parsedToken.gender,
        skillDivisionTypeId = parsedToken.skillDivisionTypeId,
        ageDivisionTypeId = parsedToken.ageDivisionTypeId,
    ).normalizeDivisionIdentifier()
}

internal fun findDuplicateDivisionIdentity(
    existingDetails: List<DivisionDetail>,
    divisionToken: String,
    editingId: String?,
): DivisionDetail? {
    val normalizedDivisionToken = divisionToken.normalizeDivisionIdentifier()
    if (normalizedDivisionToken.isBlank()) return null

    return existingDetails.firstOrNull { detail ->
        !divisionRecordMatchesSelection(detail, editingId) &&
            divisionIdentityToken(detail) == normalizedDivisionToken
    }
}

internal fun duplicateDivisionIdentityNames(details: List<DivisionDetail>): List<String> {
    val seenTokens = mutableSetOf<String>()
    val duplicateNames = linkedSetOf<String>()

    details.forEach { detail ->
        val token = divisionIdentityToken(detail)
        if (token.isBlank()) return@forEach
        if (!seenTokens.add(token)) {
            duplicateNames += detail.name.trim().ifBlank { detail.id }
        }
    }

    return duplicateNames.toList()
}

internal fun String.normalizeDivisionNameKey(): String {
    return trim()
        .lowercase()
        .replace(DIVISION_NAME_WHITESPACE_PATTERN, " ")
}

internal fun buildDivisionToken(
    gender: String,
    skillDivisionTypeId: String,
    ageDivisionTypeId: String,
): String {
    return buildGenderSkillAgeDivisionToken(
        gender = gender,
        skillDivisionTypeId = skillDivisionTypeId,
        ageDivisionTypeId = ageDivisionTypeId,
    )
}

internal fun buildDivisionName(
    gender: String,
    skillDivisionTypeName: String,
    ageDivisionTypeName: String,
): String {
    val normalizedSkillDivisionTypeName = skillDivisionTypeName.trim()
    val normalizedAgeDivisionTypeName = ageDivisionTypeName.trim()
    return when (gender.trim().uppercase()) {
        "M" -> "Men's $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
        "F" -> "Women's $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
        else -> "Coed $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
    }
}
