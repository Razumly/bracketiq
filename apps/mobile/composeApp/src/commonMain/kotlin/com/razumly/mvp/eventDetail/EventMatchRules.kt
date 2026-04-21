package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.enums.EventType
internal fun matchScoringModelLabel(value: String?): String {
    return when (value?.trim()?.uppercase()) {
        "SETS" -> "Sets"
        "INNINGS" -> "Innings"
        "POINTS_ONLY" -> "Points only"
        else -> "Periods"
    }
}

private fun matchSegmentLabelForModel(value: String): String {
    return when (value.trim().uppercase()) {
        "SETS" -> "Set"
        "INNINGS" -> "Inning"
        "POINTS_ONLY" -> "Total"
        else -> "Period"
    }
}

private fun defaultPointIncidentTypes(): List<String> = listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN")

private fun defaultGoalIncidentTypes(): List<String> = listOf("GOAL", "DISCIPLINE", "NOTE", "ADMIN")

private fun defaultRunIncidentTypes(): List<String> = listOf("RUN", "DISCIPLINE", "NOTE", "ADMIN")

private fun setBasedMatchRulesTemplate(segmentLabel: String = "Set"): MatchRulesConfigMVP =
    MatchRulesConfigMVP(
        scoringModel = "SETS",
        segmentLabel = segmentLabel,
        supportsDraw = false,
        supportsOvertime = false,
        supportsShootout = false,
        canUseOvertime = false,
        canUseShootout = false,
        officialRoles = emptyList(),
        supportedIncidentTypes = defaultPointIncidentTypes(),
        autoCreatePointIncidentType = "POINT",
        pointIncidentRequiresParticipant = false,
    )

private fun periodMatchRulesTemplate(
    segmentCount: Int,
    segmentLabel: String,
    supportedIncidentTypes: List<String> = defaultPointIncidentTypes(),
    autoCreatePointIncidentType: String = "POINT",
    supportsDraw: Boolean = false,
    supportsOvertime: Boolean = false,
    supportsShootout: Boolean = false,
    canUseOvertime: Boolean = false,
    canUseShootout: Boolean = false,
    pointIncidentRequiresParticipant: Boolean = false,
): MatchRulesConfigMVP =
    MatchRulesConfigMVP(
        scoringModel = "PERIODS",
        segmentCount = segmentCount,
        segmentLabel = segmentLabel,
        supportsDraw = supportsDraw,
        supportsOvertime = supportsOvertime,
        supportsShootout = supportsShootout,
        canUseOvertime = canUseOvertime,
        canUseShootout = canUseShootout,
        officialRoles = emptyList(),
        supportedIncidentTypes = supportedIncidentTypes,
        autoCreatePointIncidentType = autoCreatePointIncidentType,
        pointIncidentRequiresParticipant = pointIncidentRequiresParticipant,
    )

private fun defaultSportMatchRulesTemplate(sport: Sport): MatchRulesConfigMVP? {
    val key = "${sport.id} ${sport.name}".trim().lowercase()
    return when {
        "volleyball" in key -> setBasedMatchRulesTemplate()
        "basketball" in key -> periodMatchRulesTemplate(
            segmentCount = 4,
            segmentLabel = "Quarter",
            supportsOvertime = true,
            canUseOvertime = true,
        )
        "soccer" in key -> periodMatchRulesTemplate(
            segmentCount = 2,
            segmentLabel = "Half",
            supportedIncidentTypes = defaultGoalIncidentTypes(),
            autoCreatePointIncidentType = "GOAL",
            supportsDraw = true,
            canUseOvertime = true,
            canUseShootout = true,
            pointIncidentRequiresParticipant = true,
        )
        "tennis" in key -> setBasedMatchRulesTemplate()
        "pickleball" in key -> setBasedMatchRulesTemplate(segmentLabel = "Game")
        "football" in key -> periodMatchRulesTemplate(
            segmentCount = 4,
            segmentLabel = "Quarter",
            supportsDraw = true,
            supportsOvertime = true,
            canUseOvertime = true,
        )
        "hockey" in key -> periodMatchRulesTemplate(
            segmentCount = 3,
            segmentLabel = "Period",
            supportedIncidentTypes = defaultGoalIncidentTypes(),
            autoCreatePointIncidentType = "GOAL",
            supportsDraw = true,
            supportsOvertime = true,
            supportsShootout = true,
            canUseOvertime = true,
            canUseShootout = true,
            pointIncidentRequiresParticipant = true,
        )
        "baseball" in key -> MatchRulesConfigMVP(
            scoringModel = "INNINGS",
            segmentCount = 9,
            segmentLabel = "Inning",
            supportsDraw = false,
            supportsOvertime = false,
            supportsShootout = false,
            canUseOvertime = false,
            canUseShootout = false,
            officialRoles = emptyList(),
            supportedIncidentTypes = defaultRunIncidentTypes(),
            autoCreatePointIncidentType = "RUN",
            pointIncidentRequiresParticipant = false,
        )
        "other" in key -> MatchRulesConfigMVP(
            scoringModel = "POINTS_ONLY",
            segmentCount = 1,
            segmentLabel = "Total",
            supportsDraw = true,
            supportsOvertime = false,
            supportsShootout = false,
            canUseOvertime = true,
            canUseShootout = true,
            officialRoles = emptyList(),
            supportedIncidentTypes = defaultPointIncidentTypes(),
            autoCreatePointIncidentType = "POINT",
            pointIncidentRequiresParticipant = false,
        )
        else -> null
    }
}

private fun mergeMatchRulesTemplate(
    defaults: MatchRulesConfigMVP?,
    override: MatchRulesConfigMVP?,
): MatchRulesConfigMVP? {
    if (defaults == null) {
        return override
    }
    if (override == null) {
        return defaults
    }
    return MatchRulesConfigMVP(
        scoringModel = override.scoringModel ?: defaults.scoringModel,
        segmentCount = override.segmentCount ?: defaults.segmentCount,
        segmentLabel = override.segmentLabel ?: defaults.segmentLabel,
        supportsDraw = override.supportsDraw ?: defaults.supportsDraw,
        supportsOvertime = override.supportsOvertime ?: defaults.supportsOvertime,
        supportsShootout = override.supportsShootout ?: defaults.supportsShootout,
        canUseOvertime = override.canUseOvertime ?: defaults.canUseOvertime,
        canUseShootout = override.canUseShootout ?: defaults.canUseShootout,
        officialRoles = override.officialRoles ?: defaults.officialRoles,
        supportedIncidentTypes = override.supportedIncidentTypes ?: defaults.supportedIncidentTypes,
        autoCreatePointIncidentType = override.autoCreatePointIncidentType ?: defaults.autoCreatePointIncidentType,
        pointIncidentRequiresParticipant = override.pointIncidentRequiresParticipant
            ?: defaults.pointIncidentRequiresParticipant,
    )
}

private fun segmentCountFallbackForModel(scoringModel: String, event: Event): Int {
    return when (scoringModel) {
        "SETS" -> when (event.eventType) {
            EventType.LEAGUE -> (event.setsPerMatch ?: event.winnerSetCount).coerceAtLeast(1)
            EventType.TOURNAMENT -> event.winnerSetCount.coerceAtLeast(1)
            EventType.EVENT, EventType.WEEKLY_EVENT -> 1
        }
        "INNINGS" -> 9
        "PERIODS" -> 4
        else -> 1
    }
}

internal fun matchIncidentTypeLabel(value: String): String {
    return when (value.trim().uppercase()) {
        "POINT" -> "Point / Goal"
        "DISCIPLINE" -> "Discipline"
        "NOTE" -> "Note"
        "ADMIN" -> "Admin"
        else -> value
            .trim()
            .lowercase()
            .replace("_", " ")
            .split(" ")
            .filter(String::isNotBlank)
            .joinToString(" ") { token -> token.replaceFirstChar { character -> character.titlecase() } }
    }
}

private fun normalizedMatchRuleStringList(values: List<String>?): List<String> =
    values
        .orEmpty()
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()

private fun sameStringSet(left: List<String>, right: List<String>): Boolean {
    if (left.size != right.size) {
        return false
    }
    val leftSet = left.toSet()
    return right.all(leftSet::contains)
}

private fun normalizeMatchRulesOverride(value: MatchRulesConfigMVP?): MatchRulesConfigMVP? {
    if (value == null) {
        return null
    }

    val segmentCount = value.segmentCount?.takeIf { it > 0 }
    val supportedIncidentTypes = normalizedMatchRuleStringList(value.supportedIncidentTypes)
        .takeIf { it.isNotEmpty() }

    val normalized = MatchRulesConfigMVP(
        segmentCount = segmentCount,
        supportsDraw = value.supportsDraw,
        supportsOvertime = value.supportsOvertime,
        supportsShootout = value.supportsShootout,
        canUseOvertime = value.canUseOvertime,
        canUseShootout = value.canUseShootout,
        supportedIncidentTypes = supportedIncidentTypes,
        pointIncidentRequiresParticipant = value.pointIncidentRequiresParticipant,
    )

    return if (
        normalized.segmentCount == null &&
        normalized.supportsDraw == null &&
        normalized.supportsOvertime == null &&
        normalized.supportsShootout == null &&
        normalized.canUseOvertime == null &&
        normalized.canUseShootout == null &&
        normalized.supportedIncidentTypes == null &&
        normalized.pointIncidentRequiresParticipant == null
    ) {
        null
    } else {
        normalized
    }
}

internal fun copyMatchRulesOverride(
    current: MatchRulesConfigMVP?,
    segmentCount: Int? = current?.segmentCount,
    supportsDraw: Boolean? = current?.supportsDraw,
    supportsOvertime: Boolean? = current?.supportsOvertime,
    supportsShootout: Boolean? = current?.supportsShootout,
    canUseOvertime: Boolean? = current?.canUseOvertime,
    canUseShootout: Boolean? = current?.canUseShootout,
    supportedIncidentTypes: List<String>? = current?.supportedIncidentTypes,
    pointIncidentRequiresParticipant: Boolean? = current?.pointIncidentRequiresParticipant,
): MatchRulesConfigMVP? {
    return normalizeMatchRulesOverride(
        MatchRulesConfigMVP(
            segmentCount = segmentCount,
            supportsDraw = supportsDraw,
            supportsOvertime = supportsOvertime,
            supportsShootout = supportsShootout,
            canUseOvertime = canUseOvertime,
            canUseShootout = canUseShootout,
            supportedIncidentTypes = supportedIncidentTypes,
            pointIncidentRequiresParticipant = pointIncidentRequiresParticipant,
        ),
    )
}

internal fun enforceAutoPointIncidentType(
    selected: List<String>,
    autoPointIncidentType: String,
    enabled: Boolean,
): List<String> {
    val normalized = normalizedMatchRuleStringList(selected)
    if (!enabled) {
        return normalized
    }
    val normalizedAutoType = autoPointIncidentType.trim().ifBlank { "POINT" }
    return (normalized + normalizedAutoType).distinct()
}

internal fun supportedIncidentTypesOverrideOrNull(
    selected: List<String>,
    defaults: List<String>,
): List<String>? {
    val normalizedSelected = normalizedMatchRuleStringList(selected)
    if (normalizedSelected.isEmpty() || sameStringSet(normalizedSelected, normalizedMatchRuleStringList(defaults))) {
        return null
    }
    return normalizedSelected
}

internal fun resolveEventMatchRules(
    event: Event,
    sport: Sport?,
): ResolvedMatchRulesMVP {
    if (sport == null && event.matchRulesOverride == null && event.resolvedMatchRules != null) {
        return event.resolvedMatchRules
    }

    val sportTemplate = sport?.let { selectedSport ->
        mergeMatchRulesTemplate(
            defaults = defaultSportMatchRulesTemplate(selectedSport),
            override = selectedSport.matchRulesTemplate,
        )
    }
    val eventOverride = event.matchRulesOverride
    val resolvedRulesFallback = event.resolvedMatchRules.takeIf { sportTemplate == null }
    val fallbackModel = when {
        resolvedRulesFallback?.scoringModel?.isNotBlank() == true -> resolvedRulesFallback.scoringModel
        event.usesSets -> "SETS"
        else -> "POINTS_ONLY"
    }
    val scoringModel = (
        eventOverride?.scoringModel
            ?: sportTemplate?.scoringModel
            ?: fallbackModel
        )
        .trim()
        .uppercase()
        .takeIf { it in setOf("SETS", "PERIODS", "INNINGS", "POINTS_ONLY") }
        ?: "POINTS_ONLY"

    val fallbackSegmentCount = resolvedRulesFallback?.segmentCount?.takeIf { it > 0 }
        ?: segmentCountFallbackForModel(scoringModel, event)
    val segmentCount = eventOverride?.segmentCount
        ?.takeIf { it > 0 }
        ?: sportTemplate?.segmentCount?.takeIf { it > 0 }
        ?: fallbackSegmentCount
    val defaultIncidentTypes = resolvedRulesFallback?.supportedIncidentTypes
        ?.takeIf { it.isNotEmpty() }
        ?: defaultPointIncidentTypes()
    val officialRolesFromEvent = event.officialPositions
        .map(EventOfficialPosition::name)
        .map(String::trim)
        .filter(String::isNotBlank)
        .distinct()
    val canUseOvertime = if (sportTemplate != null) {
        sportTemplate.canUseOvertime == true || sportTemplate.supportsOvertime == true
    } else {
        eventOverride?.canUseOvertime == true ||
            eventOverride?.supportsOvertime == true ||
            resolvedRulesFallback?.canUseOvertime == true ||
            resolvedRulesFallback?.supportsOvertime == true
    }
    val canUseShootout = if (sportTemplate != null) {
        sportTemplate.canUseShootout == true || sportTemplate.supportsShootout == true
    } else {
        eventOverride?.canUseShootout == true ||
            eventOverride?.supportsShootout == true ||
            resolvedRulesFallback?.canUseShootout == true ||
            resolvedRulesFallback?.supportsShootout == true
    }
    val supportsOvertime = canUseOvertime && (
        eventOverride?.supportsOvertime
            ?: sportTemplate?.supportsOvertime
            ?: resolvedRulesFallback?.supportsOvertime
            ?: false
        )
    val supportsShootout = canUseShootout && (
        eventOverride?.supportsShootout
            ?: sportTemplate?.supportsShootout
            ?: resolvedRulesFallback?.supportsShootout
            ?: false
        )
    val supportsDraw = (
        eventOverride?.supportsDraw
            ?: sportTemplate?.supportsDraw
            ?: resolvedRulesFallback?.supportsDraw
            ?: false
        ) && !supportsShootout

    return ResolvedMatchRulesMVP(
        scoringModel = scoringModel,
        segmentCount = segmentCount,
        segmentLabel = eventOverride?.segmentLabel
            ?.takeIf(String::isNotBlank)
            ?: sportTemplate?.segmentLabel
                ?.takeIf(String::isNotBlank)
            ?: resolvedRulesFallback?.segmentLabel
            ?: matchSegmentLabelForModel(scoringModel),
        supportsDraw = supportsDraw,
        supportsOvertime = supportsOvertime,
        supportsShootout = supportsShootout,
        canUseOvertime = canUseOvertime,
        canUseShootout = canUseShootout,
        officialRoles = normalizedMatchRuleStringList(eventOverride?.officialRoles)
            .ifEmpty {
                normalizedMatchRuleStringList(sportTemplate?.officialRoles)
                    .ifEmpty {
                        resolvedRulesFallback?.officialRoles
                            ?.takeIf { it.isNotEmpty() }
                            ?: officialRolesFromEvent
                    }
            },
        supportedIncidentTypes = normalizedMatchRuleStringList(eventOverride?.supportedIncidentTypes)
            .ifEmpty {
                normalizedMatchRuleStringList(sportTemplate?.supportedIncidentTypes)
                    .ifEmpty { defaultIncidentTypes }
            },
        autoCreatePointIncidentType = eventOverride?.autoCreatePointIncidentType
            ?.takeIf(String::isNotBlank)
            ?: sportTemplate?.autoCreatePointIncidentType
                ?.takeIf(String::isNotBlank)
            ?: resolvedRulesFallback?.autoCreatePointIncidentType
            ?: "POINT",
        pointIncidentRequiresParticipant = eventOverride?.pointIncidentRequiresParticipant
            ?: sportTemplate?.pointIncidentRequiresParticipant
            ?: resolvedRulesFallback?.pointIncidentRequiresParticipant
            ?: false,
    )
}
