package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType

internal fun Event.isTournamentPoolPlayEnabled(): Boolean =
    eventType == EventType.TOURNAMENT && includePlayoffs

internal fun derivePoolTeamCount(
    maxTeams: Int?,
    poolCount: Int?,
): Int? {
    val normalizedMaxTeams = maxTeams?.takeIf { it >= 2 } ?: return null
    val normalizedPoolCount = poolCount?.takeIf { it >= 1 } ?: return null
    return if (normalizedMaxTeams % normalizedPoolCount == 0) {
        normalizedMaxTeams / normalizedPoolCount
    } else {
        null
    }
}

internal fun DivisionDetail.withDerivedTournamentPoolTeamCount(enabled: Boolean): DivisionDetail {
    if (!enabled) {
        return copy(
            poolCount = null,
            poolTeamCount = null,
        )
    }
    return copy(
        poolTeamCount = derivePoolTeamCount(
            maxTeams = maxParticipants,
            poolCount = poolCount,
        ),
    )
}

internal fun isTournamentPoolDivisionValid(detail: DivisionDetail): Boolean {
    val maxTeams = detail.maxParticipants ?: return false
    val poolCount = detail.poolCount ?: return false
    val bracketTeamCount = detail.playoffTeamCount ?: return false
    return maxTeams >= 2 &&
        poolCount >= 1 &&
        bracketTeamCount >= 2 &&
        maxTeams % poolCount == 0 &&
        bracketTeamCount % poolCount == 0
}
