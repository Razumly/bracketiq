package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.data.BracketNode
import com.razumly.mvp.eventDetail.data.validateAndNormalizeBracketGraph

internal data class MatchEditValidationResult(
    val isValid: Boolean,
    val errorMessage: String,
)

internal fun buildEditableBracketNodes(matches: List<MatchWithRelations>): List<BracketNode> {
    return matches.map { relation ->
        val match = relation.match
        BracketNode(
            id = match.id,
            matchId = match.matchId,
            previousLeftId = match.previousLeftId.normalizeMatchEditToken(),
            previousRightId = match.previousRightId.normalizeMatchEditToken(),
            winnerNextMatchId = match.winnerNextMatchId.normalizeMatchEditToken(),
            loserNextMatchId = match.loserNextMatchId.normalizeMatchEditToken(),
        )
    }
}

internal fun normalizeEditableBracketGraph(matches: List<MatchWithRelations>): List<MatchWithRelations> {
    if (matches.isEmpty()) {
        return matches
    }
    val graphValidation = validateAndNormalizeBracketGraph(buildEditableBracketNodes(matches))
    if (!graphValidation.ok) {
        return matches
    }

    val withNormalizedPrevious = matches.map { relation ->
        val match = relation.match
        val normalizedNode = graphValidation.normalizedById[match.id] ?: return@map relation
        val normalizedPreviousLeftId = normalizedNode.previousLeftId.normalizeMatchEditToken()
        val normalizedPreviousRightId = normalizedNode.previousRightId.normalizeMatchEditToken()
        val currentPreviousLeftId = match.previousLeftId.normalizeMatchEditToken()
        val currentPreviousRightId = match.previousRightId.normalizeMatchEditToken()

        if (currentPreviousLeftId == normalizedPreviousLeftId &&
            currentPreviousRightId == normalizedPreviousRightId
        ) {
            relation
        } else {
            relation.copy(
                match = match.copy(
                    previousLeftId = normalizedPreviousLeftId,
                    previousRightId = normalizedPreviousRightId,
                ),
                previousLeftMatch = null,
                previousRightMatch = null,
            )
        }
    }

    val matchesById = withNormalizedPrevious.associateBy { relation -> relation.match.id }
    return withNormalizedPrevious.map { relation ->
        val match = relation.match
        relation.copy(
            winnerNextMatch = match.winnerNextMatchId.normalizeMatchEditToken()?.let { id -> matchesById[id]?.match },
            loserNextMatch = match.loserNextMatchId.normalizeMatchEditToken()?.let { id -> matchesById[id]?.match },
            previousLeftMatch = match.previousLeftId.normalizeMatchEditToken()?.let { id -> matchesById[id]?.match },
            previousRightMatch = match.previousRightId.normalizeMatchEditToken()?.let { id -> matchesById[id]?.match },
        )
    }
}

internal fun validateEditableMatches(
    matches: List<MatchWithRelations>,
    isTournament: Boolean,
    stagedCreates: Map<String, StagedMatchCreateMeta>,
    isClientMatchId: (String?) -> Boolean,
): MatchEditValidationResult {
    for (i in matches.indices) {
        for (j in i + 1 until matches.size) {
            val match1 = matches[i].match
            val match2 = matches[j].match

            if (doMatchesOverlap(match1, match2)) {
                if (match1.fieldId != null && match1.fieldId == match2.fieldId) {
                    return MatchEditValidationResult(
                        isValid = false,
                        errorMessage = "Matches #${match1.matchId} and #${match2.matchId} overlap on the same field",
                    )
                }

                val match1Teams = setOfNotNull(match1.team1Id, match1.team2Id, match1.teamOfficialId)
                val match2Teams = setOfNotNull(match2.team1Id, match2.team2Id, match2.teamOfficialId)
                val sharedTeams = match1Teams.intersect(match2Teams)

                if (sharedTeams.isNotEmpty()) {
                    return MatchEditValidationResult(
                        isValid = false,
                        errorMessage = "Matches #${match1.matchId} and #${match2.matchId} have overlapping participants",
                    )
                }
            }
        }
    }
    val graphValidation = validateAndNormalizeBracketGraph(buildEditableBracketNodes(matches))
    if (!graphValidation.ok) {
        return MatchEditValidationResult(
            isValid = false,
            errorMessage = graphValidation.errors.firstOrNull()?.message
                ?: "Invalid bracket graph.",
        )
    }

    matches.forEach { relation ->
        val match = relation.match
        if (!isClientMatchId(match.id)) {
            return@forEach
        }
        val createMeta = stagedCreates[match.id] ?: return@forEach

        if (createMeta.creationContext == MatchCreateContext.SCHEDULE) {
            val start = match.start
            val end = match.end
            if (match.fieldId.normalizeMatchEditToken() == null || start == null || end == null) {
                return MatchEditValidationResult(
                    isValid = false,
                    errorMessage = "Schedule match #${match.matchId} requires field, start, and end.",
                )
            }
            if (end <= start) {
                return MatchEditValidationResult(
                    isValid = false,
                    errorMessage = "Schedule match #${match.matchId} requires end after start.",
                )
            }
        }

        if (isTournament) {
            val normalizedNode = graphValidation.normalizedById[match.id]
            val hasAnyLink = !match.winnerNextMatchId.normalizeMatchEditToken().isNullOrBlank() ||
                !match.loserNextMatchId.normalizeMatchEditToken().isNullOrBlank() ||
                !normalizedNode?.previousLeftId.normalizeMatchEditToken().isNullOrBlank() ||
                !normalizedNode?.previousRightId.normalizeMatchEditToken().isNullOrBlank()
            if (!hasAnyLink) {
                return MatchEditValidationResult(
                    isValid = false,
                    errorMessage = "Tournament match #${match.matchId} must include at least one bracket link.",
                )
            }
        }
    }
    return MatchEditValidationResult(isValid = true, errorMessage = "")
}

internal fun shouldResetBracketMatch(event: Event, match: MatchMVP): Boolean {
    return when {
        event.eventType == EventType.TOURNAMENT -> true
        event.eventType == EventType.LEAGUE && event.includePlayoffs -> isBracketMatch(match)
        else -> false
    }
}

internal fun isBracketMatch(match: MatchMVP): Boolean {
    return !match.previousLeftId.isNullOrBlank() ||
        !match.previousRightId.isNullOrBlank() ||
        !match.winnerNextMatchId.isNullOrBlank() ||
        !match.loserNextMatchId.isNullOrBlank()
}

internal fun MatchMVP.toEmptyBracketMatch(): MatchMVP = copy(
    officialId = null,
    teamOfficialId = null,
    team1Points = emptyList(),
    team2Points = emptyList(),
    setResults = emptyList(),
    locked = false,
)

private fun doMatchesOverlap(match1: MatchMVP, match2: MatchMVP): Boolean {
    val match1Start = match1.start ?: return false
    val match2Start = match2.start ?: return false
    val match1End = match1.end ?: return false
    val match2End = match2.end ?: return false

    return match1Start < match2End && match2Start < match1End
}

private fun String?.normalizeMatchEditToken(): String? =
    this?.trim()?.takeIf(String::isNotBlank)
