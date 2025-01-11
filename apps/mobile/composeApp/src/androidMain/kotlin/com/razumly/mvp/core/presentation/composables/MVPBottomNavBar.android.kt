package com.razumly.mvp.core.presentation.composables

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
import com.razumly.mvp.home.presentation.HomeComponent.*

@Composable
actual fun MVPBottomNavBar(
    selectedPage: Any,
    onPageSelected: (Page) -> Unit,
    content: @Composable (PaddingValues) -> Unit
) {
    val items = listOf(
        NavigationItem(
            Page.EventList,
            "search",
            "Search"
        ),
        NavigationItem(
            Page.Following,
            "favorite",
            "Following"
        ),
        NavigationItem(
            Page.Create,
            "add",
            "Create"
        ),
        NavigationItem(
            Page.Profile,
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
                        selected = selectedPage == item.page,
                        onClick = { onPageSelected(item.page) },
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
