package com.razumly.mvp.eventSearch.tabs.rentals.composables

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.util.getImageUrl

@Composable
internal fun DiscoverRentalCard(
    organization: Organization,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val logoModel = remember(organization.logoId) {
        organization.logoId
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?.let { logoId -> getImageUrl(fileId = logoId, width = 72, height = 72) }
    }
    val logoPainter = rememberAsyncImagePainter(model = logoModel)
    val logoState by logoPainter.state.collectAsState()
    val showPlaceholder = logoModel != null && logoState is AsyncImagePainter.State.Loading

    Card(
        modifier = if (showPlaceholder) modifier else modifier.clickable(onClick = onClick)
    ) {
        if (showPlaceholder) {
            DiscoverRentalCardPlaceholderContent()
        } else {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    NetworkAvatar(
                        displayName = organization.name.ifBlank { "Organization" },
                        imageRef = organization.logoId,
                        size = 36.dp,
                        contentDescription = "Organization logo",
                    )
                    Text(
                        text = organization.name.ifBlank { "Organization" },
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                organization.location?.takeIf { it.isNotBlank() }?.let { location ->
                    Text(
                        text = location,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                organization.description?.takeIf { it.isNotBlank() }?.let { description ->
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }

                val fieldCount = organization.fieldIds.size
                val detailsText = if (fieldCount == 1) {
                    "1 rentable field"
                } else {
                    "$fieldCount rentable fields"
                }

                Text(
                    text = detailsText,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}
