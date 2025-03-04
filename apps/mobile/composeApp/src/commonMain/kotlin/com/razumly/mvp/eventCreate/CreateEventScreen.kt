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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.razumly.mvp.eventCreate.steps.Step1
import com.razumly.mvp.eventCreate.steps.Step2
import com.razumly.mvp.eventCreate.steps.Step3
import io.github.aakira.napier.Napier
import kotlinx.datetime.Clock
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
    val childStack by component.childStack.subscribeAsState()

    var lastNavigationTime by remember { mutableStateOf(0L) }
    var lastInstance by remember { mutableStateOf<Any?>(null) }

    LaunchedEffect(childStack.active.instance) {
        val currentTime = Clock.System.now().toEpochMilliseconds()
        val currentInstance = childStack.active.instance

        if (currentInstance != lastInstance && currentTime - lastNavigationTime < 300) {
            Napier.d(tag = "Navigation") { "Preventing rapid navigation: $lastInstance -> $currentInstance" }
            return@LaunchedEffect
        }

        lastInstance = currentInstance
        lastNavigationTime = currentTime
    }

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

        Children(
            stack = childStack,
        ) { child ->
            when (val instance = child.instance) {
                is CreateEventComponent.Child.Step1 -> {
                    currentStep = 1
                    Step1(component)
                }

                is CreateEventComponent.Child.Step2 -> {
                    currentStep = 2
                    Step2(instance.component, component)
                }

                CreateEventComponent.Child.Step3 -> {
                    currentStep = 3
                    Step3(component)
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                if (child.instance != CreateEventComponent.Child.Step1) {
                    Button(onClick = { component.previousStep() }) {
                        Text(stringResource(Res.string.previous))
                    }
                }

                if (child.instance != CreateEventComponent.Child.Step3) {
                    Button(onClick = { child.instance.nextStep?.let { component.nextStep(it) } }) {
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
}

