package com.razumly.mvp.android.createEvent

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
import com.razumly.mvp.eventCreate.presentation.CreateEventViewModel
import com.razumly.mvp.android.createEvent.components.BasicInfoStep
import com.razumly.mvp.android.createEvent.components.LocationStep
import com.razumly.mvp.android.createEvent.components.PriceStep
import com.razumly.mvp.android.createEvent.components.ScheduleStep
import com.razumly.mvp.android.createEvent.components.TournamentRulesStep
import org.koin.compose.viewmodel.koinNavViewModel
import org.koin.core.annotation.KoinExperimentalAPI

@OptIn(KoinExperimentalAPI::class)
@Composable
fun CreateEventScreen() {
    val viewModel = koinNavViewModel<CreateEventViewModel>()
    var currentStep by remember { mutableIntStateOf(0) }
    val steps = listOf("Basic Info", "Tournament Rules", "Schedule", "Location", "Price")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Create a New Pickup Tournament",
            style = MaterialTheme.typography.titleLarge
        )

        LinearProgressIndicator(
            progress = { (currentStep + 1).toFloat() / steps.size },
            modifier = Modifier.fillMaxWidth(),
        )

        Text(
            text = "Step ${currentStep + 1}: ${steps[currentStep]}",
            style = MaterialTheme.typography.titleMedium
        )

        when (currentStep) {
            0 -> BasicInfoStep(viewModel)
            1 -> TournamentRulesStep(viewModel)
            2 -> ScheduleStep(viewModel)
            3 -> LocationStep(viewModel)
            4 -> PriceStep(viewModel)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            if (currentStep > 0) {
                Button(onClick = { currentStep-- }) {
                    Text("Previous")
                }
            }

            if (currentStep < steps.size - 1) {
                Button(onClick = { currentStep++ }) {
                    Text("Next")
                }
            } else {
                Button(onClick = { viewModel.createTournament() }) {
                    Text("Create Tournament")
                }
            }
        }
    }
}
