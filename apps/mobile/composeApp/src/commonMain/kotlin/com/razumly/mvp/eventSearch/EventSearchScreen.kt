package com.razumly.mvp.eventSearch

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FabPosition
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.backGroundGradient1
import com.razumly.mvp.core.presentation.backGroundGradient2
import com.razumly.mvp.core.presentation.util.isScrollingUp
import com.razumly.mvp.eventList.EventList
import com.razumly.mvp.eventList.components.FilterBar
import com.razumly.mvp.eventList.components.SearchBox
import com.razumly.mvp.eventMap.EventMap
import com.razumly.mvp.home.LocalNavBarPadding
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect

@OptIn(ExperimentalHazeMaterialsApi::class, ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.EventSearchScreen(component: SearchEventListComponent) {
    val events = component.events.collectAsState()
    val showMapCard = component.showMapCard.collectAsState()
    val currentLocation = component.currentLocation.collectAsState()
    val hazeState = remember { HazeState() }
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))
    val backgroundStops = arrayOf(
        0.0f to backGroundGradient1,
        1f to backGroundGradient2
    )
    val lazyListState = rememberLazyListState()

    BindLocationTrackerEffect(component.locationTracker)
    if (showMapCard.value) {
        currentLocation.value?.let { it1 -> EventMap(events.value, it1) }
    } else {
        Scaffold(
            topBar = {
                Column(
                    modifier = Modifier
                        .wrapContentSize()
                        .hazeEffect(hazeState, HazeMaterials.ultraThin())
                        .statusBarsPadding()
                ) {
                    SearchBox()
                    FilterBar()
                }
            },
            floatingActionButton = {
                AnimatedVisibility(
                    visible = lazyListState.isScrollingUp().value,
                    enter = (slideInVertically{ it / 2 } + fadeIn()),
                    exit = (slideOutVertically{ it / 2 } + fadeOut())
                ){
                    Button(
                        onClick = { component.onMapClick() },
                        modifier = Modifier.padding(offsetNavPadding),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Black,
                            contentColor = Color.White
                        )
                    ) {
                        Text("Map")
                        Icon(Icons.Default.Place, contentDescription = "Map")
                    }
                }
            },
            floatingActionButtonPosition = FabPosition.Center,
        ) { paddingValues ->
            val firstElementPadding = PaddingValues(top = paddingValues.calculateTopPadding())
            EventList(
                component,
                events.value,
                firstElementPadding,
                offsetNavPadding,
                lazyListState,
                Modifier
                    .hazeSource(hazeState)
                    .background(
                        Brush.horizontalGradient(colorStops = backgroundStops)
                    ),
            )
        }
    }
}