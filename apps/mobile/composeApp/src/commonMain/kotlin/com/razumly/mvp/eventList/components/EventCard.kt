package com.razumly.mvp.eventList.components

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardColors
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.presentation.composables.EventDetails
import com.razumly.mvp.core.presentation.disabledCardColor

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SharedTransitionScope.EventCard(
    event: EventAbs,
    onFavoriteClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val cardColors = CardColors(
        containerColor = MaterialTheme.colorScheme.background,
        contentColor = MaterialTheme.colorScheme.onBackground,
        disabledContainerColor = disabledCardColor,
        disabledContentColor = disabledCardColor
    )
    Card(
        modifier = modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth(),
        elevation = CardDefaults.cardElevation(4.dp),
        colors = cardColors,
        shape = RoundedCornerShape(12.dp)
    ) {
        EventDetails(
            event,
            false,
            onFavoriteClick,
            Modifier
            .padding(8.dp)
        )
    }
}
