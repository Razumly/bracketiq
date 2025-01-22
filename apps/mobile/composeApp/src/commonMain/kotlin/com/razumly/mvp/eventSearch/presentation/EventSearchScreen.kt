package com.razumly.mvp.eventSearch.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.wrapContentSize
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
import androidx.compose.ui.graphics.Color
import com.razumly.mvp.eventList.EventList
import com.razumly.mvp.eventList.components.FilterBar
import com.razumly.mvp.eventList.components.SearchBox
import com.razumly.mvp.eventMap.EventMap
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.materials.ExperimentalHazeMaterialsApi
import dev.chrisbanes.haze.materials.HazeMaterials
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect

@OptIn(ExperimentalHazeMaterialsApi::class)
@Composable
fun EventSearchScreen(component: SearchEventListComponent, navBarPadding: PaddingValues) {
    val events = component.events.collectAsState()
    val showMapCard = component.showMapCard.collectAsState()
    val currentLocation = component.currentLocation.collectAsState()
    val hazeState = remember { HazeState() }

    BindLocationTrackerEffect(component.locationTracker)
    if(showMapCard.value){
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
                Button(
                    onClick = { component.onMapClick() },
                    modifier = Modifier.padding(navBarPadding),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Black,
                        contentColor = Color.White
                    )
                ) {
                    Text("Map")
                    Icon(Icons.Default.Place, contentDescription = "Map")
                }
            },
            floatingActionButtonPosition = FabPosition.Center,
        ) { paddingValues ->
            EventList(
                component,
                events.value,
                paddingValues,
                Modifier.hazeSource(hazeState),
            )
        }
    }
}