package com.razumly.mvp.eventCreate.steps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.EventCard
import com.razumly.mvp.eventCreate.CreateEventComponent

@Composable
fun Preview(
    modifier: Modifier,
    component: CreateEventComponent,
) {
    val previewEvent by component.newEventState.collectAsState()
    Column(
        modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Card(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).wrapContentSize(),
            elevation = CardDefaults.cardElevation(4.dp),
            shape = RoundedCornerShape(
                12.dp
            )
        ) {
            EventCard(
                previewEvent,
                onFavoriteClick = {},
                favoritesModifier = Modifier.alpha(0f),
                onMapClick = {},
            )
        }
    }
}