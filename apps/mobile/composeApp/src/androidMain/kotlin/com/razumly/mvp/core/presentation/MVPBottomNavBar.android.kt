package com.razumly.mvp.core.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
actual fun MVPBottomNavBar(
    selectedTab: Any,
    onTabSelected: (Tab) -> Unit,
    content: @Composable (PaddingValues) -> Unit
) {
    val items = listOf(
        NavigationItem(
            Tab.EventList,
            "search",
            "Search"
        ),
        NavigationItem(
            Tab.Following,
            "favorite",
            "Following"
        ),
        NavigationItem(
            Tab.Create,
            "add",
            "Create"
        ),
        NavigationItem(
            Tab.Profile,
            "person",
            "Profile"
        )
    )

    Scaffold(
        bottomBar = {
            NavigationBar(
                modifier = Modifier,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                items.forEach { item ->
                    NavigationBarItem(
                        icon = {
                            when (item.icon) {
                                "search" -> Icon(Icons.Default.Search, contentDescription = item.titleResId)
                                "favorite" -> Icon(Icons.Default.Favorite, contentDescription = item.titleResId)
                                "add" -> Icon(Icons.Default.Add, contentDescription = item.titleResId)
                                "person" -> Icon(Icons.Default.Person, contentDescription = item.titleResId)
                            }
                        },
                        label = { Text(item.titleResId) },
                        selected = selectedTab == item.tab,
                        onClick = { onTabSelected(item.tab) },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = MaterialTheme.colorScheme.secondaryContainer
                        )
                    )
                }
            }
        }
    ) { paddingValues ->
        content(paddingValues)
    }
}
