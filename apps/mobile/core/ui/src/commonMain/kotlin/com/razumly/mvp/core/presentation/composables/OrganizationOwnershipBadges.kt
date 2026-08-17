package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationOwnershipBadgeTone

@Composable
fun OrganizationOwnershipBadges(
    organization: Organization?,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    if (organization == null) return

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 8.dp),
    ) {
        OrganizationOwnershipBadge(
            label = organization.ownershipBadgeLabel,
            tone = organization.ownershipBadgeTone,
            compact = compact,
        )
        if (organization.showsWebsiteVerifiedBadge) {
            OrganizationOwnershipBadge(
                label = "Website verified",
                tone = OrganizationOwnershipBadgeTone.INFO,
                compact = compact,
                useTrustColors = true,
            )
        }
    }
}

@Composable
private fun OrganizationOwnershipBadge(
    label: String,
    tone: OrganizationOwnershipBadgeTone,
    compact: Boolean,
    useTrustColors: Boolean = false,
) {
    val containerColor: Color
    val contentColor: Color
    when {
        useTrustColors -> {
            containerColor = MaterialTheme.colorScheme.tertiaryContainer
            contentColor = MaterialTheme.colorScheme.onTertiaryContainer
        }
        tone == OrganizationOwnershipBadgeTone.NEUTRAL -> {
            containerColor = MaterialTheme.colorScheme.surfaceVariant
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant
        }
        tone == OrganizationOwnershipBadgeTone.WARNING -> {
            containerColor = MaterialTheme.colorScheme.secondaryContainer
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer
        }
        tone == OrganizationOwnershipBadgeTone.ERROR -> {
            containerColor = MaterialTheme.colorScheme.errorContainer
            contentColor = MaterialTheme.colorScheme.onErrorContainer
        }
        else -> {
            containerColor = MaterialTheme.colorScheme.primaryContainer
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
        }
    }

    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = RoundedCornerShape(999.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(
                horizontal = if (compact) 7.dp else 9.dp,
                vertical = if (compact) 2.dp else 3.dp,
            ),
        )
    }
}
