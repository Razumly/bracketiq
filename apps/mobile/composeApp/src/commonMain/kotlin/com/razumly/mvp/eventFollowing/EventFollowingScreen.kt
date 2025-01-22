package com.razumly.mvp.eventFollowing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.razumly.mvp.eventList.EventList
import com.razumly.mvp.eventList.components.FilterBar
import com.razumly.mvp.eventList.components.SearchBox
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventFollowingScreen(component: FollowingEventListComponent){
    val events = component.events.collectAsState()
    val hazeState = remember { HazeState() }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .wrapContentSize()
                    .background(Color.White)
                    .hazeEffect(hazeState, HazeMaterials.ultraThin())
            ) {
                SearchBox()
                FilterBar()
            }
        },
    ) { paddingValues ->
        EventList(
            component,
            events.value,
            paddingValues,
            Modifier.hazeSource(hazeState),
        )
    }
}