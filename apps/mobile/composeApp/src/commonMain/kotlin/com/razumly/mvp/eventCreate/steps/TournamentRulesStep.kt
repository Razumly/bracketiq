package com.razumly.mvp.eventCreate.steps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.CreateEventComponent

@Composable
fun TournamentRulesStep(component: CreateEventComponent) {
    var doubleElimination by remember { mutableStateOf(false) }
    var winnerSetCount by remember { mutableIntStateOf(1) }
    var loserSetCount by remember { mutableIntStateOf(1) }

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
                    doubleElimination = it
                    component.updateTournamentParameters(
                        doubleElimination = it,
                        winnerSetCount = winnerSetCount,
                        loserSetCount = loserSetCount,
                        winnerBracketPointsToVictory = listOf(21),
                        loserBracketPointsToVictory = listOf(21),
                        winnerScoreLimitsPerSet = listOf(21),
                        loserScoreLimitsPerSet = listOf(21)
                    )
                }
            )
            Text("Double Elimination")
        }

        OutlinedTextField(
            value = winnerSetCount.toString(),
            onValueChange = {
                val newValue = it.toIntOrNull() ?: winnerSetCount
                winnerSetCount = newValue
                component.updateTournamentParameters(
                    doubleElimination = doubleElimination,
                    winnerSetCount = newValue,
                    loserSetCount = loserSetCount,
                    winnerBracketPointsToVictory = listOf(21),
                    loserBracketPointsToVictory = listOf(21),
                    winnerScoreLimitsPerSet = listOf(21),
                    loserScoreLimitsPerSet = listOf(21)
                )
            },
            label = { Text("Winner Set Count") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth()
        )
    }
}
