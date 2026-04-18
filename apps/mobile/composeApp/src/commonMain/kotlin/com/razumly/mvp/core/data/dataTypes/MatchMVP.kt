package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import kotlinx.serialization.Contextual
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@Entity
@Serializable
@OptIn(ExperimentalTime::class)
data class MatchMVP (
    val matchId: Int,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val team1Seed: Int? = null,
    val team2Seed: Int? = null,
    val eventId: String,
    val officialId: String? = null,
    val fieldId: String? = null,
    val status: String? = null,
    val resultStatus: String? = null,
    val resultType: String? = null,
    val actualStart: String? = null,
    val actualEnd: String? = null,
    val statusReason: String? = null,
    val winnerEventTeamId: String? = null,
    val matchRulesSnapshot: ResolvedMatchRulesMVP? = null,
    val resolvedMatchRules: ResolvedMatchRulesMVP? = null,
    val segments: List<MatchSegmentMVP> = emptyList(),
    val incidents: List<MatchIncidentMVP> = emptyList(),
    @Contextual
    val start: Instant? = null,
    val end: Instant? = null,
    val division: String? = null,
    var team1Points: List<Int> = emptyList(),
    var team2Points: List<Int> = emptyList(),
    val setResults: List<Int> = emptyList(),
    val side: String? = null,
    val losersBracket: Boolean = false,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val officialCheckedIn: Boolean? = null,
    val officialIds: List<MatchOfficialAssignment> = emptyList(),
    val teamOfficialId: String? = null,
    val locked: Boolean = false,
    @PrimaryKey override val id: String,
) : MVPDocument {
    fun toMatchDTO(): MatchDTO {
        return MatchDTO(
            id = id,
            matchId = matchId,
            team1Id = team1Id,
            team2Id = team2Id,
            team1Seed = team1Seed,
            team2Seed = team2Seed,
            eventId = eventId,
            officialId = officialId,
            fieldId = fieldId,
            status = status,
            resultStatus = resultStatus,
            resultType = resultType,
            actualStart = actualStart,
            actualEnd = actualEnd,
            statusReason = statusReason,
            winnerEventTeamId = winnerEventTeamId,
            matchRulesSnapshot = matchRulesSnapshot,
            resolvedMatchRules = resolvedMatchRules,
            segments = segments,
            incidents = incidents,
            start = start?.toString(),
            end = end?.toString(),
            division = division,
            team1Points = team1Points,
            team2Points = team2Points,
            setResults = setResults,
            side = side,
            losersBracket = losersBracket,
            winnerNextMatchId = winnerNextMatchId,
            loserNextMatchId = loserNextMatchId,
            previousLeftId = previousLeftId,
            previousRightId = previousRightId,
            officialCheckedIn = officialCheckedIn,
            officialIds = officialIds,
            teamOfficialId = teamOfficialId,
            locked = locked,
        )
    }
}

@Serializable
data class MatchRulesConfigMVP(
    val scoringModel: String? = null,
    val segmentCount: Int? = null,
    val segmentLabel: String? = null,
    val supportsDraw: Boolean? = null,
    val supportsOvertime: Boolean? = null,
    val supportsShootout: Boolean? = null,
    val canUseOvertime: Boolean? = null,
    val canUseShootout: Boolean? = null,
    val officialRoles: List<String>? = null,
    val supportedIncidentTypes: List<String>? = null,
    val autoCreatePointIncidentType: String? = null,
    val pointIncidentRequiresParticipant: Boolean? = null,
)

@Serializable
data class ResolvedMatchRulesMVP(
    val scoringModel: String = "POINTS_ONLY",
    val segmentCount: Int = 1,
    val segmentLabel: String = "Total",
    val supportsDraw: Boolean = false,
    val supportsOvertime: Boolean = false,
    val supportsShootout: Boolean = false,
    val canUseOvertime: Boolean = false,
    val canUseShootout: Boolean = false,
    val officialRoles: List<String> = emptyList(),
    val supportedIncidentTypes: List<String> = listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN"),
    val autoCreatePointIncidentType: String? = "POINT",
    val pointIncidentRequiresParticipant: Boolean = false,
)

@Serializable
data class MatchSegmentMVP(
    val id: String,
    @SerialName("\$id") val legacyId: String? = null,
    val eventId: String? = null,
    val matchId: String,
    val sequence: Int,
    val status: String = "NOT_STARTED",
    val scores: Map<String, Int> = emptyMap(),
    val winnerEventTeamId: String? = null,
    val startedAt: String? = null,
    val endedAt: String? = null,
    val resultType: String? = null,
    val statusReason: String? = null,
    val metadata: Map<String, String>? = null,
)

@Serializable
data class MatchIncidentMVP(
    val id: String,
    @SerialName("\$id") val legacyId: String? = null,
    val eventId: String? = null,
    val matchId: String,
    val segmentId: String? = null,
    val eventTeamId: String? = null,
    val eventRegistrationId: String? = null,
    val participantUserId: String? = null,
    val officialUserId: String? = null,
    val incidentType: String,
    val sequence: Int,
    val minute: Int? = null,
    val clock: String? = null,
    val clockSeconds: Int? = null,
    val linkedPointDelta: Int? = null,
    val note: String? = null,
    val metadata: Map<String, String>? = null,
    val uploadStatus: String? = null,
)
