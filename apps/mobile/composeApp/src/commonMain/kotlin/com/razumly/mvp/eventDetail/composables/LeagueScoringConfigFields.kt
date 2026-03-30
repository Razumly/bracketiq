package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.Sport
import com.razumly.mvp.core.presentation.composables.StandardTextField

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

    FlowRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        visibleNumericFields.forEach { field ->
            StandardTextField(
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
)
