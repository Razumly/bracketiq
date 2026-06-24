package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import com.razumly.mvp.core.presentation.AppConfig
import com.razumly.mvp.core.presentation.CenterNavAction
import com.razumly.mvp.core.presentation.guides.AppGuideTargets
import com.razumly.mvp.core.presentation.guides.guideTarget
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.util.Platform

data class NavigationItem(
    val page: AppConfig,
    val icon: String, // Use string identifiers instead of ImageVector
    val titleResId: String // Use string instead of resource ID
)

@Composable
fun MVPBottomNavBar(
    selectedPage: AppConfig,
    unreadChatMessageCount: Int,
    pendingInviteCount: Int,
    centerAction: CenterNavAction,
    onCenterActionClick: () -> Unit,
    onPageSelected: (AppConfig) -> Unit,
    showNavBar: Boolean = true,
    content: @Composable (PaddingValues) -> Unit
) {
    val isIos = Platform.isIOS
    val items = listOf(
        NavigationItem(AppConfig.Search(), "search", "Discover"),
        NavigationItem(AppConfig.ChatList, "messages", "Messages"),
        NavigationItem(AppConfig.Schedule, "schedule", "Schedule"),
        NavigationItem(AppConfig.ProfileHome, "home", "Home")
    )

    var navBarHeight by remember { mutableStateOf(0.dp) }
    val localDensity = LocalDensity.current
    val unreadBadgeText = if (unreadChatMessageCount > 99) "99+" else unreadChatMessageCount.toString()
    val inviteBadgeText = if (pendingInviteCount > 99) "99+" else pendingInviteCount.toString()
    val iconSize = if (isIos) 22.dp else 24.dp
    val labelStyle = if (isIos) {
        MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp)
    } else {
        MaterialTheme.typography.labelMedium
    }
    val labelTextHeightDp = with(localDensity) {
        val labelTextUnit = if (labelStyle.lineHeight.isSpecified) {
            labelStyle.lineHeight
        } else {
            labelStyle.fontSize
        }
        labelTextUnit.toDp()
    }
    val iconContainerHeight = if (iconSize > 32.dp) iconSize else 32.dp
    // Math: icon container + icon/label spacing + label text + vertical breathing room.
    val minContentHeight = iconContainerHeight + 4.dp + labelTextHeightDp + 10.dp
    val navBarMinHeight = if (minContentHeight > 72.dp) minContentHeight else 72.dp
    val navBarInsets = if (isIos) {
        // iOS does not need additional bottom lift for system controls; keep only side safe-area.
        WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)
    } else {
        // Android devices may have gesture/3-button controls; respect the nav bar bottom inset.
        WindowInsets.navigationBars.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom)
    }
    val navItemColors = NavigationBarItemDefaults.colors(
        selectedIconColor = MaterialTheme.colorScheme.primary,
        selectedTextColor = MaterialTheme.colorScheme.primary,
        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Main content
        content(PaddingValues(bottom = if (showNavBar) navBarHeight else 0.dp))

        if (showNavBar) {
            // Navigation bar overlay
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .onGloballyPositioned { layoutCoordinates ->
                        navBarHeight = with(localDensity) {
                            layoutCoordinates.size.height.toDp()
                        }
                    }
            ) {
                NavigationBar(
                    modifier = Modifier
                        .zIndex(1f)
                        .heightIn(min = navBarMinHeight),
                    windowInsets = navBarInsets,
                ) {
                    items.forEachIndexed { index, item ->
                        NavigationBarItem(
                            icon = {
                                when (item.icon) {
                                    "search" -> Icon(
                                        Icons.Default.Search,
                                        contentDescription = item.titleResId,
                                        modifier = Modifier.size(iconSize),
                                    )
                                    "messages" -> BadgedBox(
                                        badge = {
                                            if (unreadChatMessageCount > 0) {
                                                Badge(
                                                    containerColor = MaterialTheme.colorScheme.primary,
                                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                                ) {
                                                    Text(unreadBadgeText)
                                                }
                                            }
                                        }
                                    ) {
                                        Icon(
                                            Icons.Default.MailOutline,
                                            contentDescription = item.titleResId,
                                            modifier = Modifier.size(iconSize),
                                        )
                                    }
                                    "schedule" -> Icon(
                                        Icons.Default.DateRange,
                                        contentDescription = item.titleResId,
                                        modifier = Modifier.size(iconSize),
                                    )
                                    "home" -> BadgedBox(
                                        badge = {
                                            if (pendingInviteCount > 0) {
                                                Badge(
                                                    containerColor = MaterialTheme.colorScheme.primary,
                                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                                ) {
                                                    Text(inviteBadgeText)
                                                }
                                            }
                                        }
                                    ) {
                                        Icon(
                                            Icons.Default.Home,
                                            contentDescription = item.titleResId,
                                            modifier = Modifier.size(iconSize),
                                        )
                                    }
                                }
                            },
                            label = {
                                Text(
                                    text = item.titleResId,
                                    style = labelStyle,
                                    maxLines = 1,
                                    softWrap = false,
                                )
                            },
                            selected = isNavigationItemSelected(
                                selectedPage = selectedPage,
                                itemPage = item.page,
                            ),
                            colors = navItemColors,
                            onClick = { onPageSelected(item.page) }
                        )
                        if (index == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }

                CenterNavButton(
                    action = centerAction,
                    onClick = onCenterActionClick,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .offset(y = (-18).dp)
                        .zIndex(2f)
                        .guideTarget(AppGuideTargets.BottomNavCenterAction),
                )
            }
        }
    }
}

private fun isNavigationItemSelected(selectedPage: AppConfig, itemPage: AppConfig): Boolean {
    return when (itemPage) {
        is AppConfig.Search -> selectedPage is AppConfig.Search
        AppConfig.ChatList -> selectedPage == AppConfig.ChatList
        AppConfig.Schedule -> selectedPage == AppConfig.Schedule
        AppConfig.ProfileHome -> selectedPage == AppConfig.ProfileHome
        else -> selectedPage == itemPage
    }
}

@Composable
private fun CenterNavButton(
    action: CenterNavAction,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(78.dp)
            .shadow(
                elevation = 12.dp,
                shape = CircleShape,
                clip = false,
            )
            .background(MaterialTheme.colorScheme.surface, CircleShape)
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .clip(CircleShape)
                .clickable(onClick = onClick),
            shape = CircleShape,
            color = when (action) {
                CenterNavAction.CreateEvent -> MaterialTheme.colorScheme.onSurface
                is CenterNavAction.EventShortcut,
                is CenterNavAction.MatchShortcut -> MaterialTheme.colorScheme.surfaceVariant
            },
            contentColor = when (action) {
                CenterNavAction.CreateEvent -> MaterialTheme.colorScheme.surface
                is CenterNavAction.EventShortcut,
                is CenterNavAction.MatchShortcut -> MaterialTheme.colorScheme.onSurfaceVariant
            },
        ) {
            when (action) {
                CenterNavAction.CreateEvent -> {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = "Create event",
                            modifier = Modifier.size(34.dp),
                        )
                    }
                }

                is CenterNavAction.EventShortcut -> {
                    EventShortcutCenterContent(
                        eventName = action.eventName,
                        eventImageId = action.eventImageId,
                        contentDescription = "Open ${action.eventName.ifBlank { "event" }}",
                    )
                }

                is CenterNavAction.MatchShortcut -> {
                    EventShortcutCenterContent(
                        eventName = action.eventName,
                        eventImageId = action.eventImageId,
                        contentDescription = "Open match for ${action.eventName.ifBlank { "event" }}",
                    )
                }
            }
        }
    }
}

@Composable
private fun EventShortcutCenterContent(
    eventName: String,
    eventImageId: String,
    contentDescription: String,
) {
    val imageUrl = remember(eventImageId) {
        eventImageId
            .trim()
            .takeIf(String::isNotEmpty)
            ?.let { imageId -> getImageUrl(fileId = imageId, width = 160, height = 160) }
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clip(CircleShape)
            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.65f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (imageUrl == null) {
            Text(
                text = eventName.trim().firstOrNull()?.uppercase() ?: "+",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            AsyncImage(
                model = imageUrl,
                contentDescription = contentDescription,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
