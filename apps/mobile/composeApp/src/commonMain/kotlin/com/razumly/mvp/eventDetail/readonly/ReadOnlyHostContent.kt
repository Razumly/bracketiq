package com.razumly.mvp.eventDetail.readonly

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.composables.NetworkAvatar
import com.razumly.mvp.core.presentation.composables.OrganizationVerificationBadge
import com.razumly.mvp.core.presentation.composables.PlayerCardWithActions
@Composable
internal fun HostedByReadOnlyRow(
    host: UserData?,
    organization: Organization?,
    isOrganizationEvent: Boolean,
    fallbackHostDisplayName: String,
    currentUser: UserData?,
    onMessageUser: (UserData) -> Unit,
    onSendFriendRequest: (UserData) -> Unit,
    onFollowUser: (UserData) -> Unit,
    onUnfollowUser: (UserData) -> Unit,
    onBlockUser: (UserData, Boolean) -> Unit,
    onUnblockUser: (UserData) -> Unit,
    onFollowOrganization: (Organization) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Hosted by",
            modifier = Modifier.widthIn(min = 84.dp, max = 108.dp),
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        )

        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = Alignment.CenterEnd,
        ) {
            when {
                isOrganizationEvent && organization != null -> {
                    OrganizationHostCardWithMenu(
                        organization = organization,
                        onFollowOrganization = onFollowOrganization,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                host != null && currentUser != null && currentUser.id.isNotBlank() -> {
                    PlayerCardWithActions(
                        player = host,
                        currentUser = currentUser,
                        modifier = Modifier.fillMaxWidth(),
                        onMessage = onMessageUser,
                        onSendFriendRequest = onSendFriendRequest,
                        onFollow = onFollowUser,
                        onUnfollow = onUnfollowUser,
                        onBlock = { user, leaveSharedChats ->
                            onBlockUser(user, leaveSharedChats)
                        },
                        onUnblock = onUnblockUser,
                    )
                }

                else -> {
                    Text(
                        text = fallbackHostDisplayName,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                        ),
                        color = MaterialTheme.colorScheme.onSurface,
                        textAlign = TextAlign.End,
                    )
                }
            }
        }
    }
}

@Composable
private fun OrganizationHostCardWithMenu(
    organization: Organization,
    onFollowOrganization: (Organization) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showMenu by remember(organization.id) { mutableStateOf(false) }
    val organizationName = organization.name.ifBlank { "Organization" }

    Box(
        modifier = modifier,
        contentAlignment = Alignment.TopEnd,
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { showMenu = true },
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
            ),
            border = BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            ),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                NetworkAvatar(
                    displayName = organizationName,
                    imageRef = organization.logoId,
                    size = 32.dp,
                    contentDescription = "$organizationName logo",
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            modifier = Modifier.weight(1f),
                            text = organizationName,
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontWeight = FontWeight.SemiBold,
                            ),
                            maxLines = 1,
                        )
                        OrganizationVerificationBadge(organization = organization)
                    }
                    organization.location
                        ?.takeIf(String::isNotBlank)
                        ?.let { location ->
                            Text(
                                text = location,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                }
            }
        }

        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
        ) {
            DropdownMenuItem(
                text = { Text("Follow") },
                onClick = {
                    onFollowOrganization(organization)
                    showMenu = false
                },
            )
        }
    }
}