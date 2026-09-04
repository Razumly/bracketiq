package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import kotlinx.serialization.Serializable
import kotlin.time.Instant

@Serializable
enum class TerminalMatchStatus { CHANGED, NO_OP, REPLAYED }

@Serializable
data class TerminalMatchEventDto(val id: String, val end: String, val generatedScheduleEnd: String?)

@Serializable
data class TerminalMatchResultDto(
    val contractVersion: Int,
    val operationId: String,
    val eventId: String,
    val matchId: String,
    val status: TerminalMatchStatus,
    val event: TerminalMatchEventDto,
    val matches: List<MatchApiDto>,
    val affectedMatchIds: List<String>,
    val protectedMatchIds: List<String>,
    val placementChanges: List<ScheduleReflowPlacementChangeDto>,
    val assignmentChanges: List<ScheduleReflowAssignmentChangeDto>,
    val warnings: List<ScheduleReflowWarningDto>,
    val exploredStates: Int,
) {
    fun decodeMatches(expectedOperationId: String, expectedEventId: String, expectedMatchId: String): List<MatchMVP> {
        require(contractVersion == 1 && operationId == expectedOperationId && eventId == expectedEventId
            && matchId == expectedMatchId && event.id == eventId) { "Invalid terminal operation identity." }
        Instant.parse(event.end)
        event.generatedScheduleEnd?.let(Instant::parse)
        require(exploredStates >= 0)
        val decoded = matches.map { dto ->
            requireNotNull(dto.toMatchOrNull()).let { match ->
                match.copy(officialId = match.officialId ?: match.officialIds.firstOrNull { it.userId != null }?.userId)
            }
        }
        val byId = decoded.associateBy(MatchMVP::id)
        require(byId.size == decoded.size && decoded.all { it.eventId == eventId }) { "Invalid terminal Match graph." }
        for (ids in listOf(affectedMatchIds, protectedMatchIds, placementChanges.map { it.matchId }, assignmentChanges.map { it.matchId })) {
            require(ids.all(String::isNotBlank) && ids.distinct().size == ids.size)
        }
        if (status != TerminalMatchStatus.CHANGED) {
            require(matches.isEmpty() && placementChanges.isEmpty() && assignmentChanges.isEmpty())
            return emptyList()
        }
        require(matchId in byId && affectedMatchIds.containsAll(byId.keys))
        placementChanges.forEach { change ->
            val match = requireNotNull(byId[change.matchId])
            require(change.matchId !in protectedMatchIds && change.before != change.after)
            require(match.start == Instant.parse(change.after.start) && match.end == Instant.parse(change.after.end)
                && match.fieldId == change.after.fieldId && match.end!! > match.start!!)
        }
        assignmentChanges.forEach { change ->
            val match = requireNotNull(byId[change.matchId])
            require(change.matchId !in protectedMatchIds && change.before != change.after)
            require(match.teamOfficialId == change.after.teamOfficialId
                && match.officialIds == change.after.officialAssignments.map { it.toModel() })
        }
        return decoded
    }
}

fun MatchUpdateDto.isTerminalOperation(): Boolean = finalize == true
    || matchAction?.action in setOf("FORFEIT", "CANCEL", "NO_CONTEST")
    || lifecycle?.status?.uppercase() in setOf("COMPLETE", "COMPLETED", "CANCELLED")
    || lifecycle?.resultStatus?.uppercase() in setOf("FINAL", "NO_CONTEST")
    || lifecycle?.resultType?.uppercase() in setOf("FORFEIT", "NO_CONTEST")
