package com.razumly.mvp.eventDetail.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.razumly.mvp.core.presentation.composables.StandardTextField
import com.razumly.mvp.eventDetail.shared.FormSectionDivider
import com.razumly.mvp.eventDetail.shared.LabeledCheckboxRow

private val bestOfOptions = listOf(
    DropdownOption("1", "Best of 1"),
    DropdownOption("3", "Best of 3"),
    DropdownOption("5", "Best of 5"),
)

@Composable
fun LeagueConfigurationFields(
    title: String = "League Configuration",
    leagueConfig: LeagueConfig,
    onLeagueConfigChange: (LeagueConfig) -> Unit,
) {
    val currentSets = normalizeSetCount(leagueConfig.setsPerMatch)

    ConfigurationHeader(title)

    TwoColumnRow(
        first = {
            NumberInputField(
                modifier = Modifier.fillMaxWidth(),
                value = leagueConfig.gamesPerOpponent.toString(),
                label = "Games per Opponent *",
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        onLeagueConfigChange(
                            leagueConfig.copy(gamesPerOpponent = newValue.toIntOrNull() ?: 0)
                        )
                    }
                },
                isError = leagueConfig.gamesPerOpponent < 1,
                errorMessage = "Must be at least 1.",
                showZero = true,
            )
        },
        second = {
            NumberInputField(
                modifier = Modifier.fillMaxWidth(),
                value = leagueConfig.restTimeMinutes.toString(),
                label = "Rest Time (min) *",
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        onLeagueConfigChange(
                            leagueConfig.copy(restTimeMinutes = newValue.toIntOrNull() ?: 0)
                        )
                    }
                },
                isError = false,
                showZero = true,
            )
        },
    )

    if (leagueConfig.usesSets) {
        TwoColumnRow(
            first = {
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
                    label = "Sets per Match *",
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            second = {
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(),
                    value = leagueConfig.setDurationMinutes?.toString().orEmpty(),
                    label = "Set Duration (min) *",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            onLeagueConfigChange(
                                leagueConfig.copy(setDurationMinutes = newValue.toIntOrNull())
                            )
                        }
                    },
                    isError = (leagueConfig.setDurationMinutes ?: 0) < 5,
                    errorMessage = "Set duration should be at least 5 minutes.",
                    showZero = true,
                )
            },
        )

        Text("Points to Victory", style = MaterialTheme.typography.titleSmall)
        val points = normalizePoints(leagueConfig.pointsToVictory, currentSets)
        TwoColumnPointInputs(points.size) { index ->
            NumberInputField(
                modifier = Modifier.fillMaxWidth(),
                value = points[index].toString(),
                label = "Set ${index + 1} *",
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        val updated = points.toMutableList()
                        updated[index] = newValue.toIntOrNull() ?: 0
                        onLeagueConfigChange(leagueConfig.copy(pointsToVictory = updated))
                    }
                },
                isError = points[index] <= 0,
                errorMessage = "Must be greater than 0.",
                showZero = true,
            )
        }
    } else {
        TwoColumnRow(
            first = {
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(),
                    value = leagueConfig.matchDurationMinutes?.toString().orEmpty(),
                    label = "Match Duration (min) *",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            onLeagueConfigChange(
                                leagueConfig.copy(matchDurationMinutes = newValue.toIntOrNull())
                            )
                        }
                    },
                    isError = (leagueConfig.matchDurationMinutes ?: 0) < 1,
                    errorMessage = "Match duration should be at least 1 minute.",
                    showZero = true,
                )
            },
        )
    }
}

@Composable
private fun ConfigurationHeader(title: String) {
    FormSectionDivider()
    Text(title, style = MaterialTheme.typography.titleMedium)
}

@Composable
private fun TwoColumnRow(
    first: @Composable () -> Unit,
    second: @Composable () -> Unit = {},
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(modifier = Modifier.weight(1f)) {
            first()
        }
        Box(modifier = Modifier.weight(1f)) {
            second()
        }
    }
}

@Composable
private fun TwoColumnPointInputs(
    count: Int,
    content: @Composable (Int) -> Unit,
) {
    var index = 0
    while (index < count) {
        val firstIndex = index
        val secondIndex = index + 1
        TwoColumnRow(
            first = { content(firstIndex) },
            second = {
                if (secondIndex < count) {
                    content(secondIndex)
                }
            },
        )
        index += 2
    }
}

@Composable
fun LeaguePlayoffConfigurationFields(
    leagueConfig: LeagueConfig,
    playoffConfig: TournamentConfig,
    onPlayoffConfigChange: (TournamentConfig) -> Unit,
    showEliminationControl: Boolean = true,
) {
    if (!leagueConfig.includePlayoffs) return

    TournamentConfigurationFields(
        title = "Playoff Configuration",
        usesSets = leagueConfig.usesSets,
        tournamentConfig = playoffConfig,
        onTournamentConfigChange = onPlayoffConfigChange,
        showPrize = false,
        showEliminationControl = showEliminationControl,
    )
}

@Composable
fun TournamentConfigurationFields(
    title: String = "Tournament Configuration",
    usesSets: Boolean,
    tournamentConfig: TournamentConfig,
    onTournamentConfigChange: (TournamentConfig) -> Unit,
    showPrize: Boolean = true,
    showEliminationControl: Boolean = true,
) {
    val playoffConfig = tournamentConfig
    val onPlayoffConfigChange = onTournamentConfigChange

    val winnerSetCount = normalizeSetCount(playoffConfig.winnerSetCount)
    val loserSetCount = normalizeSetCount(playoffConfig.loserSetCount)

    ConfigurationHeader(title)

    TwoColumnRow(
        first = {
            if (showEliminationControl) LabeledCheckboxRow(
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
        },
        second = {
            NumberInputField(
                modifier = Modifier.fillMaxWidth(),
                value = playoffConfig.restTimeMinutes.toString(),
                label = "Rest Time (min) *",
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        onPlayoffConfigChange(
                            playoffConfig.copy(restTimeMinutes = newValue.toIntOrNull() ?: 0)
                        )
                    }
                },
                isError = false,
                showZero = true,
            )
        },
    )

    TwoColumnRow(
        first = {
            if (usesSets) {
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(),
                    value = playoffConfig.setDurationMinutes?.toString().orEmpty(),
                    label = "Set Duration (min) *",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            onPlayoffConfigChange(
                                playoffConfig.copy(
                                    usesSets = true,
                                    setDurationMinutes = newValue.toIntOrNull(),
                                    matchDurationMinutes = null,
                                ),
                            )
                        }
                    },
                    isError = (playoffConfig.setDurationMinutes ?: 0) < 5,
                    errorMessage = "Set duration should be at least 5 minutes.",
                    showZero = true,
                )
            } else {
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(),
                    value = playoffConfig.matchDurationMinutes?.toString().orEmpty(),
                    label = "Match Duration (min) *",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            onPlayoffConfigChange(
                                playoffConfig.copy(
                                    usesSets = false,
                                    matchDurationMinutes = newValue.toIntOrNull(),
                                    setDurationMinutes = null,
                                ),
                            )
                        }
                    },
                    isError = (playoffConfig.matchDurationMinutes ?: 0) < 1,
                    errorMessage = "Match duration should be at least 1 minute.",
                    showZero = true,
                )
            }
        },
        second = {
            if (showPrize) {
                StandardTextField(
                    value = playoffConfig.prize,
                    onValueChange = { newValue ->
                        if (newValue.length <= 50) {
                            onPlayoffConfigChange(playoffConfig.copy(prize = newValue))
                        }
                    },
                    label = "Prize",
                    supportingText = "If there is a prize, enter it here",
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
    )

    if (usesSets) {
        TwoColumnRow(
            first = {
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
                    label = "Winner Set Count *",
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            second = {
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
                        label = "Loser Set Count *",
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
        )

        Text("Winner Bracket Points to Victory", style = MaterialTheme.typography.titleSmall)
        val winnerPoints = normalizePoints(
            playoffConfig.winnerBracketPointsToVictory,
            winnerSetCount
        )
        TwoColumnPointInputs(winnerSetCount) { index ->
            NumberInputField(
                modifier = Modifier.fillMaxWidth(),
                value = winnerPoints[index].toString(),
                label = "Set ${index + 1} *",
                onValueChange = { newValue ->
                    if (newValue.all { it.isDigit() }) {
                        val updated = winnerPoints.toMutableList()
                        updated[index] = newValue.toIntOrNull() ?: 0
                        onPlayoffConfigChange(
                            playoffConfig.copy(winnerBracketPointsToVictory = updated)
                        )
                    }
                },
                isError = winnerPoints[index] <= 0,
                errorMessage = "Must be greater than 0.",
                showZero = true,
            )
        }

        if (playoffConfig.doubleElimination) {
            Text("Loser Bracket Points to Victory", style = MaterialTheme.typography.titleSmall)
            val loserPoints = normalizePoints(
                playoffConfig.loserBracketPointsToVictory,
                loserSetCount
            )
            TwoColumnPointInputs(loserSetCount) { index ->
                NumberInputField(
                    modifier = Modifier.fillMaxWidth(),
                    value = loserPoints[index].toString(),
                    label = "Set ${index + 1} *",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() }) {
                            val updated = loserPoints.toMutableList()
                            updated[index] = newValue.toIntOrNull() ?: 0
                            onPlayoffConfigChange(
                                playoffConfig.copy(loserBracketPointsToVictory = updated)
                            )
                        }
                    },
                    isError = loserPoints[index] <= 0,
                    errorMessage = "Must be greater than 0.",
                    showZero = true,
                )
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
