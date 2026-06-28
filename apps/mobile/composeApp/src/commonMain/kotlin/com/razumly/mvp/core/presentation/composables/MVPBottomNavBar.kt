package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import com.razumly.mvp.core.presentation.AppConfig
import com.razumly.mvp.core.presentation.CenterNavAction
import com.razumly.mvp.core.presentation.guides.AppGuideTargets
import com.razumly.mvp.core.presentation.guides.GuideHighlightShape
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
    val iconSize = 24.dp
    val navBarHeightDp = if (Platform.isIOS) 36.dp else 56.dp
    val navHorizontalPadding = if (Platform.isIOS) 16.dp else 0.dp
    val centerButtonSize = 64.dp
    val centerButtonOffsetY = (-14).dp
    val bottomSafeAreaPadding = with(localDensity) {
        WindowInsets.safeDrawing.getBottom(this).toDp()
    }
    val navBarContainerHeight = navBarHeightDp + bottomSafeAreaPadding
    val navContentOffsetY = (navBarContainerHeight * 0.30f) - (navBarHeightDp / 2)
    val navBarContainerColor = MaterialTheme.colorScheme.surfaceContainer

    Box(modifier = Modifier.fillMaxSize()) {
        // Main content
        content(PaddingValues(bottom = if (showNavBar) navBarHeight else 0.dp))

        if (showNavBar) {
            // Navigation bar overlay
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(navBarContainerHeight)
                    .background(navBarContainerColor)
                    .onGloballyPositioned { layoutCoordinates ->
                        navBarHeight = with(localDensity) {
                            layoutCoordinates.size.height.toDp()
                        }
                    }
            ) {
                Row(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .zIndex(1f)
                        .fillMaxWidth()
                        .height(navBarHeightDp)
                        .offset(y = navContentOffsetY)
                        .padding(horizontal = navHorizontalPadding),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    items.forEachIndexed { index, item ->
                        BottomNavIconButton(
                            item = item,
                            selected = isNavigationItemSelected(
                                selectedPage = selectedPage,
                                itemPage = item.page,
                            ),
                            iconSize = iconSize,
                            unreadBadgeText = unreadBadgeText,
                            inviteBadgeText = inviteBadgeText,
                            showUnreadBadge = unreadChatMessageCount > 0,
                            showInviteBadge = pendingInviteCount > 0,
                            onClick = { onPageSelected(item.page) },
                        )
                        if (index == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }

                CenterNavButton(
                    action = centerAction,
                    size = centerButtonSize,
                    onClick = onCenterActionClick,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .offset(y = centerButtonOffsetY)
                        .zIndex(2f)
                        .guideTarget(
                            targetId = AppGuideTargets.BottomNavCenterAction,
                            highlightShape = GuideHighlightShape.Circle,
                        ),
                )
            }
        }
    }
}

@Composable
private fun RowScope.BottomNavIconButton(
    item: NavigationItem,
    selected: Boolean,
    iconSize: androidx.compose.ui.unit.Dp,
    unreadBadgeText: String,
    inviteBadgeText: String,
    showUnreadBadge: Boolean,
    showInviteBadge: Boolean,
    onClick: () -> Unit,
) {
    val iconColor = if (selected) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    Box(
        modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(width = 56.dp, height = 32.dp)
                .clip(CircleShape)
                .background(
                    if (selected) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        Color.Transparent
                    }
                ),
            contentAlignment = Alignment.Center,
        ) {
            when (item.icon) {
                "search" -> BottomNavIcon(
                    icon = Icons.Default.Search,
                    contentDescription = item.titleResId,
                    iconSize = iconSize,
                    tint = iconColor,
                )

                "messages" -> BadgedBox(
                    badge = {
                        if (showUnreadBadge) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary,
                            ) {
                                Text(unreadBadgeText)
                            }
                        }
                    }
                ) {
                    BottomNavIcon(
                        icon = Icons.Default.MailOutline,
                        contentDescription = item.titleResId,
                        iconSize = iconSize,
                        tint = iconColor,
                    )
                }

                "schedule" -> BottomNavIcon(
                    icon = Icons.Default.DateRange,
                    contentDescription = item.titleResId,
                    iconSize = iconSize,
                    tint = iconColor,
                )

                "home" -> BadgedBox(
                    badge = {
                        if (showInviteBadge) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary,
                            ) {
                                Text(inviteBadgeText)
                            }
                        }
                    }
                ) {
                    BottomNavIcon(
                        icon = Icons.Default.Home,
                        contentDescription = item.titleResId,
                        iconSize = iconSize,
                        tint = iconColor,
                    )
                }
            }
        }
    }
}

@Composable
private fun BottomNavIcon(
    icon: ImageVector,
    contentDescription: String,
    iconSize: androidx.compose.ui.unit.Dp,
    tint: Color,
) {
    Icon(
        imageVector = icon,
        contentDescription = contentDescription,
        tint = tint,
        modifier = Modifier.size(iconSize),
    )
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
    size: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .shadow(
                elevation = 12.dp,
                shape = CircleShape,
                clip = false,
            )
            .background(MaterialTheme.colorScheme.surface, CircleShape)
            .padding(6.dp),
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
                            modifier = Modifier.size(28.dp),
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
