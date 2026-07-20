package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP

internal enum class HostMatchScoreTeam {
    TEAM1,
    TEAM2,
}

internal data class HostMatchScoreDraft(
    val sequence: Int,
    val team1Score: Int,
    val team2Score: Int,
    val confirmed: Boolean,
)

internal data class HostMatchConfirmationResult(
    val drafts: List<HostMatchScoreDraft>,
    val errorMessage: String? = null,
)

internal data class HostMatchPolicyBuildResult(
    val snapshot: ResolvedMatchRulesMVP? = null,
    val errorMessage: String? = null,
)

internal fun normalizeHostMatchSegmentLabel(value: String, fallback: String): String {
    val normalized = value.trim().ifBlank { fallback.trim().ifBlank { "Segment" } }
    return normalized.replaceFirstChar { first -> first.uppercaseChar() }
}

internal fun resizeHostMatchTargetInputs(
    targets: List<String>,
    count: Int,
    fallback: Int,
): List<String> {
    val normalizedCount = count.coerceAtLeast(1)
    val next = targets.take(normalizedCount).toMutableList()
    val fill = next.lastOrNull()
        ?.trim()
        ?.toIntOrNull()
        ?.takeIf { target -> target > 0 }
        ?: fallback.coerceAtLeast(1)
    while (next.size < normalizedCount) {
        next += fill.toString()
    }
    return next
}

internal fun buildHostMatchScoreDrafts(
    match: MatchMVP,
    count: Int,
): List<HostMatchScoreDraft> {
    val normalizedCount = count.coerceAtLeast(1)
    val segmentsBySequence = match.segments.associateBy(MatchSegmentMVP::sequence)
    return List(normalizedCount) { index ->
        val sequence = index + 1
        val segment = segmentsBySequence[sequence]
        val team1Score = match.team1Id
            ?.let { teamId -> segment?.scores?.get(teamId) }
            ?: match.team1Points.getOrElse(index) { 0 }
        val team2Score = match.team2Id
            ?.let { teamId -> segment?.scores?.get(teamId) }
            ?: match.team2Points.getOrElse(index) { 0 }
        HostMatchScoreDraft(
            sequence = sequence,
            team1Score = team1Score.coerceAtLeast(0),
            team2Score = team2Score.coerceAtLeast(0),
            confirmed = segment?.status?.trim()?.uppercase() == "COMPLETE" ||
                match.setResults.getOrElse(index) { 0 } in 1..2,
        )
    }
}

internal fun resizeHostMatchScoreDrafts(
    drafts: List<HostMatchScoreDraft>,
    count: Int,
): List<HostMatchScoreDraft> {
    val normalizedCount = count.coerceAtLeast(1)
    val next = drafts.take(normalizedCount).toMutableList()
    while (next.size < normalizedCount) {
        val sequence = next.size + 1
        next += HostMatchScoreDraft(
            sequence = sequence,
            team1Score = 0,
            team2Score = 0,
            confirmed = false,
        )
    }
    return next.mapIndexed { index, draft -> draft.copy(sequence = index + 1) }
}

internal fun editHostMatchScoreDraft(
    drafts: List<HostMatchScoreDraft>,
    index: Int,
    team: HostMatchScoreTeam,
    score: Int,
): List<HostMatchScoreDraft> {
    if (index !in drafts.indices) return drafts
    val normalizedScore = score.coerceAtLeast(0)
    return drafts.mapIndexed { draftIndex, draft ->
        when {
            draftIndex == index -> when (team) {
                HostMatchScoreTeam.TEAM1 -> draft.copy(team1Score = normalizedScore, confirmed = false)
                HostMatchScoreTeam.TEAM2 -> draft.copy(team2Score = normalizedScore, confirmed = false)
            }

            draftIndex > index -> draft.copy(confirmed = false)
            else -> draft
        }
    }
}

internal fun canToggleHostMatchConfirmation(
    drafts: List<HostMatchScoreDraft>,
    index: Int,
    matchStarted: Boolean,
): Boolean {
    if (!matchStarted || index !in drafts.indices) return false
    return drafts.take(index).all(HostMatchScoreDraft::confirmed)
}

internal fun applyHostMatchConfirmation(
    drafts: List<HostMatchScoreDraft>,
    index: Int,
    checked: Boolean,
    scoringModel: String,
    pointTargets: List<Int>,
    supportsDraw: Boolean,
): HostMatchConfirmationResult {
    if (index !in drafts.indices) return HostMatchConfirmationResult(drafts)
    if (!checked) {
        return HostMatchConfirmationResult(
            drafts = drafts.mapIndexed { draftIndex, draft ->
                if (draftIndex >= index) draft.copy(confirmed = false) else draft
            },
        )
    }

    val target = drafts[index]
    val normalizedScoringModel = scoringModel.trim().uppercase()
    val hasValidScore = when (normalizedScoringModel) {
        "SETS" -> {
            val pointTarget = pointTargets.getOrNull(index)
                ?: pointTargets.lastOrNull()
                ?: 21
            isValidHostMatchFinalSetScore(
                team1Score = target.team1Score,
                team2Score = target.team2Score,
                target = pointTarget,
            )
        }

        "POINTS_ONLY" -> supportsDraw || target.team1Score != target.team2Score
        else -> true
    }
    if (!hasValidScore) {
        val message = if (normalizedScoringModel == "SETS") {
            "A set can only be confirmed at the victory target, or above it when the winner leads by 2."
        } else {
            "Match score cannot be tied."
        }
        return HostMatchConfirmationResult(drafts = drafts, errorMessage = message)
    }

    return HostMatchConfirmationResult(
        drafts = drafts.mapIndexed { draftIndex, draft ->
            if (draftIndex == index) draft.copy(confirmed = true) else draft
        },
    )
}

internal fun buildHostMatchPolicySnapshot(
    baseRules: ResolvedMatchRulesMVP,
    segmentLabel: String,
    segmentCount: Int,
    targetInputs: List<String>,
    segmentDurationMinutes: Int?,
    segmentDurationTouched: Boolean,
): HostMatchPolicyBuildResult {
    val scoringModel = baseRules.scoringModel
        .trim()
        .uppercase()
        .takeIf { model -> model in setOf("SETS", "PERIODS", "INNINGS", "POINTS_ONLY") }
        ?: "SETS"
    val normalizedCount = if (scoringModel == "POINTS_ONLY") 1 else segmentCount.coerceAtLeast(1)
    val targets = if (scoringModel == "SETS") {
        targetInputs
            .take(normalizedCount)
            .map { input -> input.trim().toIntOrNull()?.takeIf { target -> target > 0 } }
    } else {
        emptyList()
    }
    if (scoringModel == "SETS" && (targets.size != normalizedCount || targets.any { target -> target == null })) {
        return HostMatchPolicyBuildResult(errorMessage = "Enter a score limit for every segment.")
    }
    val validTargets = targets.filterNotNull()
    val normalizedDuration = segmentDurationMinutes?.takeIf { minutes -> minutes > 0 }
    if (scoringModel != "SETS" && baseRules.timekeeping.timerMode.trim().uppercase() != "NONE" && normalizedDuration == null) {
        return HostMatchPolicyBuildResult(errorMessage = "Enter the segment length in minutes.")
    }

    return HostMatchPolicyBuildResult(
        snapshot = baseRules.copy(
            scoringModel = scoringModel,
            segmentCount = normalizedCount,
            segmentLabel = normalizeHostMatchSegmentLabel(
                value = segmentLabel,
                fallback = when (scoringModel) {
                    "SETS" -> "Set"
                    "INNINGS" -> "Inning"
                    "POINTS_ONLY" -> "Total"
                    else -> "Period"
                },
            ),
            setPointTargets = validTargets,
            timekeeping = baseRules.timekeeping.copy(
                segmentDurationMinutes = if (scoringModel == "SETS") null else normalizedDuration,
                segmentDurationMinutesBySequence = if (segmentDurationTouched) {
                    emptyList()
                } else {
                    baseRules.timekeeping.segmentDurationMinutesBySequence
                },
            ),
        ),
    )
}

internal fun buildHostMatchScorePayload(
    match: MatchMVP,
    drafts: List<HostMatchScoreDraft>,
    rules: ResolvedMatchRulesMVP,
    matchStarted: Boolean,
    resultType: String,
    forfeitingEventTeamId: String?,
    statusReason: String,
    exceptionalActualEnd: String?,
): MatchMVP {
    val normalizedResultType = resultType.trim().uppercase().ifBlank { "REGULATION" }
    val exceptionalResult = normalizedResultType in setOf("FORFEIT", "NO_CONTEST", "SUSPENDED")
    val effectiveDrafts = if (matchStarted && !exceptionalResult) {
        drafts
    } else {
        drafts.map { draft -> draft.copy(confirmed = false) }
    }
    val existingSegmentsBySequence = match.segments.associateBy(MatchSegmentMVP::sequence)
    val segments = effectiveDrafts.map { draft ->
        val existing = existingSegmentsBySequence[draft.sequence]
        val scores = buildMap {
            match.team1Id?.takeIf(String::isNotBlank)?.let { teamId -> put(teamId, draft.team1Score) }
            match.team2Id?.takeIf(String::isNotBlank)?.let { teamId -> put(teamId, draft.team2Score) }
        }
        val winnerEventTeamId = if (draft.confirmed) {
            when {
                draft.team1Score > draft.team2Score -> match.team1Id
                draft.team2Score > draft.team1Score -> match.team2Id
                else -> null
            }
        } else {
            null
        }
        existing?.copy(
            status = when {
                draft.confirmed -> "COMPLETE"
                scores.values.any { score -> score > 0 } -> "IN_PROGRESS"
                else -> "NOT_STARTED"
            },
            scores = scores,
            winnerEventTeamId = winnerEventTeamId,
            endedAt = if (draft.confirmed) existing.endedAt else null,
            resultType = if (draft.confirmed) existing.resultType else null,
            statusReason = if (draft.confirmed) existing.statusReason else null,
        ) ?: MatchSegmentMVP(
            id = "${match.id}_segment_${draft.sequence}",
            eventId = match.eventId,
            matchId = match.id,
            sequence = draft.sequence,
            status = when {
                draft.confirmed -> "COMPLETE"
                scores.values.any { score -> score > 0 } -> "IN_PROGRESS"
                else -> "NOT_STARTED"
            },
            scores = scores,
            winnerEventTeamId = winnerEventTeamId,
        )
    }
    val team1Points = effectiveDrafts.map(HostMatchScoreDraft::team1Score)
    val team2Points = effectiveDrafts.map(HostMatchScoreDraft::team2Score)
    val setResults = segments.map { segment ->
        when (segment.winnerEventTeamId) {
            match.team1Id -> 1
            match.team2Id -> 2
            else -> 0
        }
    }
    val matchComplete = when (rules.scoringModel.trim().uppercase()) {
        "SETS" -> {
            val winsNeeded = ((rules.segmentCount + 1) / 2).coerceAtLeast(1)
            setResults.count { winner -> winner == 1 } >= winsNeeded ||
                setResults.count { winner -> winner == 2 } >= winsNeeded
        }

        else -> segments.isNotEmpty() && segments.all { segment -> segment.status == "COMPLETE" }
    }
    val completedWinner = when {
        !matchComplete -> null
        rules.scoringModel.trim().uppercase() == "SETS" -> {
            val team1Wins = setResults.count { winner -> winner == 1 }
            val team2Wins = setResults.count { winner -> winner == 2 }
            when {
                team1Wins > team2Wins -> match.team1Id
                team2Wins > team1Wins -> match.team2Id
                else -> null
            }
        }

        team1Points.sum() > team2Points.sum() -> match.team1Id
        team2Points.sum() > team1Points.sum() -> match.team2Id
        else -> null
    }
    val reason = statusReason.trim().takeIf(String::isNotBlank)

    val lifecycleMatch = when (normalizedResultType) {
        "FORFEIT" -> match.copy(
            status = "COMPLETE",
            resultStatus = "FINAL",
            resultType = "FORFEIT",
            winnerEventTeamId = when (forfeitingEventTeamId) {
                match.team1Id -> match.team2Id
                match.team2Id -> match.team1Id
                else -> null
            },
            statusReason = reason,
            actualEnd = match.actualEnd ?: exceptionalActualEnd,
            locked = true,
        )

        "NO_CONTEST" -> match.copy(
            status = "CANCELLED",
            resultStatus = "NO_CONTEST",
            resultType = "NO_CONTEST",
            winnerEventTeamId = null,
            statusReason = reason ?: "Cancelled",
            actualEnd = match.actualEnd ?: exceptionalActualEnd,
            locked = true,
        )

        "SUSPENDED" -> match.copy(
            status = "SUSPENDED",
            resultStatus = null,
            resultType = null,
            winnerEventTeamId = null,
            statusReason = reason ?: "Suspended",
        )

        else -> match.copy(
            status = if (matchStarted) {
                if (matchComplete) "COMPLETE" else "IN_PROGRESS"
            } else {
                "SCHEDULED"
            },
            resultStatus = if (matchComplete) match.resultStatus else null,
            resultType = null,
            winnerEventTeamId = completedWinner,
            statusReason = if (matchComplete) reason else null,
        )
    }

    return lifecycleMatch.copy(
        segments = segments,
        team1Points = team1Points,
        team2Points = team2Points,
        setResults = setResults,
    )
}

internal fun hostMatchStatusLabel(
    drafts: List<HostMatchScoreDraft>,
    rules: ResolvedMatchRulesMVP,
    matchStarted: Boolean,
    resultType: String,
): String {
    return when (resultType.trim().uppercase()) {
        "FORFEIT" -> "Forfeit"
        "NO_CONTEST" -> "Cancelled"
        "SUSPENDED" -> "Suspended"
        else -> {
            val complete = when (rules.scoringModel.trim().uppercase()) {
                "SETS" -> {
                    val winsNeeded = ((rules.segmentCount + 1) / 2).coerceAtLeast(1)
                    val team1Wins = drafts.count { draft -> draft.confirmed && draft.team1Score > draft.team2Score }
                    val team2Wins = drafts.count { draft -> draft.confirmed && draft.team2Score > draft.team1Score }
                    team1Wins >= winsNeeded || team2Wins >= winsNeeded
                }

                else -> drafts.isNotEmpty() && drafts.all(HostMatchScoreDraft::confirmed)
            }
            when {
                !matchStarted -> "Scheduled"
                complete -> "Complete"
                else -> "In progress"
            }
        }
    }
}

private fun isValidHostMatchFinalSetScore(
    team1Score: Int,
    team2Score: Int,
    target: Int,
): Boolean {
    val leaderScore = maxOf(team1Score.coerceAtLeast(0), team2Score.coerceAtLeast(0))
    val trailingScore = minOf(team1Score.coerceAtLeast(0), team2Score.coerceAtLeast(0))
    val requiredWinningScore = maxOf(target.coerceAtLeast(1), trailingScore + 2)
    return leaderScore == requiredWinningScore
}
