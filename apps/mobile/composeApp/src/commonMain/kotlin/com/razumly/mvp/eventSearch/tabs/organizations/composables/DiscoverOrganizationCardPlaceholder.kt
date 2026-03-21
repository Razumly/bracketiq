package com.razumly.mvp.eventSearch.tabs.organizations.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
internal fun DiscoverOrganizationCardPlaceholder(
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier) {
        DiscoverOrganizationCardPlaceholderContent()
    }
}

@Composable
internal fun DiscoverOrganizationCardPlaceholderContent() {
    val placeholderColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = placeholderColor,
                        shape = RoundedCornerShape(18.dp)
                    )
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .height(20.dp)
                    .background(
                        color = placeholderColor,
                        shape = RoundedCornerShape(6.dp)
                    )
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth(0.5f)
                .height(16.dp)
                .background(
                    color = placeholderColor,
                    shape = RoundedCornerShape(6.dp)
                )
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .height(14.dp)
                .background(
                    color = placeholderColor,
                    shape = RoundedCornerShape(6.dp)
                )
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(0.38f)
                .height(14.dp)
                .background(
                    color = placeholderColor,
                    shape = RoundedCornerShape(6.dp)
                )
        )
    }
}
