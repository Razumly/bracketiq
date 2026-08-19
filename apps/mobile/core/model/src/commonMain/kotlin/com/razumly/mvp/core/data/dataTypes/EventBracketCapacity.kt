package com.razumly.mvp.core.data.dataTypes

import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.mergeDivisionDetailsForDivisions

const val MIN_BRACKET_TEAM_COUNT: Int = 3

fun normalizeBracketTeamCount(value: Int?): Int =
    value ?: MIN_BRACKET_TEAM_COUNT

fun supportsBracketTeamCount(eventType: EventType): Boolean =
    eventType == EventType.LEAGUE || eventType == EventType.TOURNAMENT

fun isBracketTeamCountEnabled(
    eventType: EventType,
    includePlayoffs: Boolean,
): Boolean = includePlayoffs && supportsBracketTeamCount(eventType)

fun Event.withDefaultPlayoffTeamCounts(): Event {
    if (!isBracketTeamCountEnabled(eventType, includePlayoffs)) {
        return this
    }

    val sourceDetails = divisionDetails.filterNot { detail ->
        detail.kind?.trim()?.equals("PLAYOFF", ignoreCase = true) == true
    }
    val resolvedEventCount = playoffTeamCount
        ?: if (singleDivision) {
            sourceDetails.firstNotNullOfOrNull { detail -> detail.playoffTeamCount }
        } else {
            null
        }
        ?: MIN_BRACKET_TEAM_COUNT
    val defaultDivisionCount = if (singleDivision) {
        resolvedEventCount
    } else {
        MIN_BRACKET_TEAM_COUNT
    }
    val needsDetailUpdate = divisionDetails.any { detail ->
        val isPlayoffDivision = detail.kind
            ?.trim()
            ?.equals("PLAYOFF", ignoreCase = true) == true
        if (isPlayoffDivision) {
            detail.maxParticipants == null
        } else {
            detail.playoffTeamCount == null
        }
    }
    if (playoffTeamCount == resolvedEventCount && !needsDetailUpdate) {
        return this
    }

    return copy(
        playoffTeamCount = resolvedEventCount,
        divisionDetails = divisionDetails.map { detail ->
            val isPlayoffDivision = detail.kind
                ?.trim()
                ?.equals("PLAYOFF", ignoreCase = true) == true
            when {
                isPlayoffDivision && detail.maxParticipants == null ->
                    detail.copy(maxParticipants = MIN_BRACKET_TEAM_COUNT)
                !isPlayoffDivision && detail.playoffTeamCount == null ->
                    detail.copy(playoffTeamCount = defaultDivisionCount)
                else -> detail
            }
        },
    )
}

fun Event.withSimplePlayoffsOrPoolPlay(enabled: Boolean): Event {
    if (!supportsBracketTeamCount(eventType)) return this
    val mergedDetails = mergeDivisionDetailsForDivisions(
        divisions = divisions,
        existingDetails = divisionDetails,
        eventId = id,
    )
    val nextEventPlayoffTeamCount = if (enabled) {
        if (singleDivision) {
            playoffTeamCount
                ?: mergedDetails.firstOrNull()?.playoffTeamCount
                ?: MIN_BRACKET_TEAM_COUNT
        } else {
            playoffTeamCount ?: MIN_BRACKET_TEAM_COUNT
        }
    } else {
        null
    }
    return copy(
        includePlayoffs = enabled,
        playoffTeamCount = nextEventPlayoffTeamCount,
        divisionDetails = mergedDetails.map { detail ->
            if (enabled) {
                detail.copy(
                    playoffTeamCount = if (singleDivision) {
                        nextEventPlayoffTeamCount
                    } else {
                        detail.playoffTeamCount ?: MIN_BRACKET_TEAM_COUNT
                    },
                )
            } else {
                detail.copy(
                    playoffTeamCount = null,
                    poolCount = null,
                    poolTeamCount = null,
                )
            }
        },
    )
}
