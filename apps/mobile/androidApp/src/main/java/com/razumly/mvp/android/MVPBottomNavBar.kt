package com.razumly.mvp.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.currentBackStackEntryAsState

sealed class NavigationItem(var route: Any, val icon: ImageVector, var title: Int) {
    data object Search : NavigationItem(
        EventListRoute,
        Icons.Default.Search,
        R.string.navMenuSearch
    )

    data object Following : NavigationItem(
        FollowingRoute,
        Icons.Default.Favorite,
        R.string.navMenuFollowing
    )

    data object Play : NavigationItem(
        CreateRoute,
        Icons.Default.PlayArrow,
        R.string.navMenuPlay
    )

    data object Profile : NavigationItem(
        ProfileRoute,
        Icons.Default.Person,
        R.string.navMenuProfile
    )
}

@Composable
fun MVPBottomNavBar(shouldShowBottomBar: Boolean, content: @Composable (PaddingValues) -> Unit) {
    val items = listOf(
        NavigationItem.Search,
        NavigationItem.Following,
        NavigationItem.Play,
        NavigationItem.Profile
    )

    val navController = LocalNavController.current
    val activity = LocalContext.current as ComponentActivity
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val selectedItem = rememberSaveable { mutableIntStateOf(0) }

    items.forEachIndexed { index, navigationItem ->
        if (navigationItem.route.toString() == currentRoute) {
            selectedItem.intValue = index
        }
    }

    Scaffold(
        bottomBar = {
            if (shouldShowBottomBar) {
                Box(
                    modifier = Modifier.background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                                MaterialTheme.colorScheme.surface
                            ),
                            startY = 0f,
                            endY = 150f
                        )
                    )
                ) {
                    NavigationBar(
                        modifier = Modifier.background(Color.Transparent),
                        containerColor = Color.Transparent
                    ) {
                        items.forEachIndexed { index, item ->
                            NavigationBarItem(
                                icon = { Icon(item.icon, activity.getString(item.title)) },
                                label = { Text(activity.getString(item.title)) },
                                selected = selectedItem.intValue == index,
                                onClick = { navController.navigate(item.route) },
                                colors = NavigationBarItemDefaults.colors(
                                    indicatorColor = MaterialTheme.colorScheme.secondaryContainer.copy(
                                        alpha = 0.5f
                                    ),
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurface.copy(
                                        alpha = 0.6f
                                    ),
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurface.copy(
                                        alpha = 0.6f
                                    )
                                )
                            )
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        content(paddingValues)
    }
}