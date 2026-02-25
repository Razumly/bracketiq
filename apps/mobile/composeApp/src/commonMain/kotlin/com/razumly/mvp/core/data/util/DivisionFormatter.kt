package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.DivisionDetail

private val whitespaceRegex = "\\s+".toRegex()
private val delimiterRegex = "[\\s-]+".toRegex()
private val duplicateUnderscoreRegex = "_+".toRegex()
private val dualDivisionTokenRegex = Regex("^([mfc])_skill_(.+)_age_(.+)$")
private val divisionTokenRegex = Regex("^([mfc])_(age|skill)_(.+)$")
private val ageTokenRegex = Regex("^(u\\d+|\\d+u|\\d+plus)$")
private val decimalTokenRegex = Regex("^(\\d+)_(\\d+)$")
private val plusTokenRegex = Regex("^(\\d+)plus$")
private val trailingUTokenRegex = Regex("^(\\d+)u$")
private val leadingUTokenRegex = Regex("^u(\\d+)$")
private const val DIVISION_MARKER = "__division__"

const val DEFAULT_DIVISION = "open"
val DEFAULT_DIVISION_OPTIONS = listOf("beginner", "b", "bb", "a", "aa", "open")
const val DEFAULT_AGE_DIVISION = "18plus"
val DEFAULT_AGE_DIVISION_OPTIONS = listOf(
    "u6",
    "u7",
    "u8",
    "u9",
    "u10",
    "u11",
    "u12",
    "u13",
    "u14",
    "u15",
    "u16",
    "u17",
    "u18",
    "u19",
    "18plus",
    "30plus",
    "40plus",
)

private val legacyDivisionAliases = mapOf(
    "novice" to "beginner",
)

private val divisionDisplayOverrides = mapOf(
    "a" to "A",
    "aa" to "AA",
    "b" to "B",
    "bb" to "BB",
    "c" to "C",
    "open" to "Open",
    "beginner" to "Beginner",
    "intermediate" to "Intermediate",
    "advanced" to "Advanced",
    "expert" to "Expert",
)

private data class DivisionInference(
    val token: String,
    val divisionTypeId: String,
    val divisionTypeName: String,
    val ratingType: String,
    val gender: String,
    val skillDivisionTypeId: String,
    val skillDivisionTypeName: String,
    val ageDivisionTypeId: String,
    val ageDivisionTypeName: String,
    val defaultName: String,
)

data class ParsedDivisionTypeSelection(
    val skillDivisionTypeId: String,
    val ageDivisionTypeId: String,
)

private fun String.cleanDivisionText(): String = trim().replace(whitespaceRegex, " ")

private fun normalizeDivisionToken(raw: String): String {
    val normalized = raw.cleanDivisionText()
        .replace(delimiterRegex, "_")
        .replace(duplicateUnderscoreRegex, "_")
        .trim('_')
        .lowercase()
    return legacyDivisionAliases[normalized] ?: normalized
}

fun buildCombinedDivisionTypeId(
    skillDivisionTypeId: String,
    ageDivisionTypeId: String,
): String {
    val normalizedSkillDivisionId = skillDivisionTypeId.normalizeDivisionIdentifier()
        .ifBlank { DEFAULT_DIVISION }
    val normalizedAgeDivisionId = ageDivisionTypeId.normalizeDivisionIdentifier()
        .ifBlank { DEFAULT_AGE_DIVISION }
    return "skill_${normalizedSkillDivisionId}_age_${normalizedAgeDivisionId}"
}

fun parseCombinedDivisionTypeId(
    divisionTypeId: String?,
): ParsedDivisionTypeSelection? {
    val normalizedDivisionTypeId = divisionTypeId?.normalizeDivisionIdentifier().orEmpty()
    if (normalizedDivisionTypeId.isBlank()) return null
    val match = Regex("^skill_(.+)_age_(.+)$").matchEntire(normalizedDivisionTypeId) ?: return null
    return ParsedDivisionTypeSelection(
        skillDivisionTypeId = match.groupValues[1].normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_DIVISION },
        ageDivisionTypeId = match.groupValues[2].normalizeDivisionIdentifier()
            .ifBlank { DEFAULT_AGE_DIVISION },
    )
}

fun buildCombinedDivisionTypeName(
    skillDivisionTypeName: String,
    ageDivisionTypeName: String,
): String {
    val normalizedSkillName = skillDivisionTypeName.trim().ifBlank {
        DEFAULT_DIVISION.toDivisionDisplayLabel()
    }
    val normalizedAgeName = ageDivisionTypeName.trim().ifBlank {
        DEFAULT_AGE_DIVISION.toDivisionDisplayLabel()
    }
    return "$normalizedSkillName / $normalizedAgeName"
}

fun buildGenderSkillAgeDivisionToken(
    gender: String,
    skillDivisionTypeId: String,
    ageDivisionTypeId: String,
): String {
    val normalizedGender = gender.trim().uppercase().ifBlank { "C" }.first().lowercaseChar()
    val normalizedSkillDivisionId = skillDivisionTypeId.normalizeDivisionIdentifier()
        .ifBlank { DEFAULT_DIVISION }
    val normalizedAgeDivisionId = ageDivisionTypeId.normalizeDivisionIdentifier()
        .ifBlank { DEFAULT_AGE_DIVISION }
    return "${normalizedGender}_skill_${normalizedSkillDivisionId}_age_${normalizedAgeDivisionId}"
}

private fun buildDivisionName(
    gender: String,
    skillDivisionTypeName: String,
    ageDivisionTypeName: String,
): String {
    val normalizedSkillName = skillDivisionTypeName.trim().ifBlank {
        DEFAULT_DIVISION.toDivisionDisplayLabel()
    }
    val normalizedAgeName = ageDivisionTypeName.trim().ifBlank {
        DEFAULT_AGE_DIVISION.toDivisionDisplayLabel()
    }
    return when (gender.trim().uppercase()) {
        "M" -> "Men's $normalizedSkillName $normalizedAgeName"
        "F" -> "Women's $normalizedSkillName $normalizedAgeName"
        else -> "Coed $normalizedSkillName $normalizedAgeName"
    }
}

private fun inferDivisionMetadata(
    identifier: String,
    fallbackName: String? = null,
): DivisionInference {
    val normalizedIdentifier = identifier.normalizeDivisionIdentifier()
    val token = normalizedIdentifier.extractDivisionTokenFromId() ?: normalizedIdentifier
    val explicitDualPattern = dualDivisionTokenRegex.matchEntire(token)
    if (explicitDualPattern != null) {
        val gender = explicitDualPattern.groupValues[1].uppercase()
        val skillDivisionTypeId = normalizeDivisionToken(explicitDualPattern.groupValues[2])
        val ageDivisionTypeId = normalizeDivisionToken(explicitDualPattern.groupValues[3])
        val skillDivisionTypeName = tokenToDisplayLabel(skillDivisionTypeId)
        val ageDivisionTypeName = tokenToDisplayLabel(ageDivisionTypeId)
        val combinedDivisionTypeId = buildCombinedDivisionTypeId(
            skillDivisionTypeId = skillDivisionTypeId,
            ageDivisionTypeId = ageDivisionTypeId,
        )
        val combinedDivisionTypeName = buildCombinedDivisionTypeName(
            skillDivisionTypeName = skillDivisionTypeName,
            ageDivisionTypeName = ageDivisionTypeName,
        )
        val inferredName = fallbackName?.trim().takeIf { !it.isNullOrEmpty() }
            ?: buildDivisionName(
                gender = gender,
                skillDivisionTypeName = skillDivisionTypeName,
                ageDivisionTypeName = ageDivisionTypeName,
            )
        return DivisionInference(
            token = token,
            divisionTypeId = combinedDivisionTypeId,
            divisionTypeName = combinedDivisionTypeName,
            ratingType = "SKILL",
            gender = gender,
            skillDivisionTypeId = skillDivisionTypeId,
            skillDivisionTypeName = skillDivisionTypeName,
            ageDivisionTypeId = ageDivisionTypeId,
            ageDivisionTypeName = ageDivisionTypeName,
            defaultName = inferredName,
        )
    }

    val explicitPattern = divisionTokenRegex.matchEntire(token)
    if (explicitPattern != null) {
        val gender = explicitPattern.groupValues[1].uppercase()
        val ratingType = explicitPattern.groupValues[2].uppercase()
        val divisionTypeId = normalizeDivisionToken(explicitPattern.groupValues[3])
        val divisionTypeName = tokenToDisplayLabel(divisionTypeId)
        val skillDivisionTypeId = if (ratingType == "SKILL") {
            divisionTypeId
        } else {
            DEFAULT_DIVISION
        }
        val ageDivisionTypeId = if (ratingType == "AGE") {
            divisionTypeId
        } else {
            DEFAULT_AGE_DIVISION
        }
        val skillDivisionTypeName = tokenToDisplayLabel(skillDivisionTypeId)
        val ageDivisionTypeName = tokenToDisplayLabel(ageDivisionTypeId)
        val inferredName = fallbackName?.trim().takeIf { !it.isNullOrEmpty() }
            ?: when (gender) {
                "M" -> "Men's $divisionTypeName"
                "F" -> "Women's $divisionTypeName"
                else -> "Coed $divisionTypeName"
            }
        return DivisionInference(
            token = token,
            divisionTypeId = divisionTypeId,
            divisionTypeName = divisionTypeName,
            ratingType = ratingType,
            gender = gender,
            skillDivisionTypeId = skillDivisionTypeId,
            skillDivisionTypeName = skillDivisionTypeName,
            ageDivisionTypeId = ageDivisionTypeId,
            ageDivisionTypeName = ageDivisionTypeName,
            defaultName = inferredName,
        )
    }

    val divisionTypeId = normalizeDivisionToken(token)
    val divisionTypeName = tokenToDisplayLabel(divisionTypeId)
    val inferredRatingType = if (ageTokenRegex.matches(divisionTypeId)) {
        "AGE"
    } else {
        "SKILL"
    }
    val skillDivisionTypeId = if (inferredRatingType == "SKILL") {
        divisionTypeId
    } else {
        DEFAULT_DIVISION
    }
    val ageDivisionTypeId = if (inferredRatingType == "AGE") {
        divisionTypeId
    } else {
        DEFAULT_AGE_DIVISION
    }
    val skillDivisionTypeName = tokenToDisplayLabel(skillDivisionTypeId)
    val ageDivisionTypeName = tokenToDisplayLabel(ageDivisionTypeId)
    val inferredName = fallbackName?.trim().takeIf { !it.isNullOrEmpty() } ?: divisionTypeName
    return DivisionInference(
        token = divisionTypeId,
        divisionTypeId = divisionTypeId,
        divisionTypeName = divisionTypeName,
        ratingType = inferredRatingType,
        gender = "C",
        skillDivisionTypeId = skillDivisionTypeId,
        skillDivisionTypeName = skillDivisionTypeName,
        ageDivisionTypeId = ageDivisionTypeId,
        ageDivisionTypeName = ageDivisionTypeName,
        defaultName = inferredName,
    )
}

private fun String.displayTokenPart(): String {
    val normalized = normalizeDivisionToken(this)
    divisionDisplayOverrides[normalized]?.let { return it }
    decimalTokenRegex.matchEntire(normalized)?.let { match ->
        return "${match.groupValues[1]}.${match.groupValues[2]}"
    }
    plusTokenRegex.matchEntire(normalized)?.let { match ->
        return "${match.groupValues[1]}+"
    }
    trailingUTokenRegex.matchEntire(normalized)?.let { match ->
        return "U${match.groupValues[1]}"
    }
    leadingUTokenRegex.matchEntire(normalized)?.let { match ->
        return "U${match.groupValues[1]}"
    }
    if (normalized.length == 1 && normalized[0].isLetter()) {
        return normalized.uppercase()
    }
    return normalized.replaceFirstChar { char ->
        if (char.isLowerCase()) char.uppercaseChar() else char
    }
}

private fun tokenToDisplayLabel(token: String): String {
    val normalized = normalizeDivisionToken(token)
    divisionDisplayOverrides[normalized]?.let { return it }
    decimalTokenRegex.matchEntire(normalized)?.let { match ->
        return "${match.groupValues[1]}.${match.groupValues[2]}"
    }
    plusTokenRegex.matchEntire(normalized)?.let { match ->
        return "${match.groupValues[1]}+"
    }
    trailingUTokenRegex.matchEntire(normalized)?.let { match ->
        return "U${match.groupValues[1]}"
    }
    leadingUTokenRegex.matchEntire(normalized)?.let { match ->
        return "U${match.groupValues[1]}"
    }
    return normalized
        .split("_")
        .filter { it.isNotBlank() }
        .joinToString(" ") { it.displayTokenPart() }
}

fun buildEventDivisionId(eventId: String, divisionToken: String): String {
    val normalizedEventId = eventId.trim().lowercase()
    val normalizedToken = (divisionToken.extractDivisionTokenFromId() ?: divisionToken)
        .normalizeDivisionIdentifier()
        .ifEmpty { DEFAULT_DIVISION }
    return if (normalizedEventId.isEmpty()) {
        normalizedToken
    } else {
        "$normalizedEventId$DIVISION_MARKER$normalizedToken"
    }
}

fun String.extractDivisionTokenFromId(): String? {
    val normalized = trim().lowercase()
    if (normalized.isEmpty()) return null
    val markerIndex = normalized.indexOf(DIVISION_MARKER)
    return when {
        markerIndex >= 0 -> normalized
            .substring(markerIndex + DIVISION_MARKER.length)
            .normalizeDivisionIdentifier()
            .ifEmpty { null }
        normalized.startsWith("division_") -> normalized
            .removePrefix("division_")
            .normalizeDivisionIdentifier()
            .ifEmpty { null }
        else -> null
    }
}

fun String.normalizeDivisionIdentifier(): String {
    val compact = cleanDivisionText()
    if (compact.isEmpty()) return ""
    if (compact.contains(DIVISION_MARKER) || compact.startsWith("division_", ignoreCase = true)) {
        return compact.lowercase()
    }
    return normalizeDivisionToken(compact)
}

fun String.normalizeDivisionLabel(): String {
    return normalizeDivisionIdentifier()
}

fun List<String>.normalizeDivisionLabels(): List<String> =
    normalizeDivisionIdentifiers()

fun List<String>.normalizeDivisionIdentifiers(): List<String> {
    if (isEmpty()) return emptyList()
    val normalized = mutableListOf<String>()
    val seen = mutableSetOf<String>()
    forEach { value ->
        val candidate = value.normalizeDivisionIdentifier()
        if (candidate.isNotEmpty() && seen.add(candidate)) {
            normalized += candidate
        }
    }
    return normalized
}

fun divisionsEquivalent(left: String?, right: String?): Boolean {
    if (left.isNullOrBlank() || right.isNullOrBlank()) return false
    val normalizedLeft = left.normalizeDivisionIdentifier()
    val normalizedRight = right.normalizeDivisionIdentifier()
    if (normalizedLeft == normalizedRight) return true
    val leftToken = left.extractDivisionTokenFromId() ?: normalizedLeft
    val rightToken = right.extractDivisionTokenFromId() ?: normalizedRight
    return leftToken == rightToken
}

fun String.toDivisionDisplayLabel(
    divisionDetails: List<DivisionDetail> = emptyList(),
): String {
    val normalized = normalizeDivisionIdentifier()
    if (normalized.isEmpty()) return ""
    if (divisionDetails.isNotEmpty()) {
        val detail = divisionDetails.firstOrNull { detail ->
            divisionsEquivalent(detail.id, normalized) || divisionsEquivalent(detail.key, normalized)
        }
        val explicit = detail?.name?.trim()
        if (!explicit.isNullOrEmpty()) {
            return explicit
        }
    }
    val inference = inferDivisionMetadata(normalized)
    return inference.defaultName
}

fun List<String>.toDivisionDisplayLabels(
    divisionDetails: List<DivisionDetail> = emptyList(),
): List<String> {
    return normalizeDivisionIdentifiers()
        .map { division -> division.toDivisionDisplayLabel(divisionDetails) }
}

fun inferDivisionDetail(
    identifier: String,
    eventId: String? = null,
): DivisionDetail {
    val normalizedIdentifier = identifier.normalizeDivisionIdentifier()
    val inference = inferDivisionMetadata(normalizedIdentifier)
    val normalizedId = when {
        normalizedIdentifier.contains(DIVISION_MARKER) || normalizedIdentifier.startsWith("division_") -> {
            normalizedIdentifier
        }
        !eventId.isNullOrBlank() -> buildEventDivisionId(eventId, inference.token)
        else -> inference.token
    }
    return DivisionDetail(
        id = normalizedId,
        key = inference.token,
        name = inference.defaultName,
        divisionTypeId = inference.divisionTypeId,
        divisionTypeName = inference.divisionTypeName,
        ratingType = inference.ratingType,
        gender = inference.gender,
        skillDivisionTypeId = inference.skillDivisionTypeId,
        skillDivisionTypeName = inference.skillDivisionTypeName,
        ageDivisionTypeId = inference.ageDivisionTypeId,
        ageDivisionTypeName = inference.ageDivisionTypeName,
        price = null,
        maxParticipants = null,
        playoffTeamCount = null,
        allowPaymentPlans = null,
        installmentCount = null,
        installmentDueDates = emptyList(),
        installmentAmounts = emptyList(),
        playoffPlacementDivisionIds = emptyList(),
    )
}

fun DivisionDetail.normalizeDivisionDetail(eventId: String? = null): DivisionDetail {
    val candidateIdentifier = when {
        id.isNotBlank() -> id
        key.isNotBlank() -> key
        name.isNotBlank() -> name
        else -> DEFAULT_DIVISION
    }
    val inferred = inferDivisionMetadata(
        identifier = candidateIdentifier,
        fallbackName = name.takeIf { it.isNotBlank() },
    )
    val normalizedKey = key.normalizeDivisionIdentifier().ifEmpty { inferred.token }
    val rawId = id.normalizeDivisionIdentifier()
    val normalizedId = when {
        rawId.contains(DIVISION_MARKER) || rawId.startsWith("division_") -> rawId
        rawId.isNotEmpty() && !eventId.isNullOrBlank() -> buildEventDivisionId(eventId, rawId)
        rawId.isNotEmpty() -> rawId
        !eventId.isNullOrBlank() -> buildEventDivisionId(eventId, normalizedKey)
        else -> normalizedKey
    }
    val normalizedDivisionTypeId =
        divisionTypeId.normalizeDivisionIdentifier().ifEmpty { inferred.divisionTypeId }
    val normalizedDivisionTypeName = divisionTypeName.trim().ifEmpty { inferred.divisionTypeName }
    val parsedDivisionTypeSelection = parseCombinedDivisionTypeId(normalizedDivisionTypeId)
    val normalizedSkillDivisionTypeId = skillDivisionTypeId
        .normalizeDivisionIdentifier()
        .ifEmpty {
            parsedDivisionTypeSelection?.skillDivisionTypeId
                ?: inferred.skillDivisionTypeId
        }
        .ifEmpty { DEFAULT_DIVISION }
    val normalizedAgeDivisionTypeId = ageDivisionTypeId
        .normalizeDivisionIdentifier()
        .ifEmpty {
            parsedDivisionTypeSelection?.ageDivisionTypeId
                ?: inferred.ageDivisionTypeId
        }
        .ifEmpty { DEFAULT_AGE_DIVISION }
    val normalizedSkillDivisionTypeName = skillDivisionTypeName.trim().ifEmpty {
        tokenToDisplayLabel(normalizedSkillDivisionTypeId)
    }
    val normalizedAgeDivisionTypeName = ageDivisionTypeName.trim().ifEmpty {
        tokenToDisplayLabel(normalizedAgeDivisionTypeId)
    }
    val normalizedRatingType = ratingType.trim().uppercase().takeIf { it == "AGE" || it == "SKILL" }
        ?: inferred.ratingType
    val normalizedGender = gender.trim().uppercase().takeIf { it == "M" || it == "F" || it == "C" }
        ?: inferred.gender
    val normalizedCombinedDivisionTypeId = buildCombinedDivisionTypeId(
        skillDivisionTypeId = normalizedSkillDivisionTypeId,
        ageDivisionTypeId = normalizedAgeDivisionTypeId,
    )
    val normalizedCombinedDivisionTypeName = buildCombinedDivisionTypeName(
        skillDivisionTypeName = normalizedSkillDivisionTypeName,
        ageDivisionTypeName = normalizedAgeDivisionTypeName,
    )
    val normalizedInstallmentAmounts = installmentAmounts.map { amount ->
        amount.coerceAtLeast(0)
    }
    val normalizedInstallmentDueDates = installmentDueDates
        .map { dueDate -> dueDate.trim() }
        .filter(String::isNotBlank)
    val normalizedInstallmentCount = installmentCount
        ?.coerceAtLeast(0)
        ?.takeIf { count -> count > 0 }
        ?: maxOf(normalizedInstallmentAmounts.size, normalizedInstallmentDueDates.size).takeIf { count -> count > 0 }
    val normalizedAllowPaymentPlans = allowPaymentPlans == true
        && normalizedInstallmentCount != null
    val normalizedPlayoffPlacementDivisionIds = playoffPlacementDivisionIds.map { divisionId ->
        divisionId.normalizeDivisionIdentifier()
    }

    return copy(
        id = normalizedId,
        key = normalizedKey,
        name = name.trim().ifEmpty { inferred.defaultName },
        divisionTypeId = if (normalizedDivisionTypeId.isBlank()) {
            normalizedCombinedDivisionTypeId
        } else {
            normalizedDivisionTypeId
        },
        divisionTypeName = normalizedDivisionTypeName.ifBlank { normalizedCombinedDivisionTypeName },
        ratingType = normalizedRatingType,
        gender = normalizedGender,
        skillDivisionTypeId = normalizedSkillDivisionTypeId,
        skillDivisionTypeName = normalizedSkillDivisionTypeName,
        ageDivisionTypeId = normalizedAgeDivisionTypeId,
        ageDivisionTypeName = normalizedAgeDivisionTypeName,
        price = price?.coerceAtLeast(0),
        maxParticipants = maxParticipants
            ?.takeIf { participantCount -> participantCount >= 2 },
        playoffTeamCount = playoffTeamCount
            ?.takeIf { participantCount -> participantCount >= 2 },
        allowPaymentPlans = if (normalizedAllowPaymentPlans) true else false,
        installmentCount = if (normalizedAllowPaymentPlans) {
            normalizedInstallmentCount
        } else {
            null
        },
        installmentDueDates = if (normalizedAllowPaymentPlans) {
            normalizedInstallmentDueDates
        } else {
            emptyList()
        },
        installmentAmounts = if (normalizedAllowPaymentPlans) {
            normalizedInstallmentAmounts
        } else {
            emptyList()
        },
        sportId = sportId?.trim()?.takeIf(String::isNotBlank),
        ageCutoffDate = ageCutoffDate?.trim()?.takeIf(String::isNotBlank),
        ageCutoffLabel = ageCutoffLabel?.trim()?.takeIf(String::isNotBlank),
        ageCutoffSource = ageCutoffSource?.trim()?.takeIf(String::isNotBlank),
        fieldIds = fieldIds
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct(),
        playoffPlacementDivisionIds = normalizedPlayoffPlacementDivisionIds,
    )
}

fun List<DivisionDetail>.normalizeDivisionDetails(
    eventId: String? = null,
): List<DivisionDetail> {
    if (isEmpty()) return emptyList()
    val normalized = mutableListOf<DivisionDetail>()
    val seen = mutableSetOf<String>()
    forEach { detail ->
        val candidate = detail.normalizeDivisionDetail(eventId)
        val normalizedId = candidate.id.normalizeDivisionIdentifier()
        if (normalizedId.isNotEmpty() && seen.add(normalizedId)) {
            normalized += candidate
        }
    }
    return normalized
}

fun mergeDivisionDetailsForDivisions(
    divisions: List<String>,
    existingDetails: List<DivisionDetail>,
    eventId: String? = null,
): List<DivisionDetail> {
    val normalizedDivisions = divisions.normalizeDivisionIdentifiers()
    if (normalizedDivisions.isEmpty()) return emptyList()
    val normalizedDetails = existingDetails.normalizeDivisionDetails(eventId)

    return normalizedDivisions.map { divisionId ->
        normalizedDetails.firstOrNull { detail ->
            divisionsEquivalent(detail.id, divisionId) || divisionsEquivalent(detail.key, divisionId)
        } ?: inferDivisionDetail(divisionId, eventId)
    }
}
