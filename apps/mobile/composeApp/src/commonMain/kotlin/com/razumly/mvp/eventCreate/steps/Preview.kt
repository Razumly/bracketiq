package com.razumly.mvp.eventCreate.steps

import androidx.compose.material3.Card
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.eventCreate.CreateEventComponent

@Composable
fun Preview(component: CreateEventComponent) {
    val previewEvent by component.newEventState.collectAsState()
    Card {
        previewEvent?.let {
            EventDetails(
                it,
                showDescription = true,
                onFavoriteClick = {},
                favoritesModifier = Modifier.alpha(0f)
            )
        }
    }
}