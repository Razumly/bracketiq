package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Sport
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SportsResponseDto(
    val sports: List<SportApiDto> = emptyList(),
)

@Serializable
data class SportApiDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val usePointsForWin: Boolean? = null,
    val usePointsForDraw: Boolean? = null,
    val usePointsForLoss: Boolean? = null,
    val usePointsForForfeitWin: Boolean? = null,
    val usePointsForForfeitLoss: Boolean? = null,
    val usePointsPerSetWin: Boolean? = null,
    val usePointsPerSetLoss: Boolean? = null,
    val usePointsPerGameWin: Boolean? = null,
    val usePointsPerGameLoss: Boolean? = null,
    val usePointsPerGoalScored: Boolean? = null,
    val usePointsPerGoalConceded: Boolean? = null,
    val useMaxGoalBonusPoints: Boolean? = null,
    val useMinGoalBonusThreshold: Boolean? = null,
    val usePointsForShutout: Boolean? = null,
    val usePointsForCleanSheet: Boolean? = null,
    val useApplyShutoutOnlyIfWin: Boolean? = null,
    val usePointsPerGoalDifference: Boolean? = null,
    val useMaxGoalDifferencePoints: Boolean? = null,
    val usePointsPenaltyPerGoalDifference: Boolean? = null,
    val usePointsForParticipation: Boolean? = null,
    val usePointsForNoShow: Boolean? = null,
    val usePointsForWinStreakBonus: Boolean? = null,
    val useWinStreakThreshold: Boolean? = null,
    val usePointsForOvertimeWin: Boolean? = null,
    val usePointsForOvertimeLoss: Boolean? = null,
    val useOvertimeEnabled: Boolean? = null,
    val usePointsPerRedCard: Boolean? = null,
    val usePointsPerYellowCard: Boolean? = null,
    val usePointsPerPenalty: Boolean? = null,
    val useMaxPenaltyDeductions: Boolean? = null,
    val useMaxPointsPerMatch: Boolean? = null,
    val useMinPointsPerMatch: Boolean? = null,
    val useGoalDifferenceTiebreaker: Boolean? = null,
    val useHeadToHeadTiebreaker: Boolean? = null,
    val useTotalGoalsTiebreaker: Boolean? = null,
    val useEnableBonusForComebackWin: Boolean? = null,
    val useBonusPointsForComebackWin: Boolean? = null,
    val useEnableBonusForHighScoringMatch: Boolean? = null,
    val useHighScoringThreshold: Boolean? = null,
    val useBonusPointsForHighScoringMatch: Boolean? = null,
    val useEnablePenaltyUnsporting: Boolean? = null,
    val usePenaltyPointsUnsporting: Boolean? = null,
    val usePointPrecision: Boolean? = null,
) {
    fun toSportOrNull(): Sport? {
        val resolvedId = id ?: legacyId ?: name
        val resolvedName = name ?: resolvedId
        if (resolvedId.isNullOrBlank() || resolvedName.isNullOrBlank()) {
            return null
        }

        return Sport(
            id = resolvedId,
            name = resolvedName,
            usePointsForWin = usePointsForWin ?: false,
            usePointsForDraw = usePointsForDraw ?: false,
            usePointsForLoss = usePointsForLoss ?: false,
            usePointsForForfeitWin = usePointsForForfeitWin ?: false,
            usePointsForForfeitLoss = usePointsForForfeitLoss ?: false,
            usePointsPerSetWin = usePointsPerSetWin ?: false,
            usePointsPerSetLoss = usePointsPerSetLoss ?: false,
            usePointsPerGameWin = usePointsPerGameWin ?: false,
            usePointsPerGameLoss = usePointsPerGameLoss ?: false,
            usePointsPerGoalScored = usePointsPerGoalScored ?: false,
            usePointsPerGoalConceded = usePointsPerGoalConceded ?: false,
            useMaxGoalBonusPoints = useMaxGoalBonusPoints ?: false,
            useMinGoalBonusThreshold = useMinGoalBonusThreshold ?: false,
            usePointsForShutout = usePointsForShutout ?: false,
            usePointsForCleanSheet = usePointsForCleanSheet ?: false,
            useApplyShutoutOnlyIfWin = useApplyShutoutOnlyIfWin ?: false,
            usePointsPerGoalDifference = usePointsPerGoalDifference ?: false,
            useMaxGoalDifferencePoints = useMaxGoalDifferencePoints ?: false,
            usePointsPenaltyPerGoalDifference = usePointsPenaltyPerGoalDifference ?: false,
            usePointsForParticipation = usePointsForParticipation ?: false,
            usePointsForNoShow = usePointsForNoShow ?: false,
            usePointsForWinStreakBonus = usePointsForWinStreakBonus ?: false,
            useWinStreakThreshold = useWinStreakThreshold ?: false,
            usePointsForOvertimeWin = usePointsForOvertimeWin ?: false,
            usePointsForOvertimeLoss = usePointsForOvertimeLoss ?: false,
            useOvertimeEnabled = useOvertimeEnabled ?: false,
            usePointsPerRedCard = usePointsPerRedCard ?: false,
            usePointsPerYellowCard = usePointsPerYellowCard ?: false,
            usePointsPerPenalty = usePointsPerPenalty ?: false,
            useMaxPenaltyDeductions = useMaxPenaltyDeductions ?: false,
            useMaxPointsPerMatch = useMaxPointsPerMatch ?: false,
            useMinPointsPerMatch = useMinPointsPerMatch ?: false,
            useGoalDifferenceTiebreaker = useGoalDifferenceTiebreaker ?: false,
            useHeadToHeadTiebreaker = useHeadToHeadTiebreaker ?: false,
            useTotalGoalsTiebreaker = useTotalGoalsTiebreaker ?: false,
            useEnableBonusForComebackWin = useEnableBonusForComebackWin ?: false,
            useBonusPointsForComebackWin = useBonusPointsForComebackWin ?: false,
            useEnableBonusForHighScoringMatch = useEnableBonusForHighScoringMatch ?: false,
            useHighScoringThreshold = useHighScoringThreshold ?: false,
            useBonusPointsForHighScoringMatch = useBonusPointsForHighScoringMatch ?: false,
            useEnablePenaltyUnsporting = useEnablePenaltyUnsporting ?: false,
            usePenaltyPointsUnsporting = usePenaltyPointsUnsporting ?: false,
            usePointPrecision = usePointPrecision ?: false,
        )
    }
}
