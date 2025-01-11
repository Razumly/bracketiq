package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun BackButton(
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .padding(start = 16.dp, top = 8.dp)
            .clickable(onClick = onBack)
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "←",  // Simple arrow character
                fontSize = 24.sp,
                color = Color.Blue
            )
            Text(
                text = "Back",
                fontSize = 17.sp,
                color = Color.Blue
            )
        }
    }
}

@Composable
expect fun PlatformBackButton(
    onBack: () -> Unit,
    modifier: Modifier = Modifier
)


