package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.normalizedMatchOfficialAssignments
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.core.network.dto.MatchOfficialCheckInOperationDto
import com.razumly.mvp.core.network.dto.MatchScoreSetDto
import com.razumly.mvp.core.network.dto.MatchSegmentOperationDto
import com.razumly.mvp.core.network.dto.MatchUpdateDto

fun MatchMVP.applyLocalMatchUpdate(update: MatchUpdateDto): MatchMVP {
    var next = applyLocalLifecycle(update.lifecycle)
    update.officialCheckIn?.let { checkIn ->
        next = next.applyLocalOfficialCheckIn(checkIn)
    }
    update.segmentOperations?.takeIf { it.isNotEmpty() }?.let { operations ->
        next = next.applyLocalSegmentOperations(operations)
    }
    update.incidentOperations?.takeIf { it.isNotEmpty() }?.let { operations ->
        next = next.applyLocalIncidentOperations(operations)
    }
    if (update.finalize == true) {
        next = next.copy(
            status = "COMPLETE",
            resultStatus = next.resultStatus ?: "FINAL",
            actualEnd = update.time ?: next.actualEnd,
        )
    }
    return next
}

internal fun MatchMVP.applyLocalScoreSet(scoreSet: MatchScoreSetDto): MatchMVP {
    val targetIndex = segments.indexOfFirst { segment ->
        segment.id == scoreSet.segmentId ||
            segment.legacyId == scoreSet.segmentId ||
            segment.sequence == scoreSet.sequence
    }.takeIf { it >= 0 } ?: segments.size
    val target = segments.getOrNull(targetIndex) ?: MatchSegmentMVP(
        id = scoreSet.segmentId ?: "${id}_segment_${scoreSet.sequence}",
        legacyId = scoreSet.segmentId ?: "${id}_segment_${scoreSet.sequence}",
        eventId = eventId,
        matchId = id,
        sequence = scoreSet.sequence,
        status = "NOT_STARTED",
    )
    val updatedScores = target.scores + (scoreSet.eventTeamId to scoreSet.points.coerceAtLeast(0))
    val updatedSegment = target.copy(
        status = if (updatedScores.values.any { it > 0 }) "IN_PROGRESS" else target.status,
        scores = updatedScores,
    )
    val updatedSegments = segments.toMutableList().apply {
        if (targetIndex in indices) {
            this[targetIndex] = updatedSegment
        } else {
            add(updatedSegment)
        }
    }.sortedBy { it.sequence }
    return copy(segments = updatedSegments).syncLegacyScoresFromLocalSegments()
}

private fun MatchMVP.applyLocalLifecycle(lifecycle: MatchLifecycleOperationDto?): MatchMVP {
    if (lifecycle == null) return this
    return copy(
        status = lifecycle.status ?: status,
        resultStatus = lifecycle.resultStatus ?: resultStatus,
        resultType = lifecycle.resultType ?: resultType,
        actualStart = when {
            lifecycle.actualStart != null -> lifecycle.actualStart
            lifecycle.clearActualStart -> null
            else -> actualStart
        },
        actualEnd = when {
            lifecycle.actualEnd != null -> lifecycle.actualEnd
            lifecycle.clearActualEnd -> null
            else -> actualEnd
        },
        statusReason = lifecycle.statusReason ?: statusReason,
        winnerEventTeamId = lifecycle.winnerEventTeamId ?: winnerEventTeamId,
    )
}

private fun MatchMVP.applyLocalOfficialCheckIn(checkIn: MatchOfficialCheckInOperationDto): MatchMVP {
    val targetUserId = checkIn.userId?.trim()?.takeIf(String::isNotBlank)
    val targetPositionId = checkIn.positionId?.trim()?.takeIf(String::isNotBlank)
    val assignments = officialIds.normalizedMatchOfficialAssignments()
    if (assignments.isEmpty() || targetUserId == null) {
        return copy(officialCheckedIn = checkIn.checkedIn)
    }
    val updatedAssignments = assignments.map { assignment ->
        val userMatches = assignment.userId == targetUserId
        val positionMatches = targetPositionId == null || assignment.positionId == targetPositionId
        val slotMatches = checkIn.slotIndex == null || assignment.slotIndex == checkIn.slotIndex
        if (userMatches && positionMatches && slotMatches) {
            assignment.copy(checkedIn = checkIn.checkedIn)
        } else {
            assignment
        }
    }
    val primaryCheckedIn = updatedAssignments.firstOrNull()?.checkedIn == true
    return copy(
        officialIds = updatedAssignments,
        officialCheckedIn = primaryCheckedIn,
    )
}

private fun MatchMVP.applyLocalSegmentOperations(operations: List<MatchSegmentOperationDto>): MatchMVP {
    val updated = segments.toMutableList()
    operations.forEach { operation ->
        val index = updated.indexOfFirst { segment ->
            operation.id?.let { id -> segment.id == id || segment.legacyId == id } == true ||
                segment.sequence == operation.sequence
        }
        val existing = updated.getOrNull(index) ?: MatchSegmentMVP(
            id = operation.id ?: "${id}_segment_${operation.sequence}",
            legacyId = operation.id ?: "${id}_segment_${operation.sequence}",
            eventId = eventId,
            matchId = id,
            sequence = operation.sequence,
            status = "NOT_STARTED",
        )
        val next = existing.copy(
            id = operation.id ?: existing.id,
            legacyId = operation.id ?: existing.legacyId,
            status = operation.status ?: existing.status,
            scores = operation.scores ?: existing.scores,
            winnerEventTeamId = when {
                operation.winnerEventTeamId != null -> operation.winnerEventTeamId
                operation.clearWinnerEventTeamId -> null
                else -> existing.winnerEventTeamId
            },
            startedAt = when {
                operation.startedAt != null -> operation.startedAt
                operation.clearStartedAt -> null
                else -> existing.startedAt
            },
            endedAt = when {
                operation.endedAt != null -> operation.endedAt
                operation.clearEndedAt -> null
                else -> existing.endedAt
            },
            resultType = when {
                operation.resultType != null -> operation.resultType
                operation.clearResultType -> null
                else -> existing.resultType
            },
            statusReason = when {
                operation.statusReason != null -> operation.statusReason
                operation.clearStatusReason -> null
                else -> existing.statusReason
            },
        )
        if (index >= 0) {
            updated[index] = next
        } else {
            updated += next
        }
    }
    // Segment results are safe to show optimistically, but their aggregate does not establish a
    // match winner. The server owns that evaluation because it depends on the scoring model,
    // configured segment count, completion state, totals, and ties.
    return copy(
        segments = updated.sortedBy { it.sequence },
    ).syncLegacyScoresFromLocalSegments()
}

private fun MatchMVP.applyLocalIncidentOperations(operations: List<MatchIncidentOperationDto>): MatchMVP {
    var next = this
    val incidents = incidents.toMutableList()
    operations.forEach { operation ->
        when (operation.action.uppercase()) {
            "DELETE" -> {
                val index = operation.id?.let { id -> incidents.indexOfFirst { it.id == id || it.legacyId == id } } ?: -1
                if (index >= 0) {
                    next = next.applyLocalIncidentScoreDelta(incidents[index], -1)
                    incidents.removeAt(index)
                }
            }
            "CREATE" -> {
                val existingIndex = operation.id?.let { id ->
                    incidents.indexOfFirst { it.id == id || it.legacyId == id }
                } ?: -1
                val incident = operation.toLocalIncident(
                    match = next,
                    existingSequence = if (existingIndex >= 0) incidents[existingIndex].sequence else null,
                    currentIncidentCount = incidents.size,
                )
                if (existingIndex >= 0) {
                    next = next.applyLocalIncidentScoreDelta(incidents[existingIndex], -1)
                    incidents[existingIndex] = incident
                    next = next.applyLocalIncidentScoreDelta(incident, 1)
                } else {
                    incidents += incident
                    next = next.applyLocalIncidentScoreDelta(incident, 1)
                }
            }
            "UPDATE" -> {
                val index = operation.id?.let { id -> incidents.indexOfFirst { it.id == id || it.legacyId == id } } ?: -1
                if (index >= 0) {
                    next = next.applyLocalIncidentScoreDelta(incidents[index], -1)
                    val previous = incidents[index]
                    val updated = previous.copy(
                        segmentId = operation.segmentId ?: previous.segmentId,
                        eventTeamId = operation.eventTeamId ?: previous.eventTeamId,
                        eventRegistrationId = operation.eventRegistrationId ?: previous.eventRegistrationId,
                        participantUserId = operation.participantUserId ?: previous.participantUserId,
                        officialUserId = operation.officialUserId ?: previous.officialUserId,
                        incidentType = operation.incidentType ?: previous.incidentType,
                        sequence = operation.sequence ?: previous.sequence,
                        minute = operation.minute ?: previous.minute,
                        clock = operation.clock ?: previous.clock,
                        clockSeconds = operation.clockSeconds ?: previous.clockSeconds,
                        linkedPointDelta = operation.linkedPointDelta ?: previous.linkedPointDelta,
                        note = operation.note ?: previous.note,
                    )
                    incidents[index] = updated
                    next = next.applyLocalIncidentScoreDelta(updated, 1)
                }
            }
        }
    }
    return next.copy(
        incidents = incidents.sortedWith(compareBy<MatchIncidentMVP> { it.sequence }.thenBy { it.id }),
    ).syncLegacyScoresFromLocalSegments()
}

private fun MatchIncidentOperationDto.toLocalIncident(
    match: MatchMVP,
    existingSequence: Int?,
    currentIncidentCount: Int,
): MatchIncidentMVP = MatchIncidentMVP(
    id = id ?: "client:match-incident:${match.id}:${currentIncidentCount + 1}",
    eventId = match.eventId,
    matchId = match.id,
    segmentId = segmentId,
    eventTeamId = eventTeamId,
    eventRegistrationId = eventRegistrationId,
    participantUserId = participantUserId,
    officialUserId = officialUserId,
    incidentType = incidentType ?: "NOTE",
    sequence = sequence ?: existingSequence ?: currentIncidentCount + 1,
    minute = minute,
    clock = clock,
    clockSeconds = clockSeconds,
    linkedPointDelta = linkedPointDelta,
    note = note,
    uploadStatus = null,
)

private fun MatchMVP.applyLocalIncidentScoreDelta(
    incident: MatchIncidentMVP,
    multiplier: Int,
): MatchMVP {
    val delta = incident.linkedPointDelta ?: return this
    if (delta == 0) return this
    val eventTeamId = incident.eventTeamId?.trim()?.takeIf(String::isNotBlank) ?: return this
    val segmentIndex = segments.indexOfFirst { segment ->
        segment.id == incident.segmentId || segment.legacyId == incident.segmentId
    }
    if (segmentIndex < 0) return this
    val updated = segments.toMutableList()
    val segment = updated[segmentIndex]
    val nextScore = ((segment.scores[eventTeamId] ?: 0) + delta * multiplier).coerceAtLeast(0)
    val nextScores = segment.scores + (eventTeamId to nextScore)
    updated[segmentIndex] = segment.copy(
        status = when {
            segment.status == "COMPLETE" -> segment.status
            nextScores.values.any { score -> score > 0 } -> "IN_PROGRESS"
            else -> "NOT_STARTED"
        },
        scores = nextScores,
    )
    return copy(segments = updated)
}

private fun MatchMVP.syncLegacyScoresFromLocalSegments(): MatchMVP {
    val ordered = segments.sortedBy { it.sequence }
    return copy(
        segments = ordered,
        team1Points = ordered.map { segment -> team1Id?.let { segment.scores[it] ?: 0 } ?: 0 },
        team2Points = ordered.map { segment -> team2Id?.let { segment.scores[it] ?: 0 } ?: 0 },
        setResults = ordered.map { segment ->
            when (segment.winnerEventTeamId) {
                team1Id -> 1
                team2Id -> 2
                else -> 0
            }
        },
    )
}
