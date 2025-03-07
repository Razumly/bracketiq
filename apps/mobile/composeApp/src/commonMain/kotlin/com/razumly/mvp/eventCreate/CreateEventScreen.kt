package com.razumly.mvp.eventCreate

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.router.stack.ChildStack
import com.razumly.mvp.eventCreate.steps.Finished
import com.razumly.mvp.eventCreate.steps.Step1
import com.razumly.mvp.eventCreate.steps.Step2
import com.razumly.mvp.eventCreate.steps.Step3
import com.razumly.mvp.home.LocalNavBarPadding
import io.github.aakira.napier.Napier
import kotlinx.datetime.Clock
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.create_new_tournament
import mvp.composeapp.generated.resources.create_tournament
import mvp.composeapp.generated.resources.next
import mvp.composeapp.generated.resources.previous
import org.jetbrains.compose.resources.stringResource

@Composable
fun CreateEventScreen(
    component: CreateEventComponent
) {
    val childStack by component.childStack.subscribeAsState()
    val currentStep = childStack.active.instance.step
    val stepsTotal = CreateEventComponent.Child.STEPS
    val contentPadding = remember { mutableStateOf(16.dp) }
    val canProceed = remember { mutableStateOf(false) }

    // Animation control for the progress indicator.
    val targetProgress = remember { mutableStateOf(0f) }
    val animatedProgress by animateFloatAsState(
        targetValue = targetProgress.value,
        animationSpec = tween(durationMillis = 500)
    )

    // Update progress when step changes.
    LaunchedEffect(currentStep) {
        val newProgress = currentStep.toFloat() / stepsTotal
        targetProgress.value = newProgress
    }

    // Prevent rapid navigation.
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

    Scaffold(
        topBar = {
            CreateEventTopBar(animatedProgress = animatedProgress)
        },
        floatingActionButton = {
            CreateEventNavigationFABs(
                modifier = Modifier.padding(
                    bottom = LocalNavBarPadding.current.calculateBottomPadding()
                ),
                childStack = childStack,
                component = component,
                canProceed.value
            )
        },
        // Place the FABs in the center at the bottom (they will appear above the system nav bar)
        floatingActionButtonPosition = FabPosition.Center,
        content = { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(contentPadding.value)
                    .statusBarsPadding(), // Ensures top status bar padding is applied
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // The step content is rendered here.
                Children(
                    modifier = Modifier.weight(1f),
                    stack = childStack,
                ) { child ->
                    when (val instance = child.instance) {
                        is CreateEventComponent.Child.Step1 -> {
                            contentPadding.value = 16.dp
                            Step1(component) { canProceed.value = it }
                        }
                        is CreateEventComponent.Child.Step2 -> {
                            contentPadding.value = 0.dp
                            Step2(instance.component, component)  { canProceed.value = it }
                        }
                        is CreateEventComponent.Child.Step3 -> {
                            contentPadding.value = 16.dp
                            Step3(component)
                        }
                        is CreateEventComponent.Child.Finished -> {
                            contentPadding.value = 16.dp
                            Finished()
                        }
                    }
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateEventTopBar(animatedProgress: Float) {
    // A custom top bar that shows the title and a linear progress indicator.
    Column {
        TopAppBar(
            title = { Text(stringResource(Res.string.create_new_tournament)) },
            modifier = Modifier.fillMaxWidth()
        )
        LinearProgressIndicator(
            progress = { animatedProgress },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp),
        )
    }
}

@Composable
fun CreateEventNavigationFABs(
    modifier: Modifier,
    childStack: ChildStack<CreateEventComponent.Config, CreateEventComponent.Child>,
    component: CreateEventComponent,
    enabled: Boolean
) {
    // Using a Row to show both FABs with space between.
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        if (childStack.active.instance != CreateEventComponent.Child.Step1) {
            FloatingActionButton(
                onClick = { component.previousStep() }
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(Res.string.previous)
                )
            }
        } else {
            // Ensure proper spacing when the previous button is absent.
            Spacer(modifier = Modifier.width(48.dp))
        }

        if (childStack.active.instance != CreateEventComponent.Child.Step3) {
            FloatingActionButton(
                onClick = { childStack.active.instance.nextStep?.let {
                    if (enabled) {
                        component.nextStep(it)
                    }
                } }
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = stringResource(Res.string.next),
                    tint = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.inversePrimary
                )
            }
        } else {
            FloatingActionButton(
                onClick = { component.createTournament() }
            ) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = stringResource(Res.string.create_tournament)
                )
            }
        }
    }
}
