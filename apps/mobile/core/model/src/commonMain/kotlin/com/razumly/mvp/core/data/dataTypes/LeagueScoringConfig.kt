package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class LeagueScoringConfig(
    val id: String,
    val pointsForWin: Int?,
    val pointsForDraw: Int?,
    val pointsForLoss: Int?,
    val pointsPerSetWin: Double?,
    val pointsPerSetLoss: Double?,
    val pointsPerGameWin: Double?,
    val pointsPerGameLoss: Double?,
    val pointsPerGoalScored: Double?,
    val pointsPerGoalConceded: Double?,
)

@Serializable
data class LeagueScoringConfigDTO(
    val pointsForWin: Int? = null,
    val pointsForDraw: Int? = null,
    val pointsForLoss: Int? = null,
    val pointsPerSetWin: Double? = null,
    val pointsPerSetLoss: Double? = null,
    val pointsPerGameWin: Double? = null,
    val pointsPerGameLoss: Double? = null,
    val pointsPerGoalScored: Double? = null,
    val pointsPerGoalConceded: Double? = null,
) {
    fun toLeagueScoringConfig(id: String): LeagueScoringConfig =
        LeagueScoringConfig(
            id = id,
            pointsForWin = pointsForWin,
            pointsForDraw = pointsForDraw,
            pointsForLoss = pointsForLoss,
            pointsPerSetWin = pointsPerSetWin,
            pointsPerSetLoss = pointsPerSetLoss,
            pointsPerGameWin = pointsPerGameWin,
            pointsPerGameLoss = pointsPerGameLoss,
            pointsPerGoalScored = pointsPerGoalScored,
            pointsPerGoalConceded = pointsPerGoalConceded,
        )
}
