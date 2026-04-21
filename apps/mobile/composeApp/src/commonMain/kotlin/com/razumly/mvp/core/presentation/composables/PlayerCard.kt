package com.razumly.mvp.core.presentation.composables

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.razumly.mvp.core.data.dataTypes.UserData

@Composable
fun PlayerCard(
    player: UserData,
    isPending: Boolean = false,
    modifier: Modifier = Modifier,
    jerseyNumber: String? = null,
    trailingContent: @Composable (() -> Unit)? = null,
) {
    UnifiedCard(
        entity = player,
        isPending = isPending,
        modifier = modifier,
        avatarJerseyNumber = jerseyNumber,
        trailingContent = trailingContent,
    )
}
