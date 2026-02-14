package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.presentation.composables.PlatformTextField

private val integerInputPattern = Regex("^-?\\d*$")
private val decimalInputPattern = Regex("^-?\\d*(\\.\\d*)?$")

private data class NumericScoringField(
    val label: String,
    val isEnabledForSport: Sport.() -> Boolean,
    val keyboardType: String,
    val readValue: (LeagueScoringConfigDTO) -> String,
    val acceptsInput: (String) -> Boolean,
    val applyValue: (LeagueScoringConfigDTO, String) -> LeagueScoringConfigDTO,
)

private data class BooleanScoringField(
    val label: String,
    val isEnabledForSport: Sport.() -> Boolean,
    val readValue: (LeagueScoringConfigDTO) -> Boolean,
    val applyValue: (LeagueScoringConfigDTO, Boolean) -> LeagueScoringConfigDTO,
)

@Composable
fun LeagueScoringConfigFields(
    config: LeagueScoringConfigDTO,
    sport: Sport?,
    onConfigChange: (LeagueScoringConfigDTO) -> Unit,
) {
    val visibleNumericFields = remember(sport) {
        numericScoringFields.filter { field ->
            shouldShowField(sport, field.isEnabledForSport)
        }
    }
    val visibleBooleanFields = remember(sport) {
        booleanScoringFields.filter { field ->
            shouldShowField(sport, field.isEnabledForSport)
        }
    }

    Text(
        text = "League Scoring Configuration",
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(top = 8.dp),
    )
    Text(
        text = "Configure scoring rules for this league. Fields shown are based on the selected sport.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        visibleNumericFields.forEach { field ->
            PlatformTextField(
                value = field.readValue(config),
                onValueChange = { updated ->
                    if (field.acceptsInput(updated)) {
                        onConfigChange(field.applyValue(config, updated))
                    }
                },
                modifier = Modifier.fillMaxWidth(0.48f),
                label = field.label,
                keyboardType = field.keyboardType,
            )
        }
    }

    if (visibleBooleanFields.isNotEmpty()) {
        FlowRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            visibleBooleanFields.forEach { field ->
                Row(
                    modifier = Modifier.fillMaxWidth(0.48f),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = field.readValue(config),
                        onCheckedChange = { checked ->
                            onConfigChange(field.applyValue(config, checked))
                        },
                    )
                    Text(
                        text = field.label,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}

private fun shouldShowField(
    sport: Sport?,
    selector: Sport.() -> Boolean,
): Boolean = sport?.selector() ?: true

private fun intField(
    label: String,
    enabledSelector: Sport.() -> Boolean,
    getter: (LeagueScoringConfigDTO) -> Int?,
    setter: (LeagueScoringConfigDTO, Int?) -> LeagueScoringConfigDTO,
): NumericScoringField = NumericScoringField(
    label = label,
    isEnabledForSport = enabledSelector,
    keyboardType = "number",
    readValue = { config -> getter(config)?.toString().orEmpty() },
    acceptsInput = { input -> input.isEmpty() || input == "-" || integerInputPattern.matches(input) },
    applyValue = { config, input ->
        setter(config, input.toIntOrNull())
    },
)

private fun decimalField(
    label: String,
    enabledSelector: Sport.() -> Boolean,
    getter: (LeagueScoringConfigDTO) -> Double?,
    setter: (LeagueScoringConfigDTO, Double?) -> LeagueScoringConfigDTO,
): NumericScoringField = NumericScoringField(
    label = label,
    isEnabledForSport = enabledSelector,
    keyboardType = "default",
    readValue = { config -> getter(config).toEditableDecimalString() },
    acceptsInput = { input -> input.isEmpty() || input == "-" || decimalInputPattern.matches(input) },
    applyValue = { config, input ->
        setter(config, input.toDoubleOrNull())
    },
)

private fun booleanField(
    label: String,
    enabledSelector: Sport.() -> Boolean,
    getter: (LeagueScoringConfigDTO) -> Boolean,
    setter: (LeagueScoringConfigDTO, Boolean) -> LeagueScoringConfigDTO,
): BooleanScoringField = BooleanScoringField(
    label = label,
    isEnabledForSport = enabledSelector,
    readValue = getter,
    applyValue = setter,
)

private fun Double?.toEditableDecimalString(): String {
    if (this == null) return ""
    val asLong = this.toLong()
    return if (this == asLong.toDouble()) {
        asLong.toString()
    } else {
        this.toString()
    }
}

private val numericScoringFields = listOf(
    intField(
        label = "Points for Win",
        enabledSelector = { usePointsForWin },
        getter = { it.pointsForWin },
        setter = { config, value -> config.copy(pointsForWin = value) },
    ),
    intField(
        label = "Points for Draw",
        enabledSelector = { usePointsForDraw },
        getter = { it.pointsForDraw },
        setter = { config, value -> config.copy(pointsForDraw = value) },
    ),
    intField(
        label = "Points for Loss",
        enabledSelector = { usePointsForLoss },
        getter = { it.pointsForLoss },
        setter = { config, value -> config.copy(pointsForLoss = value) },
    ),
    intField(
        label = "Points for Forfeit Win",
        enabledSelector = { usePointsForForfeitWin },
        getter = { it.pointsForForfeitWin },
        setter = { config, value -> config.copy(pointsForForfeitWin = value) },
    ),
    intField(
        label = "Points for Forfeit Loss",
        enabledSelector = { usePointsForForfeitLoss },
        getter = { it.pointsForForfeitLoss },
        setter = { config, value -> config.copy(pointsForForfeitLoss = value) },
    ),
    decimalField(
        label = "Points per Set Win",
        enabledSelector = { usePointsPerSetWin },
        getter = { it.pointsPerSetWin },
        setter = { config, value -> config.copy(pointsPerSetWin = value) },
    ),
    decimalField(
        label = "Points per Set Loss",
        enabledSelector = { usePointsPerSetLoss },
        getter = { it.pointsPerSetLoss },
        setter = { config, value -> config.copy(pointsPerSetLoss = value) },
    ),
    decimalField(
        label = "Points per Game Win",
        enabledSelector = { usePointsPerGameWin },
        getter = { it.pointsPerGameWin },
        setter = { config, value -> config.copy(pointsPerGameWin = value) },
    ),
    decimalField(
        label = "Points per Game Loss",
        enabledSelector = { usePointsPerGameLoss },
        getter = { it.pointsPerGameLoss },
        setter = { config, value -> config.copy(pointsPerGameLoss = value) },
    ),
    decimalField(
        label = "Points per Goal Scored",
        enabledSelector = { usePointsPerGoalScored },
        getter = { it.pointsPerGoalScored },
        setter = { config, value -> config.copy(pointsPerGoalScored = value) },
    ),
    decimalField(
        label = "Points per Goal Conceded",
        enabledSelector = { usePointsPerGoalConceded },
        getter = { it.pointsPerGoalConceded },
        setter = { config, value -> config.copy(pointsPerGoalConceded = value) },
    ),
    intField(
        label = "Max Goal Bonus Points",
        enabledSelector = { useMaxGoalBonusPoints },
        getter = { it.maxGoalBonusPoints },
        setter = { config, value -> config.copy(maxGoalBonusPoints = value) },
    ),
    intField(
        label = "Min Goal Bonus Threshold",
        enabledSelector = { useMinGoalBonusThreshold },
        getter = { it.minGoalBonusThreshold },
        setter = { config, value -> config.copy(minGoalBonusThreshold = value) },
    ),
    decimalField(
        label = "Points per Goal Difference",
        enabledSelector = { usePointsPerGoalDifference },
        getter = { it.pointsPerGoalDifference },
        setter = { config, value -> config.copy(pointsPerGoalDifference = value) },
    ),
    intField(
        label = "Max Goal Difference Points",
        enabledSelector = { useMaxGoalDifferencePoints },
        getter = { it.maxGoalDifferencePoints },
        setter = { config, value -> config.copy(maxGoalDifferencePoints = value) },
    ),
    decimalField(
        label = "Points Penalty per Goal Difference",
        enabledSelector = { usePointsPenaltyPerGoalDifference },
        getter = { it.pointsPenaltyPerGoalDifference },
        setter = { config, value -> config.copy(pointsPenaltyPerGoalDifference = value) },
    ),
    decimalField(
        label = "Points for Participation",
        enabledSelector = { usePointsForParticipation },
        getter = { it.pointsForParticipation },
        setter = { config, value -> config.copy(pointsForParticipation = value) },
    ),
    decimalField(
        label = "Points for No Show",
        enabledSelector = { usePointsForNoShow },
        getter = { it.pointsForNoShow },
        setter = { config, value -> config.copy(pointsForNoShow = value) },
    ),
    decimalField(
        label = "Points for Win Streak Bonus",
        enabledSelector = { usePointsForWinStreakBonus },
        getter = { it.pointsForWinStreakBonus },
        setter = { config, value -> config.copy(pointsForWinStreakBonus = value) },
    ),
    intField(
        label = "Win Streak Threshold",
        enabledSelector = { useWinStreakThreshold },
        getter = { it.winStreakThreshold },
        setter = { config, value -> config.copy(winStreakThreshold = value) },
    ),
    decimalField(
        label = "Points for Overtime Win",
        enabledSelector = { usePointsForOvertimeWin },
        getter = { it.pointsForOvertimeWin },
        setter = { config, value -> config.copy(pointsForOvertimeWin = value) },
    ),
    decimalField(
        label = "Points for Overtime Loss",
        enabledSelector = { usePointsForOvertimeLoss },
        getter = { it.pointsForOvertimeLoss },
        setter = { config, value -> config.copy(pointsForOvertimeLoss = value) },
    ),
    decimalField(
        label = "Points per Red Card",
        enabledSelector = { usePointsPerRedCard },
        getter = { it.pointsPerRedCard },
        setter = { config, value -> config.copy(pointsPerRedCard = value) },
    ),
    decimalField(
        label = "Points per Yellow Card",
        enabledSelector = { usePointsPerYellowCard },
        getter = { it.pointsPerYellowCard },
        setter = { config, value -> config.copy(pointsPerYellowCard = value) },
    ),
    decimalField(
        label = "Points per Penalty",
        enabledSelector = { usePointsPerPenalty },
        getter = { it.pointsPerPenalty },
        setter = { config, value -> config.copy(pointsPerPenalty = value) },
    ),
    intField(
        label = "Max Penalty Deductions",
        enabledSelector = { useMaxPenaltyDeductions },
        getter = { it.maxPenaltyDeductions },
        setter = { config, value -> config.copy(maxPenaltyDeductions = value) },
    ),
    decimalField(
        label = "Max Points per Match",
        enabledSelector = { useMaxPointsPerMatch },
        getter = { it.maxPointsPerMatch },
        setter = { config, value -> config.copy(maxPointsPerMatch = value) },
    ),
    decimalField(
        label = "Min Points per Match",
        enabledSelector = { useMinPointsPerMatch },
        getter = { it.minPointsPerMatch },
        setter = { config, value -> config.copy(minPointsPerMatch = value) },
    ),
    decimalField(
        label = "Bonus Points for Comeback Win",
        enabledSelector = { useBonusPointsForComebackWin },
        getter = { it.bonusPointsForComebackWin },
        setter = { config, value -> config.copy(bonusPointsForComebackWin = value) },
    ),
    intField(
        label = "High Scoring Threshold",
        enabledSelector = { useHighScoringThreshold },
        getter = { it.highScoringThreshold },
        setter = { config, value -> config.copy(highScoringThreshold = value) },
    ),
    decimalField(
        label = "Bonus Points for High Scoring Match",
        enabledSelector = { useBonusPointsForHighScoringMatch },
        getter = { it.bonusPointsForHighScoringMatch },
        setter = { config, value -> config.copy(bonusPointsForHighScoringMatch = value) },
    ),
    decimalField(
        label = "Penalty Points for Unsporting Behavior",
        enabledSelector = { usePenaltyPointsUnsporting },
        getter = { it.penaltyPointsForUnsportingBehavior },
        setter = { config, value -> config.copy(penaltyPointsForUnsportingBehavior = value) },
    ),
    intField(
        label = "Point Precision",
        enabledSelector = { usePointPrecision },
        getter = { it.pointPrecision },
        setter = { config, value -> config.copy(pointPrecision = value) },
    ),
)

private val booleanScoringFields = listOf(
    booleanField(
        label = "Apply Shutout Only If Win",
        enabledSelector = { useApplyShutoutOnlyIfWin },
        getter = { it.applyShutoutOnlyIfWin },
        setter = { config, value -> config.copy(applyShutoutOnlyIfWin = value) },
    ),
    booleanField(
        label = "Overtime Enabled",
        enabledSelector = { useOvertimeEnabled },
        getter = { it.overtimeEnabled },
        setter = { config, value -> config.copy(overtimeEnabled = value) },
    ),
    booleanField(
        label = "Goal Difference Tiebreaker",
        enabledSelector = { useGoalDifferenceTiebreaker },
        getter = { it.goalDifferenceTiebreaker },
        setter = { config, value -> config.copy(goalDifferenceTiebreaker = value) },
    ),
    booleanField(
        label = "Head-to-Head Tiebreaker",
        enabledSelector = { useHeadToHeadTiebreaker },
        getter = { it.headToHeadTiebreaker },
        setter = { config, value -> config.copy(headToHeadTiebreaker = value) },
    ),
    booleanField(
        label = "Total Goals Tiebreaker",
        enabledSelector = { useTotalGoalsTiebreaker },
        getter = { it.totalGoalsTiebreaker },
        setter = { config, value -> config.copy(totalGoalsTiebreaker = value) },
    ),
    booleanField(
        label = "Enable Bonus for Comeback Win",
        enabledSelector = { useEnableBonusForComebackWin },
        getter = { it.enableBonusForComebackWin },
        setter = { config, value -> config.copy(enableBonusForComebackWin = value) },
    ),
    booleanField(
        label = "Enable Bonus for High Scoring Match",
        enabledSelector = { useEnableBonusForHighScoringMatch },
        getter = { it.enableBonusForHighScoringMatch },
        setter = { config, value -> config.copy(enableBonusForHighScoringMatch = value) },
    ),
    booleanField(
        label = "Enable Penalty for Unsporting Behavior",
        enabledSelector = { useEnablePenaltyUnsporting },
        getter = { it.enablePenaltyForUnsportingBehavior },
        setter = { config, value -> config.copy(enablePenaltyForUnsportingBehavior = value) },
    ),
)
