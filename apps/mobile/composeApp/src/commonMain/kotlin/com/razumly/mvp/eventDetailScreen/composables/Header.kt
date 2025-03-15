package com.razumly.mvp.eventDetailScreen.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.eventDetailScreen.EventContentComponent


@Composable
fun Header(
    component: EventContentComponent,
) {
    val tournament by component.selectedEvent.collectAsState()
    val showDetails by component.showDetails.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        tournament?.event?.let {
            EventDetails(
                it,
                true,
                {},
                Modifier.padding(top = 32.dp, end = 8.dp),
                onMapClick = {}
            ){}
        }

//        Icon(
//            if (showDetails) {
//                MVPIcons.ArrowDown
//            } else {
//                MVPIcons.ArrowUp
//            },
//            contentDescription = "Expand",
//            modifier = Modifier.clickable(onClick = { component.toggleDetails() })
//        )
    }
}