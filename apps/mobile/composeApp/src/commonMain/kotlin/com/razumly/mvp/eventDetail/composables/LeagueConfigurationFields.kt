package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.presentation.composables.DropdownOption
import com.razumly.mvp.core.presentation.composables.PlatformDropdown

private val bestOfOptions = listOf(
    DropdownOption("1", "Best of 1"),
    DropdownOption("3", "Best of 3"),
    DropdownOption("5", "Best of 5"),
)

@Composable
fun ColumnScope.LeagueConfigurationFields(
    leagueConfig: LeagueConfig,
    onLeagueConfigChange: (LeagueConfig) -> Unit,
) {
    val currentSets = normalizeSetCount(leagueConfig.setsPerMatch)

    Text("League Configuration", style = MaterialTheme.typography.titleMedium)

    LabeledCheckbox(
        checked = leagueConfig.usesSets,
        label = "Use set-based scoring",
        onCheckedChange = { checked ->
            if (checked) {
                onLeagueConfigChange(
                    leagueConfig.copy(
                        usesSets = true,
                        setsPerMatch = currentSets,
                        setDurationMinutes = leagueConfig.setDurationMinutes ?: 20,
                        pointsToVictory = normalizePoints(
                            leagueConfig.pointsToVictory,
                            currentSets
                        ),
                        matchDurationMinutes = 60,
                    )
                )
            } else {
                onLeagueConfigChange(
                    leagueConfig.copy(
                        usesSets = false,
                        setDurationMinutes = null,
                        setsPerMatch = null,
                        pointsToVictory = emptyList(),
                        matchDurationMinutes = leagueConfig.matchDurationMinutes,
                    )
                )
            }
        },
    )

    Text("League Scoring", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
    Text(
        text = if (leagueConfig.usesSets) "Set-based scoring enabled." else "Timed match scoring enabled.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 4.dp),
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        NumberInputField(
            modifier = Modifier.fillMaxWidth(),
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
    }

    if (leagueConfig.usesSets) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
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
                modifier = Modifier.weight(1f),
            )
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

        Text(
            "Points to Victory",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = 8.dp)
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
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
fun ColumnScope.LeaguePlayoffConfigurationFields(
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
            LabeledCheckbox(
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
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
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
                modifier = Modifier.weight(1f),
            )

            if (playoffConfig.doubleElimination) {
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
                    modifier = Modifier.weight(1f),
                )
            } else {
                Box(modifier = Modifier.weight(1f))
            }
        }

        Text("Winner Bracket Points", style = MaterialTheme.typography.bodyMedium)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val points = normalizePoints(
                playoffConfig.winnerBracketPointsToVictory,
                winnerSetCount
            )
            repeat(winnerSetCount) { index ->
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(0.48f),
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
            Text("Loser Bracket Points", style = MaterialTheme.typography.bodyMedium)
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val points = normalizePoints(
                    playoffConfig.loserBracketPointsToVictory,
                    loserSetCount
                )
                repeat(loserSetCount) { index ->
                    NumberInputField(
                        modifier = Modifier.fillMaxWidth(0.48f),
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
        }
    }
}

@Composable
private fun LabeledCheckbox(
    checked: Boolean,
    label: String,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Checkbox,
                onValueChange = onCheckedChange,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            enabled = enabled,
            onCheckedChange = null,
        )
        Text(label)
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
