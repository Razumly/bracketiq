package com.razumly.mvp.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.ProfileActionChildren
import com.razumly.mvp.icons.ProfileActionClearCache
import com.razumly.mvp.icons.ProfileActionDetails
import com.razumly.mvp.icons.ProfileActionEvents
import com.razumly.mvp.icons.ProfileActionMemberships
import com.razumly.mvp.icons.ProfileActionPaymentPlans
import com.razumly.mvp.icons.ProfileActionPayments
import com.razumly.mvp.icons.ProfileActionRefunds
import com.razumly.mvp.icons.ProfileActionTeams
import com.razumly.mvp.icons.Groups

private data class ProfileAction(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val onClick: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileHomeScreen(component: ProfileComponent) {
    val navPadding = LocalNavBarPadding.current
    val showChildrenTab by component.showChildrenTab.collectAsState()
    val actions = remember(component, showChildrenTab) {
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
                    title = "Payments",
                    description = "Stripe account actions",
                    icon = MVPIcons.ProfileActionPayments,
                    onClick = component::navigateToPayments,
                ),
            )
            add(
                ProfileAction(
                    title = "Payment Plans",
                    description = "Installment plan section",
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
                    title = "My Schedule",
                    description = "Events and matches I attend",
                    icon = Icons.Default.DateRange,
                    onClick = component::navigateToMySchedule,
                ),
            )
            add(
                ProfileAction(
                    title = "Teams",
                    description = "Team management",
                    icon = MVPIcons.ProfileActionTeams,
                    onClick = component::manageTeams,
                ),
            )
            add(
                ProfileAction(
                    title = "Event Management",
                    description = "Event management",
                    icon = MVPIcons.ProfileActionEvents,
                    onClick = component::manageEvents,
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
            add(
                ProfileAction(
                    title = "Clear Cache",
                    description = "Reset local cached data",
                    icon = MVPIcons.ProfileActionClearCache,
                    onClick = component::clearCache,
                ),
            )
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Profile") },
            )
        },
    ) { innerPadding ->
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(navPadding),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(actions) { action ->
                ProfileActionCard(action = action)
            }

            item(span = { GridItemSpan(2) }) {
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = component::onLogout,
                ) {
                    Text("Logout")
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
        ) {
            Text(
                text = action.title,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopStart),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Icon(
                imageVector = action.icon,
                contentDescription = action.title,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxHeight(0.5f)
                    .aspectRatio(1f),
            )

            Text(
                text = action.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomStart),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
