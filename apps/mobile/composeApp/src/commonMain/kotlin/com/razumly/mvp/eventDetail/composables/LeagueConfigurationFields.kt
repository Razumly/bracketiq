package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow

private val bestOfOptions = listOf(
    DropdownOption("1", "Best of 1"),
    DropdownOption("3", "Best of 3"),
    DropdownOption("5", "Best of 5"),
)

@Composable
fun LeagueConfigurationFields(
    leagueConfig: LeagueConfig,
    onLeagueConfigChange: (LeagueConfig) -> Unit,
) {
    val currentSets = normalizeSetCount(leagueConfig.setsPerMatch)

    Text("League Configuration", style = MaterialTheme.typography.titleMedium)

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        NumberInputField(
            modifier = Modifier.weight(1f),
            value = leagueConfig.gamesPerOpponent.toString(),
            label = "Games per Opponent",
            onValueChange = { newValue ->
                if (newValue.all { it.isDigit() }) {
                    onLeagueConfigChange(
                        leagueConfig.copy(gamesPerOpponent = newValue.toIntOrNull() ?: 0)
                    )
                }
            },
            isError = false,
            supportingText = "Min 1",
        )
        if (leagueConfig.usesSets) {
            NumberInputField(
                modifier = Modifier.weight(1f),
                value = (leagueConfig.setDurationMinutes ?: 20).toString(),
                label = "Set Duration (min)",
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        onLeagueConfigChange(
                            leagueConfig.copy(setDurationMinutes = newValue.toIntOrNull())
                        )
                    }
                },
                isError = false,
            )
        } else {
            Box(modifier = Modifier.weight(1f))
        }
    }

    if (leagueConfig.usesSets) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PlatformDropdown(
                selectedValue = currentSets.toString(),
                onSelectionChange = { selected ->
                    val nextCount = normalizeSetCount(selected.toIntOrNull())
                    onLeagueConfigChange(
                        leagueConfig.copy(
                            setsPerMatch = nextCount,
                            pointsToVictory = normalizePoints(leagueConfig.pointsToVictory, nextCount),
                        )
                    )
                },
                options = bestOfOptions,
                label = "Sets per Match",
                modifier = Modifier.fillMaxWidth(0.48f),
            )
            val points = normalizePoints(leagueConfig.pointsToVictory, currentSets)
            repeat(currentSets) { index ->
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(0.48f),
                    value = points[index].toString(),
                    label = "Set ${index + 1}",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            val updated = points.toMutableList()
                            updated[index] = newValue.toIntOrNull() ?: 0
                            onLeagueConfigChange(leagueConfig.copy(pointsToVictory = updated))
                        }
                    },
                    isError = false,
                )
            }
        }

        if (!leagueConfig.includePlayoffs) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = leagueConfig.restTimeMinutes.toString(),
                    label = "Rest Time (min)",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            onLeagueConfigChange(
                                leagueConfig.copy(restTimeMinutes = newValue.toIntOrNull() ?: 0)
                            )
                        }
                    },
                    isError = false,
                )
                Box(modifier = Modifier.weight(1f))
            }
        }
    } else {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            NumberInputField(
                modifier = Modifier.weight(1f),
                value = leagueConfig.matchDurationMinutes.toString(),
                label = "Match Duration (min)",
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        onLeagueConfigChange(
                            leagueConfig.copy(matchDurationMinutes = newValue.toIntOrNull() ?: 0)
                        )
                    }
                },
                isError = false,
            )
            if (!leagueConfig.includePlayoffs) {
                NumberInputField(
                    modifier = Modifier.weight(1f),
                    value = leagueConfig.restTimeMinutes.toString(),
                    label = "Rest Time (min)",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            onLeagueConfigChange(
                                leagueConfig.copy(restTimeMinutes = newValue.toIntOrNull() ?: 0)
                            )
                        }
                    },
                    isError = false,
                )
            } else {
                Box(modifier = Modifier.weight(1f))
            }
        }
    }

}

@Composable
fun LeaguePlayoffConfigurationFields(
    leagueConfig: LeagueConfig,
    playoffConfig: TournamentConfig,
    onPlayoffConfigChange: (TournamentConfig) -> Unit,
) {
    if (!leagueConfig.includePlayoffs) return

    val winnerSetCount = normalizeSetCount(playoffConfig.winnerSetCount)
    val loserSetCount = normalizeSetCount(playoffConfig.loserSetCount)

    Text("Playoff Configuration", style = MaterialTheme.typography.titleSmall)

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(modifier = Modifier.weight(1f)) {
            LabeledCheckboxRow(
                checked = playoffConfig.doubleElimination,
                label = "Double elimination",
                onCheckedChange = { checked ->
                    val updated = if (checked) {
                        playoffConfig.copy(
                            doubleElimination = true,
                            loserSetCount = loserSetCount,
                            loserBracketPointsToVictory = normalizePoints(
                                playoffConfig.loserBracketPointsToVictory,
                                loserSetCount
                            ),
                        )
                    } else {
                        playoffConfig.copy(
                            doubleElimination = false,
                            loserSetCount = 1,
                            loserBracketPointsToVictory = listOf(21),
                        )
                    }
                    onPlayoffConfigChange(updated)
                },
            )
        }
        NumberInputField(
            modifier = Modifier.weight(1f),
            value = playoffConfig.restTimeMinutes.toString(),
            label = "Rest Time (min)",
            onValueChange = { newValue ->
                if (newValue.all { it.isDigit() }) {
                    onPlayoffConfigChange(
                        playoffConfig.copy(restTimeMinutes = newValue.toIntOrNull() ?: 0)
                    )
                }
            },
            isError = false,
        )
    }

    if (leagueConfig.usesSets) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PlatformDropdown(
                    selectedValue = winnerSetCount.toString(),
                    onSelectionChange = { selected ->
                        val nextCount = normalizeSetCount(selected.toIntOrNull())
                        onPlayoffConfigChange(
                            playoffConfig.copy(
                                winnerSetCount = nextCount,
                                winnerBracketPointsToVictory = normalizePoints(
                                    playoffConfig.winnerBracketPointsToVictory,
                                    nextCount
                                )
                            )
                        )
                    },
                    options = bestOfOptions,
                    label = "Winner Set Count",
                    modifier = Modifier.fillMaxWidth(),
                )

                val points = normalizePoints(
                    playoffConfig.winnerBracketPointsToVictory,
                    winnerSetCount
                )
                repeat(winnerSetCount) { index ->
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(),
                        value = points[index].toString(),
                        label = "Set ${index + 1}",
                        onValueChange = { newValue ->
                            if (newValue.all { it.isDigit() }) {
                                val updated = points.toMutableList()
                                updated[index] = newValue.toIntOrNull() ?: 0
                                onPlayoffConfigChange(
                                    playoffConfig.copy(winnerBracketPointsToVictory = updated)
                                )
                            }
                        },
                        isError = false,
                    )
                }
            }

            if (playoffConfig.doubleElimination) {
                VerticalDivider(
                    modifier = Modifier.fillMaxHeight(),
                    color = MaterialTheme.colorScheme.outlineVariant,
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    PlatformDropdown(
                        selectedValue = loserSetCount.toString(),
                        onSelectionChange = { selected ->
                            val nextCount = normalizeSetCount(selected.toIntOrNull())
                            onPlayoffConfigChange(
                                playoffConfig.copy(
                                    loserSetCount = nextCount,
                                    loserBracketPointsToVictory = normalizePoints(
                                        playoffConfig.loserBracketPointsToVictory,
                                        nextCount
                                    )
                                )
                            )
                        },
                        options = bestOfOptions,
                        label = "Loser Set Count",
                        modifier = Modifier.fillMaxWidth(),
                    )

                    val points = normalizePoints(
                        playoffConfig.loserBracketPointsToVictory,
                        loserSetCount
                    )
                    repeat(loserSetCount) { index ->
                        NumberInputField(
                            modifier = Modifier.fillMaxWidth(),
                            value = points[index].toString(),
                            label = "Set ${index + 1}",
                            onValueChange = { newValue ->
                                if (newValue.all { it.isDigit() }) {
                                    val updated = points.toMutableList()
                                    updated[index] = newValue.toIntOrNull() ?: 0
                                    onPlayoffConfigChange(
                                        playoffConfig.copy(loserBracketPointsToVictory = updated)
                                    )
                                }
                            },
                            isError = false,
                        )
                    }
                }
            } else {
                Box(modifier = Modifier.weight(1f))
            }
        }
    }
}

private fun normalizeSetCount(value: Int?): Int = when (value) {
    1, 3, 5 -> value
    else -> 1
}

private fun normalizePoints(points: List<Int>, targetLength: Int): List<Int> {
    val safeLength = targetLength.coerceAtLeast(1)
    val trimmed = points.take(safeLength).toMutableList()
    while (trimmed.size < safeLength) {
        trimmed.add(21)
    }
    return trimmed
}
