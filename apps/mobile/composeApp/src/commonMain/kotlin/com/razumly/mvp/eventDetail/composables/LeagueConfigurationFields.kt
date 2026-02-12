package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
    playoffConfig: TournamentConfig,
    onLeagueConfigChange: (LeagueConfig) -> Unit,
    onPlayoffConfigChange: (TournamentConfig) -> Unit,
) {
    val currentSets = normalizeSetCount(leagueConfig.setsPerMatch)

    Text("League Configuration", style = MaterialTheme.typography.titleMedium)

    NumberInputField(
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
        supportingText = "Minimum 1 game against each opponent",
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Checkbox(
            checked = leagueConfig.usesSets,
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
            }
        )
        Text("Use set-based scoring")
    }

    if (leagueConfig.usesSets) {
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
            modifier = Modifier.fillMaxWidth(),
        )

        NumberInputField(
            value = (leagueConfig.setDurationMinutes ?: 20).toString(),
            label = "Set Duration (minutes)",
            onValueChange = { newValue ->
                if (newValue.all { it.isDigit() }) {
                    onLeagueConfigChange(
                        leagueConfig.copy(setDurationMinutes = newValue.toIntOrNull())
                    )
                }
            },
            isError = false,
        )

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
            repeat(currentSets) { index ->
                NumberInputField(
                    value = normalizePoints(leagueConfig.pointsToVictory, currentSets)[index].toString(),
                    label = "Set ${index + 1}",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            val updated = normalizePoints(leagueConfig.pointsToVictory, currentSets)
                                .toMutableList()
                            updated[index] = newValue.toIntOrNull() ?: 0
                            onLeagueConfigChange(leagueConfig.copy(pointsToVictory = updated))
                        }
                    },
                    isError = false,
                )
            }
        }
    } else {
        NumberInputField(
            value = leagueConfig.matchDurationMinutes.toString(),
            label = "Match Duration (minutes)",
            onValueChange = { newValue ->
                if (newValue.all { it.isDigit() }) {
                    onLeagueConfigChange(
                        leagueConfig.copy(matchDurationMinutes = newValue.toIntOrNull() ?: 0)
                    )
                }
            },
            isError = false,
        )
    }

    NumberInputField(
        value = leagueConfig.restTimeMinutes.toString(),
        label = "Rest Time Between Matches (minutes)",
        onValueChange = { newValue ->
            if (newValue.all { it.isDigit() }) {
                onLeagueConfigChange(
                    leagueConfig.copy(restTimeMinutes = newValue.toIntOrNull() ?: 0)
                )
            }
        },
        isError = false,
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Checkbox(
            checked = leagueConfig.includePlayoffs,
            onCheckedChange = { checked ->
                onLeagueConfigChange(
                    leagueConfig.copy(
                        includePlayoffs = checked,
                        playoffTeamCount = if (checked) {
                            leagueConfig.playoffTeamCount ?: 4
                        } else {
                            null
                        },
                    )
                )
            }
        )
        Text("Include Playoffs")
    }

    if (leagueConfig.includePlayoffs) {
        NumberInputField(
            value = (leagueConfig.playoffTeamCount ?: 4).toString(),
            label = "Playoff Team Count",
            onValueChange = { newValue ->
                if (newValue.all { it.isDigit() }) {
                    onLeagueConfigChange(
                        leagueConfig.copy(playoffTeamCount = newValue.toIntOrNull())
                    )
                }
            },
            isError = false,
        )

        Text("Playoff Configuration", style = MaterialTheme.typography.titleSmall)

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Checkbox(
                checked = playoffConfig.doubleElimination,
                onCheckedChange = { checked ->
                    val updated = if (checked) {
                        playoffConfig.copy(
                            doubleElimination = true,
                            loserSetCount = normalizeSetCount(playoffConfig.loserSetCount),
                            loserBracketPointsToVictory = normalizePoints(
                                playoffConfig.loserBracketPointsToVictory,
                                normalizeSetCount(playoffConfig.loserSetCount)
                            )
                        )
                    } else {
                        playoffConfig.copy(
                            doubleElimination = false,
                            loserSetCount = 1,
                            loserBracketPointsToVictory = listOf(21),
                        )
                    }
                    onPlayoffConfigChange(updated)
                }
            )
            Text("Double Elimination")
        }

        if (leagueConfig.usesSets) {
            val winnerSetCount = normalizeSetCount(playoffConfig.winnerSetCount)
            val loserSetCount = normalizeSetCount(playoffConfig.loserSetCount)

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

            Text("Winner Bracket Points", style = MaterialTheme.typography.bodyMedium)
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                repeat(winnerSetCount) { index ->
                    val points = normalizePoints(
                        playoffConfig.winnerBracketPointsToVictory,
                        winnerSetCount
                    )
                    NumberInputField(
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

                Text("Loser Bracket Points", style = MaterialTheme.typography.bodyMedium)
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    repeat(loserSetCount) { index ->
                        val points = normalizePoints(
                            playoffConfig.loserBracketPointsToVictory,
                            loserSetCount
                        )
                        NumberInputField(
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

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Checkbox(
            checked = leagueConfig.doTeamsRef,
            onCheckedChange = { checked ->
                onLeagueConfigChange(leagueConfig.copy(doTeamsRef = checked))
            }
        )
        Text("Teams provide referees")
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
