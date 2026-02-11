package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.presentation.AppConfig

data class NavigationItem(
    val page: AppConfig,
    val icon: String, // Use string identifiers instead of ImageVector
    val titleResId: String // Use string instead of resource ID
)

@Composable
fun MVPBottomNavBar(
    selectedPage: AppConfig,
    onPageSelected: (AppConfig) -> Unit,
    content: @Composable (PaddingValues) -> Unit
) {
    val items = listOf(
        NavigationItem(AppConfig.Search(),"search","Discover"),
        NavigationItem(AppConfig.ChatList,"messages", "Messages"),
        NavigationItem(AppConfig.Create, "add", "Create"),
        NavigationItem(AppConfig.ProfileHome, "person", "Profile")
    )

    var navBarHeight by remember { mutableStateOf(0.dp) }
    val localDensity = LocalDensity.current

    Box(modifier = Modifier.fillMaxSize()) {
        // Main content
        content(PaddingValues(bottom = navBarHeight))

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
                    .zIndex(1f),
            ) {
                items.forEach { item ->
                    NavigationBarItem(
                        icon = {
                            when (item.icon) {
                                "search" -> Icon(
                                    Icons.Default.Search,
                                    contentDescription = item.titleResId
                                )
                                "messages" -> Icon(
                                    Icons.Default.MailOutline,
                                    contentDescription = item.titleResId
                                )
                                "add" -> Icon(
                                    Icons.Default.Add,
                                    contentDescription = item.titleResId
                                )
                                "person" -> Icon(
                                    Icons.Default.Person,
                                    contentDescription = item.titleResId
                                )
                            }
                        },
                        label = { Text(item.titleResId) },
                        selected = selectedPage == item.page,
                        onClick = { onPageSelected(item.page) }
                    )
                }
            }
        }
    }
}

