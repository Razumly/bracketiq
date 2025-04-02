package com.razumly.mvp.eventCreate

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import com.arkivanov.decompose.router.stack.ChildStack
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventCreate.steps.EventBasicInfo
import com.razumly.mvp.eventCreate.steps.EventImage
import com.razumly.mvp.eventCreate.steps.EventLocation
import com.razumly.mvp.eventCreate.steps.Preview
import com.razumly.mvp.eventCreate.steps.TournamentInfo
import com.razumly.mvp.home.LocalNavBarPadding
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import io.github.aakira.napier.Napier
import kotlinx.datetime.Clock
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.create_tournament
import mvp.composeapp.generated.resources.next
import mvp.composeapp.generated.resources.previous
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalHazeMaterialsApi::class, ExperimentalSharedTransitionApi::class)
@Composable
fun CreateEventScreen(
    component: CreateEventComponent,
    animatedVisibilityScope: AnimatedVisibilityScope,
) {
    val childStack by component.childStack.subscribeAsState()
    val currentStep = childStack.active.instance.step
    val stepsTotal = CreateEventComponent.Child.STEPS
    val canProceed = remember { mutableStateOf(false) }
    val hazeState = remember { HazeState() }

    val targetProgress = remember { mutableStateOf(0f) }
    val animatedProgress by animateFloatAsState(
        targetValue = targetProgress.value,
        animationSpec = tween(durationMillis = 500)
    )

    LaunchedEffect(currentStep) {
        val newProgress = currentStep.toFloat() / stepsTotal
        targetProgress.value = newProgress
    }

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
            Column(
                Modifier
                    .hazeEffect(hazeState, HazeMaterials.ultraThin())
            ){
                CreateEventTopBar(
                    animatedProgress = animatedProgress,
                    title = childStack.active.instance.title
                )
            }
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

        floatingActionButtonPosition = FabPosition.Center,
        content = { innerPadding ->
            Children(
                modifier = Modifier
                    .fillMaxSize()
                    .hazeSource(hazeState),
                stack = childStack,
            ) { child ->
                when (val instance = child.instance) {
                    is CreateEventComponent.Child.EventBasicInfo -> {
                        EventBasicInfo(
                            Modifier
                                .statusBarsPadding()
                                .padding(innerPadding)
                                .padding(horizontal = 16.dp),
                            component
                        ) { canProceed.value = it }
                    }
                    is CreateEventComponent.Child.EventLocation -> {
                        EventLocation(
                            PaddingValues(top = 64.dp),
                            instance.component,
                            component
                        )  { canProceed.value = it }
                    }
                    is CreateEventComponent.Child.EventImage -> {
                        EventImage(
                            Modifier
                                .statusBarsPadding()
                                .padding(innerPadding)
                                .padding(horizontal = 16.dp),
                            component
                        ) { canProceed.value = it}
                    }
                    is CreateEventComponent.Child.TournamentInfo -> {
                        TournamentInfo(
                            Modifier
                                .statusBarsPadding()
                                .padding(innerPadding)
                                .padding(horizontal = 16.dp),
                            component
                        ) { canProceed.value = it}
                    }
                    is CreateEventComponent.Child.Preview -> {
                        Preview(
                            Modifier
                                .statusBarsPadding()
                                .padding(innerPadding)
                                .padding(horizontal = 16.dp),
                            component,
                        )
                    }
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateEventTopBar(animatedProgress: Float, title: String) {
    val colors = TopAppBarColors(
        containerColor = Color.Transparent,
        scrolledContainerColor = Color.Transparent,
        navigationIconContentColor = MaterialTheme.colorScheme.onBackground,
        titleContentColor = MaterialTheme.colorScheme.onBackground,
        actionIconContentColor = MaterialTheme.colorScheme.onBackground
    )
    Column {
        TopAppBar(
            title = { Text(title) },
            modifier = Modifier.fillMaxWidth(),
            colors = colors
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
    val currentEventType by component.currentEventType.collectAsState()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        if (childStack.active.instance != CreateEventComponent.Child.EventBasicInfo) {
            FloatingActionButton(
                onClick = { component.previousStep() }
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(Res.string.previous)
                )
            }
        } else {
            Spacer(modifier = Modifier.width(48.dp))
        }

        if (childStack.active.instance != CreateEventComponent.Child.Preview) {
            if (childStack.active.instance == CreateEventComponent.Child.EventImage &&
                currentEventType == EventType.EVENT
            )
            {
                FloatingActionButton(
                    onClick = {
                        if (enabled) {
                            component.nextStep(CreateEventComponent.Config.Preview)
                        }
                    },
                    containerColor = if (enabled) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.tertiaryContainer
                    },
                    contentColor = if (enabled) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onTertiaryContainer
                    },
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = stringResource(Res.string.next),
                    )
                }
            }
            else {
                FloatingActionButton(
                    onClick = {
                        childStack.active.instance.nextStep?.let {
                            if (enabled) {
                                component.nextStep(it)
                            }
                        }
                    },
                    containerColor = if (enabled) {
                        FloatingActionButtonDefaults.containerColor
                    } else {
                        MaterialTheme.colorScheme.errorContainer
                    },
                    contentColor = if (enabled) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onErrorContainer
                    },
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = stringResource(Res.string.next),
                    )
                }
            }
        } else {
            FloatingActionButton(
                onClick = {
                    component.createEvent()
                }
            ) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = stringResource(Res.string.create_tournament)
                )
            }
        }
    }
}
