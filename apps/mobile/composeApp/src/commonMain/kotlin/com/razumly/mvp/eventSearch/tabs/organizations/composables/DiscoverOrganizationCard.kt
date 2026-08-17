package com.razumly.mvp.eventSearch.tabs.organizations.composables

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImagePainter
import coil3.compose.rememberAsyncImagePainter
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationDivisionSummary
import com.razumly.mvp.core.data.dataTypes.OrganizationFeature
import com.razumly.mvp.core.data.dataTypes.resolvedLogoRef
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.util.getImageUrl

private data class OrganizationFeatureBadgeSpec(
    val feature: OrganizationFeature,
    val label: String,
    val icon: ImageVector,
)

private val organizationFeatureBadgeSpecs = listOf(
    OrganizationFeatureBadgeSpec(OrganizationFeature.CLUB_TEAMS, "Club & Teams", Icons.Default.Groups),
    OrganizationFeatureBadgeSpec(OrganizationFeature.FACILITIES_RENTALS, "Rentals", Icons.Default.Business),
    OrganizationFeatureBadgeSpec(OrganizationFeature.EVENT_MANAGEMENT, "Events", Icons.Default.DateRange),
)

internal fun organizationFeatureBadgeLabels(
    enabledFeatures: List<OrganizationFeature>,
): List<String> = organizationFeatureBadgeSpecs
    .filter { badge -> badge.feature in enabledFeatures }
    .map(OrganizationFeatureBadgeSpec::label)

@Composable
internal fun DiscoverOrganizationCard(
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
        modifier = if (showPlaceholder) modifier else modifier.clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        ),
        border = BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        if (showPlaceholder) {
            DiscoverOrganizationCardPlaceholderContent()
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
                        imageRef = organization.resolvedLogoRef(),
                        size = 36.dp,
                        contentDescription = "Organization logo",
                    )
                    Text(
                        modifier = Modifier.weight(1f),
                        text = organization.name.ifBlank { "Organization" },
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                val featureBadges = remember(organization.enabledFeatures) {
                    organizationFeatureBadgeSpecs.filter { badge -> badge.feature in organization.enabledFeatures }
                }
                if (featureBadges.isNotEmpty()) {
                    FlowRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        featureBadges.forEach { badge ->
                            Surface(
                                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f),
                                shape = RoundedCornerShape(50),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        imageVector = badge.icon,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                        tint = MaterialTheme.colorScheme.primary,
                                    )
                                    Text(
                                        text = badge.label,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }
                        }
                    }
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

                Text(
                    text = formatOrganizationDivisionSummary(organization.divisionSummary),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

internal fun formatOrganizationDivisionSummary(summary: OrganizationDivisionSummary): String {
    val divisionLabel = if (summary.count == 1) "1 division" else "${summary.count} divisions"
    val minPrice = summary.minPrice
    val maxPrice = summary.maxPrice
    val priceLabel = when {
        minPrice == null || maxPrice == null -> "Price not specified"
        minPrice == maxPrice -> formatOrganizationPrice(minPrice)
        else -> "${formatOrganizationPrice(minPrice)}–${formatOrganizationPrice(maxPrice)}"
    }
    return "$divisionLabel · $priceLabel"
}

private fun formatOrganizationPrice(priceCents: Int): String {
    val normalized = priceCents.coerceAtLeast(0)
    val dollars = normalized / 100
    val cents = normalized % 100
    return if (cents == 0) {
        "\$$dollars"
    } else {
        "\$$dollars.${cents.toString().padStart(2, '0')}"
    }
}
