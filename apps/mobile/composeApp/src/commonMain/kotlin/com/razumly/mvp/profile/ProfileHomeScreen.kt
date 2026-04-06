package com.razumly.mvp.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.ProfileActionChildren
import com.razumly.mvp.icons.ProfileActionDetails
import com.razumly.mvp.icons.ProfileActionEvents
import com.razumly.mvp.icons.ProfileActionMemberships
import com.razumly.mvp.icons.ProfileActionPaymentPlans
import com.razumly.mvp.icons.ProfileActionPayments
import com.razumly.mvp.icons.ProfileActionRefunds
import com.razumly.mvp.icons.ProfileActionTeams
import com.razumly.mvp.icons.Groups
import mvp.composeapp.generated.resources.Res
import mvp.composeapp.generated.resources.mvp_logo
import mvp.composeapp.generated.resources.mvp_logo_white_bg
import org.jetbrains.compose.resources.painterResource

private data class ProfileAction(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val onClick: () -> Unit,
    val badgeCount: Int = 0,
)

@Composable
fun ProfileHomeScreen(component: ProfileComponent) {
    val navPadding = LocalNavBarPadding.current
    val isDarkTheme = isSystemInDarkTheme()
    val showChildrenTab by component.showChildrenTab.collectAsState()
    val hasStripeAccount by component.isStripeAccountConnected.collectAsState()
    val pushTargetDebugState by component.pushTargetDebugState.collectAsState()
    val pendingInviteCount by component.pendingInviteCount.collectAsState()
    val headerLogo = if (isDarkTheme) Res.drawable.mvp_logo else Res.drawable.mvp_logo_white_bg
    val actions = remember(component, showChildrenTab, hasStripeAccount, pendingInviteCount) {
        buildList {
            add(
                ProfileAction(
                    title = "Profile Details",
                    description = "Update profile and password",
                    icon = MVPIcons.ProfileActionDetails,
                    onClick = component::navigateToProfileDetails,
                ),
            )
            add(
                ProfileAction(
                    title = "My Schedule",
                    description = "Events and matches I attend",
                    icon = Icons.Default.DateRange,
                    onClick = component::navigateToMySchedule,
                ),
            )
            add(
                ProfileAction(
                    title = "Event Management",
                    description = "Manage your events",
                    icon = MVPIcons.ProfileActionEvents,
                    onClick = component::manageEvents,
                ),
            )
            add(
                ProfileAction(
                    title = "Teams",
                    description = "Manage your teams",
                    icon = MVPIcons.ProfileActionTeams,
                    onClick = component::manageTeams,
                ),
            )
            add(
                ProfileAction(
                    title = "Manage Stripe",
                    description = if (hasStripeAccount) {
                        "Manage your Stripe account"
                    } else {
                        "Connect your Stripe account"
                    },
                    icon = MVPIcons.ProfileActionPayments,
                    onClick = if (hasStripeAccount) {
                        component::manageStripeAccount
                    } else {
                        component::manageStripeAccountOnboarding
                    },
                ),
            )
            add(
                ProfileAction(
                    title = "Bills",
                    description = "Billing and installment plans",
                    icon = MVPIcons.ProfileActionPaymentPlans,
                    onClick = component::navigateToPaymentPlans,
                ),
            )
            add(
                ProfileAction(
                    title = "Memberships",
                    description = "Recurring membership section",
                    icon = MVPIcons.ProfileActionMemberships,
                    onClick = component::navigateToMemberships,
                ),
            )
            add(
                ProfileAction(
                    title = "Event Templates",
                    description = "Reusable event templates",
                    icon = MVPIcons.ProfileActionEvents,
                    onClick = component::navigateToEventTemplates,
                ),
            )
            if (showChildrenTab) {
                add(
                    ProfileAction(
                        title = "Children",
                        description = "Linked child profiles",
                        icon = MVPIcons.ProfileActionChildren,
                        onClick = component::navigateToChildren,
                    ),
                )
            }
            add(
                ProfileAction(
                    title = "Invites",
                    description = "Pending invites to review",
                    icon = Icons.Default.Email,
                    onClick = component::navigateToInvites,
                    badgeCount = pendingInviteCount,
                ),
            )
            add(
                ProfileAction(
                    title = "Connections",
                    description = "Friends and following",
                    icon = MVPIcons.Groups,
                    onClick = component::navigateToConnections,
                ),
            )
            add(
                ProfileAction(
                    title = "Documents",
                    description = "Sign and review documents",
                    icon = MVPIcons.ProfileActionDetails,
                    onClick = component::navigateToDocuments,
                ),
            )
            add(
                ProfileAction(
                    title = "Refund Requests",
                    description = "Refund moderation",
                    icon = MVPIcons.ProfileActionRefunds,
                    onClick = component::manageRefunds,
                ),
            )
        }
    }

    Scaffold(
        topBar = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .height(72.dp),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(headerLogo),
                    contentDescription = "Home",
                    modifier = Modifier.fillMaxHeight(),
                    tint = Color.Unspecified,
                )
            }
        },
    ) { innerPadding ->
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(
                start = 16.dp,
                top = 12.dp,
                end = 16.dp,
                bottom = 16.dp + navPadding.calculateBottomPadding(),
            ),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(actions) { action ->
                ProfileActionCard(action = action)
            }

            if (Platform.isNonReleaseBuild) {
                item(span = { GridItemSpan(2) }) {
                    PushTargetDebugCard(
                        state = pushTargetDebugState,
                        onCheckStatus = { component.refreshPushTargetDebugStatus() },
                        onSyncAndCheck = { component.refreshPushTargetDebugStatus(syncBeforeCheck = true) },
                    )
                }
            }

            item(span = { GridItemSpan(2) }) {
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = component::onLogout,
                ) {
                    Text(
                        text = "Logout",
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileActionCard(action: ProfileAction) {
    Card(
        onClick = action.onClick,
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = action.title,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
                maxLines = 1,
                minLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                BadgedBox(
                    modifier = Modifier
                        .fillMaxHeight(0.8f)
                        .aspectRatio(1f),
                    badge = {
                        if (action.badgeCount > 0) {
                            Badge {
                                Text(action.badgeCount.toString())
                            }
                        }
                    },
                ) {
                    Icon(
                        imageVector = action.icon,
                        contentDescription = action.title,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            Text(
                text = action.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
                maxLines = 2,
                minLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun PushTargetDebugCard(
    state: ProfilePushTargetDebugState,
    onCheckStatus: () -> Unit,
    onSyncAndCheck: () -> Unit,
) {
    val status = state.status
    val isAssociated = status?.hasTopicTargetForUser == true || status?.hasProvidedTokenOnTopic == true

    Card(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Push Target Debug",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "Check if this device token is linked to your push target topic.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    enabled = !state.isLoading,
                    onClick = onCheckStatus,
                ) {
                    Text(
                        text = "Check",
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }
                Button(
                    modifier = Modifier.weight(1f),
                    enabled = !state.isLoading,
                    onClick = onSyncAndCheck,
                ) {
                    Text(
                        text = "Sync + Check",
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }
            }

            if (state.isLoading) {
                Text(
                    text = "Checking...",
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            state.error?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            status?.let {
                Text(
                    text = "Associated: ${if (isAssociated) "Yes" else "No"}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "User: ${it.userId ?: "Unavailable"}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Topic: ${it.topicId ?: "Unavailable"}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Local token: ${maskToken(it.localPushToken)}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Local target: ${it.localPushTarget ?: "Unavailable"}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Any target on user: ${it.hasAnyTargetForUser}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Topic target on user: ${it.hasTopicTargetForUser}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Token belongs to user: ${it.hasProvidedTokenForUser}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = "Token mapped to topic: ${it.hasProvidedTokenOnTopic}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            state.lastCheckedAt?.let { checkedAt ->
                Text(
                    text = "Last checked: $checkedAt",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun maskToken(value: String?): String {
    val token = value?.trim().orEmpty()
    if (token.isBlank()) return "Unavailable"
    if (token.length <= 24) return token
    return "${token.take(10)}...${token.takeLast(10)}"
}
