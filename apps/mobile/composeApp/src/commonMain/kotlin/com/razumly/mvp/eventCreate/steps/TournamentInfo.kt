package com.razumly.mvp.eventCreate.steps

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.CreateEventComponent

@Composable
fun TournamentInfo(component: CreateEventComponent, isCompleted: (Boolean) -> Unit) {
    val tournamentState by component.newTournamentState.collectAsState()
    var doubleElimination by remember { mutableStateOf(false) }
    var winnerSetCount by remember { mutableIntStateOf(3) }
    var loserSetCount by remember { mutableIntStateOf(1) }
    var winnerPoints = remember { mutableListOf(21, 21, 15) }
    val loserPoints = remember { mutableListOf(21) }
    component.updateTournamentField {
        copy(
            doubleElimination = doubleElimination,
            winnerSetCount = winnerSetCount,
            loserSetCount = loserSetCount,
            winnerBracketPointsToVictory = winnerPoints,
            loserBracketPointsToVictory = loserPoints
        )
    }

    val focusRequesters = remember { List(4) { FocusRequester() } }

    val formValid by remember(tournamentState) {
        mutableStateOf(
            tournamentState?.let { tournament ->
                tournament.winnerSetCount > 0
                        && (!doubleElimination || tournament.loserSetCount > 0)
                        && tournament.winnerBracketPointsToVictory.all { it > 0 }
                        && (!doubleElimination || tournament.loserBracketPointsToVictory.all { it > 0 })
            } ?: false
        )
    }

    LaunchedEffect(formValid) {
        isCompleted(formValid)
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Checkbox(
                checked = doubleElimination,
                onCheckedChange = {
                    doubleElimination = !doubleElimination
                    component.updateTournamentField { copy(doubleElimination = doubleElimination) }
                }
            )
            Text("Double Elimination")
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Winner Bracket Requirements", style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = winnerSetCount.toString(),
                    onValueChange = {
                        val newValue = it.toIntOrNull() ?: winnerSetCount
                        winnerSetCount = newValue
                        winnerPoints = MutableList(winnerSetCount) { 0 }
                        component.updateTournamentField { copy(winnerSetCount = winnerSetCount) }
                    },
                    label = { Text("Winner Set Count") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Text("Winner Points per Set")
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    repeat(winnerSetCount) { index ->
                        PointsTextField(
                            value = winnerPoints.getOrNull(index)?.toString() ?: "",
                            label = "Set ${index + 1} Points to Win",
                            onValueChange = { newValue ->
                                if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                    winnerPoints[index] = newValue.toIntOrNull() ?: 0
                                    component.updateTournamentField {
                                        copy(
                                            winnerBracketPointsToVictory = winnerPoints
                                        )
                                    }
                                }
                            },
                            focusRequester = focusRequesters[index],
                            nextFocus = { if (index < winnerSetCount - 1) focusRequesters[index + 1].requestFocus() }
                        )
                    }
                }
            }

            AnimatedVisibility(
                doubleElimination
            ) {
                Column(
                    Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                    OutlinedTextField(
                        value = loserSetCount.toString(),
                        onValueChange = {
                            val newValue = it.toIntOrNull() ?: loserSetCount
                            loserSetCount = newValue
                            component.updateTournamentField { copy(loserSetCount = loserSetCount) }
                        },
                        label = { Text("Winner Set Count") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text("Loser Points per Set")
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        repeat(loserSetCount) { index ->
                            PointsTextField(
                                value = loserPoints.getOrNull(index)?.toString() ?: "",
                                label = "Set ${index + 1}",
                                onValueChange = { newValue ->
                                    if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                                        loserPoints[index] = newValue.toIntOrNull() ?: 0
                                        component.updateTournamentField {
                                            copy(
                                                loserBracketPointsToVictory = loserPoints
                                            )
                                        }
                                    }
                                },
                                focusRequester = focusRequesters[index],
                                nextFocus = { if (index < loserSetCount - 1) focusRequesters[index + 1].requestFocus() }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PointsTextField(
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    focusRequester: FocusRequester,
    nextFocus: () -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Number,
            imeAction = ImeAction.Next
        ),
        keyboardActions = KeyboardActions(
            onNext = { nextFocus() }
        ),
        modifier = Modifier
            .width(100.dp)
            .focusRequester(focusRequester)
            .onKeyEvent {
                if (it.key == Key.Enter) {
                    nextFocus()
                    true
                } else false
            },
    )
}
