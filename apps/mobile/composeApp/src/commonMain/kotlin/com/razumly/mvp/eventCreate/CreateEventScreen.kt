package com.razumly.mvp.eventCreate

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventCreate.steps.BasicInfoStep
import com.razumly.mvp.eventCreate.steps.LocationStep
import com.razumly.mvp.eventCreate.steps.PriceStep
import com.razumly.mvp.eventCreate.steps.ScheduleStep
import com.razumly.mvp.eventCreate.steps.TournamentRulesStep
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.create_new_tournament
import mvp.composeapp.generated.resources.create_tournament
import mvp.composeapp.generated.resources.next
import mvp.composeapp.generated.resources.previous
import mvp.composeapp.generated.resources.step_progress
import org.jetbrains.compose.resources.stringResource

@Composable
fun CreateEventScreen(
    component: CreateEventComponent
) {
    var currentStep by remember { mutableIntStateOf(0) }
    val steps = listOf("Basic Info", "Tournament Rules", "Schedule", "Location", "Price")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = stringResource(Res.string.create_new_tournament),
            style = MaterialTheme.typography.titleMedium
        )

        LinearProgressIndicator(
            progress = { (currentStep + 1).toFloat() / steps.size },
            modifier = Modifier.fillMaxWidth(),
        )

        Text(
            text = stringResource(
                Res.string.step_progress,
                currentStep + 1,
                steps[currentStep]
            ),
            style = MaterialTheme.typography.titleMedium
        )

        when (currentStep) {
            0 -> BasicInfoStep(component)
            1 -> TournamentRulesStep(component)
            2 -> ScheduleStep(component)
            3 -> LocationStep(component)
            4 -> PriceStep(component)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            if (currentStep > 0) {
                Button(onClick = { currentStep-- }) {
                    Text(stringResource(Res.string.previous))
                }
            }

            if (currentStep < steps.size - 1) {
                Button(onClick = { currentStep++ }) {
                    Text(stringResource(Res.string.next))
                }
            } else {
                Button(onClick = { component.createTournament() }) {
                    Text(stringResource(Res.string.create_tournament))
                }
            }
        }
    }
}

