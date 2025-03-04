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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.CreateEventComponent

@Composable
fun Step3(component: CreateEventComponent) {
    var doubleElimination by remember { mutableStateOf(false) }
    var winnerSetCount by remember { mutableIntStateOf(3) }
    var loserSetCount by remember { mutableIntStateOf(1) }
    var winnerPoints = remember { mutableListOf(21, 21, 15) }
    val loserPoints = remember { mutableListOf(15) }
    val winnerLimits = remember { mutableListOf(25, 25, 20) }
    val loserLimits = remember { mutableListOf(25) }

    val focusManager = LocalFocusManager.current
    val focusRequesters = remember { List(4) { FocusRequester() } }

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
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(winnerSetCount) { index ->
                PointsTextField(
                    value = winnerPoints.getOrNull(index)?.toString() ?: "",
                    label = "Set ${index + 1} Points to Win",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                            winnerPoints[index] = newValue.toIntOrNull() ?: 0
                            component.updateTournamentField { copy(winnerBracketPointsToVictory = winnerPoints) }
                        }
                    },
                    focusRequester = focusRequesters[index],
                    nextFocus = { if (index < winnerSetCount - 1) focusRequesters[index + 1].requestFocus() }
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(winnerSetCount) { index ->
                PointsTextField(
                    value = winnerLimits.getOrNull(index)?.toString() ?: "",
                    label = "Set ${index + 1} Points to Win",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                            winnerLimits[index] = newValue.toIntOrNull() ?: 0
                            component.updateTournamentField { copy(winnerScoreLimitsPerSet = winnerLimits) }
                        }
                    },
                    focusRequester = focusRequesters[index],
                    nextFocus = { if (index < winnerSetCount - 1) focusRequesters[index + 1].requestFocus() }
                )
            }
        }

        AnimatedVisibility(
            doubleElimination
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
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(loserSetCount) { index ->
                PointsTextField(
                    value = loserPoints.getOrNull(index)?.toString() ?: "",
                    label = "Set ${index + 1} Points to Win",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                            loserPoints[index] = newValue.toIntOrNull() ?: 0
                            component.updateTournamentField { copy(loserBracketPointsToVictory = loserPoints) }
                        }
                    },
                    focusRequester = focusRequesters[index],
                    nextFocus = { if (index < loserSetCount - 1) focusRequesters[index + 1].requestFocus() }
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(loserSetCount) { index ->
                PointsTextField(
                    value = loserLimits.getOrNull(index)?.toString() ?: "",
                    label = "Set ${index + 1} Points to Win",
                    onValueChange = { newValue ->
                        if (newValue.all { it.isDigit() } && newValue.length <= 2) {
                            loserLimits[index] = newValue.toIntOrNull() ?: 0
                            component.updateTournamentField { copy(loserScoreLimitsPerSet = loserLimits) }
                        }
                    },
                    focusRequester = focusRequesters[index],
                    nextFocus = { if (index < loserSetCount - 1) focusRequesters[index + 1].requestFocus() }
                )
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
