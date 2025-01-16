package com.razumly.mvp.eventSearch.presentation

import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.razumly.mvp.eventList.EventList
import com.razumly.mvp.eventMap.EventMap
import dev.icerock.moko.geo.compose.BindLocationTrackerEffect

@Composable
fun EventSearchScreen(component: SearchEventListComponent) {
    val events = component.events.collectAsState()
    val showMapCard = component.showMapCard.collectAsState()
    val currentLocation = component.currentLocation.collectAsState()

    BindLocationTrackerEffect(component.locationTracker)
    Scaffold(
        floatingActionButton = {
            Button(
                onClick = { component.onMapClick() },
                modifier = Modifier.padding(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.Black,
                    contentColor = Color.White
                )
            ) {
                Text("Map")
                Icon(Icons.Default.Place, contentDescription = "Map")
            }
        },
        floatingActionButtonPosition = FabPosition.Center
    ) {
        if(showMapCard.value){
            currentLocation.value?.let { it1 -> EventMap(events.value, it1) }
        } else {
            EventList(component, events.value)
        }
    }
}