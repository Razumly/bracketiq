package com.razumly.mvp.eventFollowing

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventList.EventList
import com.razumly.mvp.eventList.components.FilterBar
import com.razumly.mvp.eventList.components.SearchBox
import com.razumly.mvp.home.LocalNavBarPadding
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials

@OptIn(ExperimentalHazeMaterialsApi::class, ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.EventFollowingScreen(component: FollowingEventListComponent){
    val events = component.events.collectAsState()
    val hazeState = remember { HazeState() }
    val offsetNavPadding =
        PaddingValues(bottom = LocalNavBarPadding.current.calculateBottomPadding().plus(32.dp))

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .wrapContentSize()
                    .background(Color.White)
                    .hazeEffect(hazeState, HazeMaterials.ultraThin())
                    .statusBarsPadding()
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
            offsetNavPadding,
            modifier = Modifier.hazeSource(hazeState),
        )
    }
}