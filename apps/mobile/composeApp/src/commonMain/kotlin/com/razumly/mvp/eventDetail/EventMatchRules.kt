package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.MatchIncidentTypeDefinitionMVP
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.MatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchTimekeepingConfigMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.data.dataTypes.enums.EventType

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

private fun scoringIncident(code: String, label: String): MatchIncidentTypeDefinitionMVP =
    MatchIncidentTypeDefinitionMVP(
        code = code,
        label = label,
        kind = "SCORING",
        requiresTeam = true,
        requiresParticipant = false,
        defaultEnabled = true,
        linkedPointDelta = 1,
    )

private fun disciplineIncident(
    code: String,
    label: String,
    cardColor: String? = null,
    requiresParticipant: Boolean = false,
): MatchIncidentTypeDefinitionMVP =
    MatchIncidentTypeDefinitionMVP(
        code = code,
        label = label,
        kind = "DISCIPLINE",
        cardColor = cardColor,
        requiresTeam = true,
        requiresParticipant = requiresParticipant,
        defaultEnabled = true,
    )

private val noteIncident = MatchIncidentTypeDefinitionMVP(code = "NOTE", label = "Match note", kind = "NOTE", defaultEnabled = true)
private val adminIncident = MatchIncidentTypeDefinitionMVP(code = "ADMIN", label = "Admin note", kind = "ADMIN", defaultEnabled = true)

private fun baseIncidentDefinitions(scoringCode: String = "POINT", scoringLabel: String = "Point"): List<MatchIncidentTypeDefinitionMVP> =
    listOf(scoringIncident(scoringCode, scoringLabel), disciplineIncident("DISCIPLINE", "Penalty or card"), noteIncident, adminIncident)

private val volleyballIncidentDefinitions = listOf(
    scoringIncident("POINT", "Point"),
    disciplineIncident("YELLOW_CARD", "Yellow card", "yellow"),
    disciplineIncident("RED_CARD", "Red card", "red"),
    disciplineIncident("RED_YELLOW_CARD", "Red/yellow card", "red"),
    disciplineIncident("DELAY_WARNING", "Delay warning"),
    disciplineIncident("DELAY_PENALTY", "Delay penalty", "red"),
    disciplineIncident("EXPULSION", "Expulsion", "red"),
    disciplineIncident("DISQUALIFICATION", "Disqualification", "red"),
    noteIncident,
    adminIncident,
)

private val soccerIncidentDefinitions = listOf(
    scoringIncident("GOAL", "Goal"),
    disciplineIncident("YELLOW_CARD", "Yellow card", "yellow", requiresParticipant = true),
    disciplineIncident("RED_CARD", "Red card", "red", requiresParticipant = true),
    disciplineIncident("SECOND_YELLOW_CARD", "Second yellow card", "yellow", requiresParticipant = true),
    disciplineIncident("FOUL", "Foul"),
    noteIncident,
    adminIncident,
)

private val basketballIncidentDefinitions = listOf(
    scoringIncident("POINT", "Point"),
    disciplineIncident("PERSONAL_FOUL", "Personal foul", requiresParticipant = true),
    disciplineIncident("TECHNICAL_FOUL", "Technical foul", requiresParticipant = true),
    disciplineIncident("UNSPORTSMANLIKE_FOUL", "Unsportsmanlike foul", requiresParticipant = true),
    disciplineIncident("FLAGRANT_FOUL", "Flagrant foul", requiresParticipant = true),
    disciplineIncident("DISQUALIFYING_FOUL", "Disqualifying foul", "red", requiresParticipant = true),
    disciplineIncident("EJECTION", "Ejection", "red", requiresParticipant = true),
    noteIncident,
    adminIncident,
)

private val hockeyIncidentDefinitions = listOf(
    scoringIncident("GOAL", "Goal"),
    disciplineIncident("MINOR_PENALTY", "Minor penalty", requiresParticipant = true),
    disciplineIncident("MAJOR_PENALTY", "Major penalty", requiresParticipant = true),
    disciplineIncident("MISCONDUCT", "Misconduct", requiresParticipant = true),
    disciplineIncident("GAME_MISCONDUCT", "Game misconduct", "red", requiresParticipant = true),
    disciplineIncident("MATCH_PENALTY", "Match penalty", "red", requiresParticipant = true),
    noteIncident,
    adminIncident,
)

private val footballIncidentDefinitions = listOf(
    scoringIncident("POINT", "Point"),
    disciplineIncident("PERSONAL_FOUL", "Personal foul"),
    disciplineIncident("UNSPORTSMANLIKE_CONDUCT", "Unsportsmanlike conduct"),
    disciplineIncident("DELAY_OF_GAME", "Delay of game"),
    disciplineIncident("TARGETING", "Targeting", "red", requiresParticipant = true),
    disciplineIncident("EJECTION", "Ejection", "red"),
    noteIncident,
    adminIncident,
)

private val baseballIncidentDefinitions = listOf(
    scoringIncident("RUN", "Run"),
    disciplineIncident("WARNING", "Warning"),
    disciplineIncident("EJECTION", "Ejection", "red"),
    noteIncident,
    adminIncident,
)

private val tennisIncidentDefinitions = listOf(
    scoringIncident("POINT", "Point"),
    disciplineIncident("WARNING", "Warning"),
    disciplineIncident("POINT_PENALTY", "Point penalty"),
    disciplineIncident("GAME_PENALTY", "Game penalty"),
    disciplineIncident("DEFAULT", "Default", "red"),
    noteIncident,
    adminIncident,
)

private val pickleballIncidentDefinitions = listOf(
    scoringIncident("POINT", "Point"),
    disciplineIncident("VERBAL_WARNING", "Verbal warning"),
    disciplineIncident("TECHNICAL_WARNING", "Technical warning"),
    disciplineIncident("TECHNICAL_FOUL", "Technical foul"),
    disciplineIncident("EJECTION", "Ejection", "red"),
    disciplineIncident("FORFEIT", "Forfeit", "red"),
    noteIncident,
    adminIncident,
)

private fun noTimer(): MatchTimekeepingConfigMVP =
    MatchTimekeepingConfigMVP(
        timerMode = "NONE",
        segmentDurationMinutes = null,
        segmentDurationMinutesBySequence = emptyList(),
        canUseAddedTime = false,
        addedTimeEnabled = false,
        stopAtRegulationEnd = true,
    )

private fun fixedTimer(minutes: Int): MatchTimekeepingConfigMVP =
    MatchTimekeepingConfigMVP(
        timerMode = "COUNT_UP",
        segmentDurationMinutes = minutes,
        segmentDurationMinutesBySequence = emptyList(),
        canUseAddedTime = false,
        addedTimeEnabled = false,
        stopAtRegulationEnd = true,
    )

private fun addedTimeTimer(minutes: Int): MatchTimekeepingConfigMVP =
    MatchTimekeepingConfigMVP(
        timerMode = "COUNT_UP",
        segmentDurationMinutes = minutes,
        segmentDurationMinutesBySequence = emptyList(),
        canUseAddedTime = true,
        addedTimeEnabled = true,
        stopAtRegulationEnd = false,
    )

private fun incidentCodes(definitions: List<MatchIncidentTypeDefinitionMVP>): List<String> =
    definitions.map(MatchIncidentTypeDefinitionMVP::code)

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
        supportedIncidentTypes = incidentCodes(volleyballIncidentDefinitions),
        incidentTypeDefinitions = volleyballIncidentDefinitions,
        autoCreatePointIncidentType = "POINT",
        timekeeping = noTimer(),
    )

private fun periodMatchRulesTemplate(
    segmentCount: Int,
    segmentLabel: String,
    segmentDurationMinutes: Int,
    supportedIncidentTypes: List<String> = defaultPointIncidentTypes(),
    incidentTypeDefinitions: List<MatchIncidentTypeDefinitionMVP> = baseIncidentDefinitions(),
    autoCreatePointIncidentType: String = "POINT",
    supportsDraw: Boolean = false,
    supportsOvertime: Boolean = false,
    supportsShootout: Boolean = false,
    canUseOvertime: Boolean = false,
    canUseShootout: Boolean = false,
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
        incidentTypeDefinitions = incidentTypeDefinitions,
        autoCreatePointIncidentType = autoCreatePointIncidentType,
        timekeeping = fixedTimer(segmentDurationMinutes),
    )

private fun defaultSportMatchRulesTemplate(sport: Sport): MatchRulesConfigMVP? {
    val key = "${sport.id} ${sport.name}".trim().lowercase()
    return when {
        "volleyball" in key -> setBasedMatchRulesTemplate()
        "basketball" in key -> periodMatchRulesTemplate(
            segmentCount = 4,
            segmentLabel = "Quarter",
            segmentDurationMinutes = 10,
            supportedIncidentTypes = incidentCodes(basketballIncidentDefinitions),
            incidentTypeDefinitions = basketballIncidentDefinitions,
            supportsOvertime = true,
            canUseOvertime = true,
        )
        "soccer" in key -> {
            val isBeachSoccer = "beach" in key
            val duration = if ("indoor" in key) 25 else if (isBeachSoccer) 12 else 45
            periodMatchRulesTemplate(
                segmentCount = if (isBeachSoccer) 3 else 2,
                segmentLabel = if (isBeachSoccer) "Period" else "Half",
                segmentDurationMinutes = duration,
                supportedIncidentTypes = incidentCodes(soccerIncidentDefinitions),
                incidentTypeDefinitions = soccerIncidentDefinitions,
                autoCreatePointIncidentType = "GOAL",
                supportsDraw = !isBeachSoccer,
                supportsOvertime = isBeachSoccer,
                supportsShootout = isBeachSoccer,
                canUseOvertime = true,
                canUseShootout = true,
            ).let { rules ->
                if (isBeachSoccer) rules else rules.copy(timekeeping = addedTimeTimer(duration))
            }
        }
        "tennis" in key -> setBasedMatchRulesTemplate().copy(
            supportedIncidentTypes = incidentCodes(tennisIncidentDefinitions),
            incidentTypeDefinitions = tennisIncidentDefinitions,
        )
        "pickleball" in key -> setBasedMatchRulesTemplate(segmentLabel = "Game").copy(
            supportedIncidentTypes = incidentCodes(pickleballIncidentDefinitions),
            incidentTypeDefinitions = pickleballIncidentDefinitions,
        )
        "football" in key -> periodMatchRulesTemplate(
            segmentCount = 4,
            segmentLabel = "Quarter",
            segmentDurationMinutes = 15,
            supportedIncidentTypes = incidentCodes(footballIncidentDefinitions),
            incidentTypeDefinitions = footballIncidentDefinitions,
            supportsDraw = true,
            supportsOvertime = true,
            canUseOvertime = true,
        )
        "hockey" in key -> periodMatchRulesTemplate(
            segmentCount = 3,
            segmentLabel = "Period",
            segmentDurationMinutes = 20,
            supportedIncidentTypes = incidentCodes(hockeyIncidentDefinitions),
            incidentTypeDefinitions = hockeyIncidentDefinitions,
            autoCreatePointIncidentType = "GOAL",
            supportsDraw = true,
            supportsOvertime = true,
            supportsShootout = true,
            canUseOvertime = true,
            canUseShootout = true,
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
            supportedIncidentTypes = incidentCodes(baseballIncidentDefinitions),
            incidentTypeDefinitions = baseballIncidentDefinitions,
            autoCreatePointIncidentType = "RUN",
            timekeeping = noTimer(),
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
            incidentTypeDefinitions = baseIncidentDefinitions(),
            autoCreatePointIncidentType = "POINT",
            timekeeping = noTimer(),
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
        incidentTypeDefinitions = mergeIncidentDefinitions(defaults.incidentTypeDefinitions, override.incidentTypeDefinitions),
        autoCreatePointIncidentType = override.autoCreatePointIncidentType ?: defaults.autoCreatePointIncidentType,
        timekeeping = mergeTimekeepingConfig(defaults.timekeeping, override.timekeeping),
    )
}

private fun mergeIncidentDefinitions(
    defaults: List<MatchIncidentTypeDefinitionMVP>?,
    override: List<MatchIncidentTypeDefinitionMVP>?,
): List<MatchIncidentTypeDefinitionMVP>? {
    if (defaults.isNullOrEmpty()) {
        return override
    }
    if (override.isNullOrEmpty()) {
        return defaults
    }
    val byCode = linkedMapOf<String, MatchIncidentTypeDefinitionMVP>()
    defaults.forEach { definition ->
        val code = definition.code.trim().uppercase()
        if (code.isNotBlank()) byCode[code] = definition.copy(code = code)
    }
    override.forEach { definition ->
        val code = definition.code.trim().uppercase()
        if (code.isNotBlank()) byCode[code] = definition.copy(code = code)
    }
    return byCode.values.toList()
}

private fun mergeTimekeepingConfig(
    defaults: MatchTimekeepingConfigMVP?,
    override: MatchTimekeepingConfigMVP?,
): MatchTimekeepingConfigMVP? {
    if (defaults == null) return override
    if (override == null) return defaults
    return MatchTimekeepingConfigMVP(
        timerMode = override.timerMode ?: defaults.timerMode,
        segmentDurationMinutes = override.segmentDurationMinutes ?: defaults.segmentDurationMinutes,
        segmentDurationMinutesBySequence = override.segmentDurationMinutesBySequence ?: defaults.segmentDurationMinutesBySequence,
        canUseAddedTime = override.canUseAddedTime ?: defaults.canUseAddedTime,
        addedTimeEnabled = override.addedTimeEnabled ?: defaults.addedTimeEnabled,
        stopAtRegulationEnd = override.stopAtRegulationEnd ?: defaults.stopAtRegulationEnd,
    )
}

private fun isMatchRulesOverrideEmpty(value: MatchRulesConfigMVP): Boolean =
    value.scoringModel == null &&
        value.segmentCount == null &&
        value.segmentLabel == null &&
        value.supportsDraw == null &&
        value.supportsOvertime == null &&
        value.supportsShootout == null &&
        value.canUseOvertime == null &&
        value.canUseShootout == null &&
        value.officialRoles.isNullOrEmpty() &&
        value.supportedIncidentTypes.isNullOrEmpty() &&
        value.incidentTypeDefinitions.isNullOrEmpty() &&
        value.autoCreatePointIncidentType == null &&
        value.pointIncidentRequiresParticipant == null &&
        value.timekeeping == null

internal fun matchRulesOverrideWithoutSegmentCount(value: MatchRulesConfigMVP?): MatchRulesConfigMVP? {
    val sanitized = value?.copy(
        segmentCount = null,
        pointIncidentRequiresParticipant = null,
    ) ?: return null
    return sanitized.takeUnless(::isMatchRulesOverrideEmpty)
}

private fun segmentCountFallbackForModel(scoringModel: String, event: Event): Int {
    return when (scoringModel) {
        "SETS" -> when (event.eventType) {
            EventType.LEAGUE -> (event.setsPerMatch ?: event.winnerSetCount).coerceAtLeast(1)
            EventType.TOURNAMENT -> event.winnerSetCount.coerceAtLeast(1)
            EventType.EVENT, EventType.TRYOUT, EventType.WEEKLY_EVENT -> 1
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

    val supportedIncidentTypes = normalizedMatchRuleStringList(value.supportedIncidentTypes)
        .takeIf { it.isNotEmpty() }
    val timekeeping = value.timekeeping?.takeIf { config ->
        config.timerMode != null ||
            config.segmentDurationMinutes != null ||
            !config.segmentDurationMinutesBySequence.isNullOrEmpty() ||
            config.canUseAddedTime != null ||
            config.addedTimeEnabled != null ||
            config.stopAtRegulationEnd != null
    }

    val normalized = MatchRulesConfigMVP(
        supportsDraw = value.supportsDraw,
        supportsOvertime = value.supportsOvertime,
        supportsShootout = value.supportsShootout,
        canUseOvertime = value.canUseOvertime,
        canUseShootout = value.canUseShootout,
        supportedIncidentTypes = supportedIncidentTypes,
        timekeeping = timekeeping,
    )

    return if (
        isMatchRulesOverrideEmpty(normalized)
    ) {
        null
    } else {
        normalized
    }
}

internal fun copyMatchRulesOverride(
    current: MatchRulesConfigMVP?,
    supportsDraw: Boolean? = current?.supportsDraw,
    supportsOvertime: Boolean? = current?.supportsOvertime,
    supportsShootout: Boolean? = current?.supportsShootout,
    canUseOvertime: Boolean? = current?.canUseOvertime,
    canUseShootout: Boolean? = current?.canUseShootout,
    supportedIncidentTypes: List<String>? = current?.supportedIncidentTypes,
    incidentTypeDefinitions: List<MatchIncidentTypeDefinitionMVP>? = current?.incidentTypeDefinitions,
    timekeeping: MatchTimekeepingConfigMVP? = current?.timekeeping,
): MatchRulesConfigMVP? {
    return normalizeMatchRulesOverride(
        MatchRulesConfigMVP(
            supportsDraw = supportsDraw,
            supportsOvertime = supportsOvertime,
            supportsShootout = supportsShootout,
            canUseOvertime = canUseOvertime,
            canUseShootout = canUseShootout,
            supportedIncidentTypes = supportedIncidentTypes,
            incidentTypeDefinitions = incidentTypeDefinitions,
            timekeeping = timekeeping,
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

private fun incidentDefinitionForCode(code: String): MatchIncidentTypeDefinitionMVP {
    val normalized = code.trim().uppercase().ifBlank { "NOTE" }
    return when (normalized) {
        "POINT" -> scoringIncident("POINT", "Point")
        "GOAL" -> scoringIncident("GOAL", "Goal")
        "RUN" -> scoringIncident("RUN", "Run")
        "NOTE" -> noteIncident
        "ADMIN" -> adminIncident
        "DISCIPLINE" -> disciplineIncident("DISCIPLINE", "Penalty or card")
        else -> disciplineIncident(
            normalized,
            normalized.lowercase()
                .split("_")
                .filter(String::isNotBlank)
                .joinToString(" ") { token -> token.replaceFirstChar { it.titlecase() } },
        )
    }
}

private fun resolvedIncidentDefinitions(
    sportTemplate: MatchRulesConfigMVP?,
    eventOverride: MatchRulesConfigMVP?,
    fallback: ResolvedMatchRulesMVP?,
    supportedIncidentTypes: List<String>,
    autoCreatePointIncidentType: String,
): List<MatchIncidentTypeDefinitionMVP> {
    val byCode = linkedMapOf<String, MatchIncidentTypeDefinitionMVP>()
    fun add(definition: MatchIncidentTypeDefinitionMVP) {
        val code = definition.code.trim().uppercase()
        if (code.isNotBlank()) byCode[code] = definition.copy(code = code)
    }
    baseIncidentDefinitions().forEach(::add)
    fallback?.incidentTypeDefinitions?.forEach(::add)
    sportTemplate?.incidentTypeDefinitions?.forEach(::add)
    eventOverride?.incidentTypeDefinitions?.forEach(::add)
    add(incidentDefinitionForCode(autoCreatePointIncidentType).copy(kind = "SCORING", requiresTeam = true, linkedPointDelta = 1))
    supportedIncidentTypes.forEach { type ->
        val code = type.trim().uppercase()
        if (code.isNotBlank() && byCode[code] == null) add(incidentDefinitionForCode(code))
    }
    return byCode.values.toList()
}

private fun resolvedTimekeeping(
    scoringModel: String,
    segmentCount: Int,
    event: Event,
    sportTemplate: MatchRulesConfigMVP?,
    eventOverride: MatchRulesConfigMVP?,
    fallback: ResolvedMatchRulesMVP?,
): ResolvedMatchTimekeepingConfigMVP {
    val sport = sportTemplate?.timekeeping
    val override = eventOverride?.timekeeping
    val fallbackRules = fallback?.timekeeping
    val timerMode = (override?.timerMode ?: sport?.timerMode ?: fallbackRules?.timerMode ?: if (scoringModel == "PERIODS") "COUNT_UP" else "NONE")
        .trim()
        .uppercase()
        .takeIf { it == "COUNT_UP" || it == "NONE" }
        ?: "NONE"
    val fromMatchDuration = event.matchDurationMinutes
        ?.takeIf { it > 0 && segmentCount > 0 && timerMode != "NONE" }
        ?.let { (it.toDouble() / segmentCount.toDouble()).toInt().coerceAtLeast(1) }
    val segmentDuration = override?.segmentDurationMinutes
        ?: sport?.segmentDurationMinutes
        ?: fallbackRules?.segmentDurationMinutes
        ?: fromMatchDuration
    val sequenceDurations = override?.segmentDurationMinutesBySequence
        ?: sport?.segmentDurationMinutesBySequence
        ?: fallbackRules?.segmentDurationMinutesBySequence
        ?: emptyList()
    val canUseAddedTime = timerMode != "NONE" && (sport?.canUseAddedTime == true || (sport == null && (override?.canUseAddedTime == true || fallbackRules?.canUseAddedTime == true)))
    val addedTimeEnabled = canUseAddedTime && (override?.addedTimeEnabled ?: sport?.addedTimeEnabled ?: fallbackRules?.addedTimeEnabled ?: false)
    return ResolvedMatchTimekeepingConfigMVP(
        timerMode = timerMode,
        segmentDurationMinutes = segmentDuration,
        segmentDurationMinutesBySequence = sequenceDurations.filter { it > 0 },
        canUseAddedTime = canUseAddedTime,
        addedTimeEnabled = addedTimeEnabled,
        stopAtRegulationEnd = if (timerMode == "NONE") {
            true
        } else if (addedTimeEnabled) {
            false
        } else {
            override?.stopAtRegulationEnd ?: sport?.stopAtRegulationEnd ?: fallbackRules?.stopAtRegulationEnd ?: true
        },
    )
}

internal fun resolveEventMatchRules(
    event: Event,
    sport: Sport?,
): ResolvedMatchRulesMVP {
    val resolvedMatchRules = event.resolvedMatchRules
    if (sport == null && event.matchRulesOverride == null && resolvedMatchRules != null) {
        return resolvedMatchRules
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
    val segmentCount = sportTemplate?.segmentCount?.takeIf { it > 0 }
        ?: fallbackSegmentCount
    val defaultIncidentTypes = resolvedRulesFallback?.supportedIncidentTypes
        ?.takeIf { it.isNotEmpty() }
        ?: defaultPointIncidentTypes()
    val supportedIncidentTypes = normalizedMatchRuleStringList(eventOverride?.supportedIncidentTypes)
        .ifEmpty {
            normalizedMatchRuleStringList(sportTemplate?.supportedIncidentTypes)
                .ifEmpty { defaultIncidentTypes }
        }
    val autoCreatePointIncidentType = eventOverride?.autoCreatePointIncidentType
        ?.takeIf(String::isNotBlank)
        ?: sportTemplate?.autoCreatePointIncidentType
            ?.takeIf(String::isNotBlank)
        ?: resolvedRulesFallback?.autoCreatePointIncidentType
        ?: "POINT"
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
        supportedIncidentTypes = supportedIncidentTypes,
        incidentTypeDefinitions = resolvedIncidentDefinitions(
            sportTemplate = sportTemplate,
            eventOverride = eventOverride,
            fallback = resolvedRulesFallback,
            supportedIncidentTypes = supportedIncidentTypes,
            autoCreatePointIncidentType = autoCreatePointIncidentType,
        ),
        autoCreatePointIncidentType = autoCreatePointIncidentType,
        pointIncidentRequiresParticipant = event.autoCreatePointMatchIncidents,
        timekeeping = resolvedTimekeeping(
            scoringModel = scoringModel,
            segmentCount = segmentCount,
            event = event,
            sportTemplate = sportTemplate,
            eventOverride = eventOverride,
            fallback = resolvedRulesFallback,
        ),
    )
}
