package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionCompetitionPhase
import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Sport

internal fun Map<String, DivisionPhaseSettingsMVP>.forPhase(
    phase: DivisionCompetitionPhase,
): DivisionPhaseSettingsMVP? = this[phase.name]

internal fun Map<String, DivisionPhaseSettingsMVP>.withPhase(
    phase: DivisionCompetitionPhase,
    settings: DivisionPhaseSettingsMVP?,
): Map<String, DivisionPhaseSettingsMVP> = toMutableMap().apply {
    if (settings == null) remove(phase.name) else put(phase.name, settings)
}

internal fun resolveDivisionPhaseMatchRules(
    event: Event,
    sport: Sport?,
    settings: DivisionPhaseSettingsMVP?,
    usesSets: Boolean,
): ResolvedMatchRulesMVP {
    val base = resolveEventMatchRules(event, sport)
    val override = settings?.matchRulesOverride
    val segmentCount = if (usesSets) {
        base.segmentCount
    } else {
        override?.segmentCount?.takeIf { it > 0 } ?: base.segmentCount
    }
    val overrideTimekeeping = override?.timekeeping
    val segmentLength = settings?.segmentLengthMinutes
        ?: overrideTimekeeping?.segmentDurationMinutes
        ?: base.timekeeping.segmentDurationMinutes
    val segmentBreak = settings?.segmentBreakMinutes
        ?: overrideTimekeeping?.segmentBreakDurationMinutes
        ?: base.timekeeping.segmentBreakDurationMinutes

    return base.copy(
        scoringModel = override?.scoringModel ?: base.scoringModel,
        segmentCount = segmentCount,
        segmentLabel = override?.segmentLabel?.takeIf(String::isNotBlank) ?: base.segmentLabel,
        setPointTargets = override?.setPointTargets?.takeIf { it.isNotEmpty() } ?: base.setPointTargets,
        supportsDraw = override?.supportsDraw ?: base.supportsDraw,
        supportsOvertime = override?.supportsOvertime ?: base.supportsOvertime,
        supportsShootout = override?.supportsShootout ?: base.supportsShootout,
        canUseOvertime = override?.canUseOvertime ?: base.canUseOvertime,
        canUseShootout = override?.canUseShootout ?: base.canUseShootout,
        officialRoles = override?.officialRoles?.takeIf { it.isNotEmpty() } ?: base.officialRoles,
        supportedIncidentTypes = override?.supportedIncidentTypes?.takeIf { it.isNotEmpty() }
            ?: base.supportedIncidentTypes,
        incidentTypeDefinitions = override?.incidentTypeDefinitions?.takeIf { it.isNotEmpty() }
            ?: base.incidentTypeDefinitions,
        autoCreatePointIncidentType = override?.autoCreatePointIncidentType
            ?.takeIf(String::isNotBlank)
            ?: base.autoCreatePointIncidentType,
        pointIncidentRequiresParticipant = override?.pointIncidentRequiresParticipant
            ?: settings?.autoCreatePointMatchIncidents
            ?: base.pointIncidentRequiresParticipant,
        timekeeping = base.timekeeping.copy(
            timerMode = overrideTimekeeping?.timerMode ?: base.timekeeping.timerMode,
            segmentDurationMinutes = segmentLength,
            segmentDurationMinutesBySequence = overrideTimekeeping?.segmentDurationMinutesBySequence
                ?: base.timekeeping.segmentDurationMinutesBySequence,
            segmentBreakDurationMinutes = segmentBreak.coerceAtLeast(0),
            canUseAddedTime = overrideTimekeeping?.canUseAddedTime ?: base.timekeeping.canUseAddedTime,
            addedTimeEnabled = overrideTimekeeping?.addedTimeEnabled ?: base.timekeeping.addedTimeEnabled,
            stopAtRegulationEnd = overrideTimekeeping?.stopAtRegulationEnd
                ?: base.timekeeping.stopAtRegulationEnd,
        ),
    )
}

internal fun calculateDivisionPhaseDurationMinutes(
    segmentCount: Int,
    segmentLengthMinutes: Int?,
    segmentBreakMinutes: Int?,
): Int? {
    val length = segmentLengthMinutes?.takeIf { it >= 1 } ?: return null
    val count = segmentCount.takeIf { it >= 1 } ?: return null
    val breaks = (count - 1).coerceAtLeast(0)
    return count * length + breaks * (segmentBreakMinutes ?: 0).coerceAtLeast(0)
}
