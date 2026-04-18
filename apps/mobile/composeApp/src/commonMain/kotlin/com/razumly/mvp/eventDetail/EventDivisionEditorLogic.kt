package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_AGE_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION
import com.razumly.mvp.core.data.util.DEFAULT_DIVISION_OPTIONS
import com.razumly.mvp.core.data.util.buildEventDivisionId
import com.razumly.mvp.core.data.util.buildGenderSkillAgeDivisionToken
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
    val maxParticipants: Int = 2,
    val playoffTeamCount: Int? = null,
    val allowPaymentPlans: Boolean = false,
    val installmentCount: Int = 0,
    val installmentDueDates: List<String> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
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

internal val DIVISION_GENDER_OPTIONS = listOf(
    DropdownOption(value = "M", label = "Men"),
    DropdownOption(value = "F", label = "Women"),
    DropdownOption(value = "C", label = "Coed"),
)

internal fun defaultDivisionEditorState(
    defaultPriceCents: Int,
    defaultMaxParticipants: Int,
    defaultPlayoffTeamCount: Int?,
    defaultAllowPaymentPlans: Boolean,
    defaultInstallmentCount: Int?,
    defaultInstallmentDueDates: List<String>,
    defaultInstallmentAmounts: List<Int>,
): DivisionEditorState {
    val fallbackMax = defaultMaxParticipants.coerceAtLeast(2)
    val fallbackPlayoff = defaultPlayoffTeamCount?.coerceAtLeast(2)
    val normalizedInstallmentAmounts = defaultInstallmentAmounts.map { amount ->
        amount.coerceAtLeast(0)
    }
    val normalizedInstallmentDueDates = defaultInstallmentDueDates
        .map { dueDate -> dueDate.trim() }
        .filter(String::isNotBlank)
    val normalizedInstallmentCount = maxOf(
        defaultInstallmentCount ?: 0,
        normalizedInstallmentAmounts.size,
        normalizedInstallmentDueDates.size,
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
        allowPaymentPlans = normalizedAllowPaymentPlans,
        installmentCount = if (normalizedAllowPaymentPlans) normalizedInstallmentCount else 0,
        installmentDueDates = if (normalizedAllowPaymentPlans) normalizedInstallmentDueDates else emptyList(),
        installmentAmounts = if (normalizedAllowPaymentPlans) normalizedInstallmentAmounts else emptyList(),
        nameTouched = false,
        error = null,
    )
}

internal fun buildSkillDivisionTypeOptions(
    existingDetails: List<DivisionDetail>,
): List<DropdownOption> {
    val options = linkedMapOf<String, String>()
    fun addOption(divisionTypeId: String, label: String? = null) {
        val normalizedId = divisionTypeId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank()) return
        options[normalizedId] = label?.trim().takeIf { !it.isNullOrBlank() }
            ?: normalizedId.toDivisionDisplayLabel()
    }

    DEFAULT_DIVISION_OPTIONS.forEach { divisionTypeId ->
        addOption(divisionTypeId)
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
): List<DropdownOption> {
    val options = linkedMapOf<String, String>()
    fun addOption(divisionTypeId: String, label: String? = null) {
        val normalizedId = divisionTypeId.normalizeDivisionIdentifier()
        if (normalizedId.isBlank()) return
        options[normalizedId] = label?.trim().takeIf { !it.isNullOrBlank() }
            ?: normalizedId.toDivisionDisplayLabel()
    }

    DEFAULT_AGE_DIVISION_OPTIONS.forEach { divisionTypeId ->
        addOption(divisionTypeId)
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
        if (resolvedName.isNotBlank()) {
            return resolvedName
        }
    }

    fallbackOptions.firstOrNull { option ->
        option.value.normalizeDivisionIdentifier() == normalizedDivisionTypeId
    }?.label?.takeIf { it.isNotBlank() }?.let { return it }

    return normalizedDivisionTypeId.toDivisionDisplayLabel(existingDetails)
}

internal fun parseDivisionToken(detail: DivisionDetail): ParsedDivisionToken {
    val tokenFromDetail = detail.key.normalizeDivisionIdentifier().ifBlank {
        detail.id.extractDivisionTokenFromId().orEmpty()
    }
    val combinedMatch = COMBINED_DIVISION_TOKEN_PATTERN.matchEntire(tokenFromDetail)
    if (combinedMatch != null) {
        return ParsedDivisionToken(
            gender = combinedMatch.groupValues[1].uppercase(),
            skillDivisionTypeId = combinedMatch.groupValues[2].normalizeDivisionIdentifier()
                .ifBlank { DEFAULT_DIVISION },
            ageDivisionTypeId = combinedMatch.groupValues[3].normalizeDivisionIdentifier()
                .ifBlank { DEFAULT_AGE_DIVISION },
        )
    }
    val legacyMatch = DIVISION_TOKEN_PATTERN.matchEntire(tokenFromDetail)
    if (legacyMatch != null) {
        val normalizedLegacyDivisionTypeId = legacyMatch.groupValues[3]
            .normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_DIVISION }
        val legacyRatingType = legacyMatch.groupValues[2].uppercase()
        return ParsedDivisionToken(
            gender = legacyMatch.groupValues[1].uppercase(),
            skillDivisionTypeId = if (legacyRatingType == "SKILL") {
                normalizedLegacyDivisionTypeId
            } else {
                DEFAULT_DIVISION
            },
            ageDivisionTypeId = if (legacyRatingType == "AGE") {
                normalizedLegacyDivisionTypeId
            } else {
                DEFAULT_AGE_DIVISION
            },
        )
    }
    val normalizedDetail = detail.normalizeDivisionDetail()
    val fallbackGender = normalizedDetail.gender.trim().uppercase().ifBlank { "C" }
    return ParsedDivisionToken(
        gender = fallbackGender,
        skillDivisionTypeId = normalizedDetail.skillDivisionTypeId.normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_DIVISION },
        ageDivisionTypeId = normalizedDetail.ageDivisionTypeId.normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_AGE_DIVISION },
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
    val normalizedSkillDivisionTypeName = skillDivisionTypeName.trim().ifBlank {
        DEFAULT_DIVISION.toDivisionDisplayLabel()
    }
    val normalizedAgeDivisionTypeName = ageDivisionTypeName.trim().ifBlank {
        DEFAULT_AGE_DIVISION.toDivisionDisplayLabel()
    }
    return when (gender.trim().uppercase()) {
        "M" -> "Men's $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
        "F" -> "Women's $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
        else -> "Coed $normalizedSkillDivisionTypeName $normalizedAgeDivisionTypeName"
    }
}
