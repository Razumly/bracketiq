package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.util.buildCombinedDivisionTypeId
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier

internal fun Team.eventDivisionMatchIdentifiers(): List<String> = buildList {
    addNormalized(division)
    addNormalized(divisionTypeId)
    addNormalized(buildCombinedDivisionTypeIdOrNull(skillDivisionTypeId, ageDivisionTypeId))
}
    .distinct()

internal fun DivisionDetail.eventDivisionMatchIdentifiers(): List<String> = buildList {
    addNormalized(id)
    addNormalized(key)
    addNormalized(divisionTypeId)
    addNormalized(buildCombinedDivisionTypeIdOrNull(skillDivisionTypeId, ageDivisionTypeId))
}
    .distinct()

internal fun Team.matchesEventDivision(detail: DivisionDetail): Boolean {
    val detailIdentifiers = detail.eventDivisionMatchIdentifiers().toSet()
    if (detailIdentifiers.isEmpty()) return false
    return eventDivisionMatchIdentifiers().any(detailIdentifiers::contains)
}

private fun MutableList<String>.addNormalized(value: String?) {
    val normalized = value?.normalizeDivisionIdentifier().orEmpty()
    if (normalized.isNotBlank()) {
        add(normalized)
    }
}

private fun buildCombinedDivisionTypeIdOrNull(
    skillDivisionTypeId: String?,
    ageDivisionTypeId: String?,
): String? {
    val normalizedSkill = skillDivisionTypeId?.normalizeDivisionIdentifier().orEmpty()
    val normalizedAge = ageDivisionTypeId?.normalizeDivisionIdentifier().orEmpty()
    if (normalizedSkill.isBlank() && normalizedAge.isBlank()) return null
    return buildCombinedDivisionTypeId(
        skillDivisionTypeId = normalizedSkill,
        ageDivisionTypeId = normalizedAge,
    )
}
