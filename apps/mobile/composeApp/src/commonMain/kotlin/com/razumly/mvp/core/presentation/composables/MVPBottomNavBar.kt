package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemColors
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.razumly.mvp.core.presentation.MVPTransparency
import com.razumly.mvp.core.presentation.navBarGradientStart
import com.razumly.mvp.core.presentation.selectedNavBar
import com.razumly.mvp.home.HomeComponent.Page

data class NavigationItem(
    val page: Page,
    val icon: String, // Use string identifiers instead of ImageVector
    val titleResId: String // Use string instead of resource ID
)

@Composable
fun MVPBottomNavBar(
    selectedPage: Page,
    onPageSelected: (Page) -> Unit,
    content: @Composable (PaddingValues) -> Unit
) {
    val items = listOf(
        NavigationItem(Page.Search,"search","Search"),
        NavigationItem(Page.Following,"favorite", "Following"),
        NavigationItem(Page.Create, "add", "Create"),
        NavigationItem(Page.Profile, "person", "Profile")
    )
    val colorStops = arrayOf(
        0.0f to MVPTransparency,
        0.25f to navBarGradientStart,
        1f to navBarGradientStart
    )
    val navigationBarHeight = WindowInsets.navigationBars.getBottom(LocalDensity.current).dp + 16.dp

    Box(modifier = Modifier.fillMaxSize()) {
        // Main content
        content(PaddingValues(bottom = navigationBarHeight))

        // Navigation bar overlay
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .background(Brush.verticalGradient(colorStops = colorStops)),
        ) {
            NavigationBar(
                containerColor = Color.Transparent,
                modifier = Modifier
                    .zIndex(1f)
                    .padding(top = 16.dp),
            ) {
                items.forEach { item ->
                    NavigationBarItem(
                        icon = {
                            when (item.icon) {
                                "search" -> Icon(
                                    Icons.Default.Search,
                                    contentDescription = item.titleResId
                                )
                                "favorite" -> Icon(
                                    Icons.Default.Favorite,
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
                        onClick = { onPageSelected(item.page) },
                        colors = NavigationBarItemColors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            selectedIndicatorColor = selectedNavBar,
                            unselectedIconColor = MaterialTheme.colorScheme.onPrimary,
                            unselectedTextColor = MaterialTheme.colorScheme.onPrimary,
                            disabledIconColor = MaterialTheme.colorScheme.outlineVariant,
                            disabledTextColor = MaterialTheme.colorScheme.outlineVariant
                        )
                    )
                }
            }
        }
    }
}

