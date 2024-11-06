package com.razumly.mvp.android

import EventListScreen
import TournamentDetailScreen
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navigation
import androidx.navigation.toRoute
import com.example.compose.MVPTheme
import com.razumly.mvp.android.navTypes.CustomNavType
import com.razumly.mvp.android.userAuth.loginScreen.LoginScreen
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.presentation.MainViewModel
import kotlinx.serialization.Serializable
import org.koin.androidx.compose.KoinAndroidContext
import org.koin.androidx.compose.navigation.koinNavViewModel
import kotlin.reflect.typeOf

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MVPTheme(
                dynamicColor = false
            ) {
                KoinAndroidContext {
                    App(this)
                }
            }
        }
    }
}

@Serializable
data object HomeRoute

@Serializable
data object LoginRoute

@Serializable
data class TournamentDetailRoute(
    val tournamentId: String
)

@Serializable
data object EventListRoute

@Serializable
data object FollowingRoute

@Serializable
data object PlayRoute

@Serializable
data object ProfileRoute

sealed class NavigationItem(var route: Any, val icon: ImageVector, var title: Int) {
    data object Search : NavigationItem(
        EventListRoute,
        Icons.Default.Search,
        R.string.navMenuSearch
    )

    data object Following : NavigationItem(
        FollowingRoute,
        Icons.Default.Favorite,
        R.string.navMenuPlay
    )

    data object Play : NavigationItem(
        PlayRoute,
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
fun App(activity: ComponentActivity) {
    val navController = rememberNavController()
    val sharedViewModel: MainViewModel = koinNavViewModel()

    // Track current route to determine bottom bar visibility
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val shouldShowBottomBar = currentRoute != LoginRoute.toString()

    val items = listOf(
        NavigationItem.Search,
        NavigationItem.Following,
        NavigationItem.Play,
        NavigationItem.Profile
    )

    val selectedItem = remember { mutableIntStateOf(0) }

    items.forEachIndexed { index, navigationItem ->
        if (navigationItem.route.toString() == currentRoute) {
            selectedItem.intValue = index
        }
    }

    LaunchedEffect(Unit) {
        with(sharedViewModel) {
            permissionsController.bind(activity)
            locationTracker.bind(activity)
            onStartTracking()
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
                                onClick = { },
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
        NavHost(
            navController = navController,
            startDestination = LoginRoute,
            modifier = Modifier.padding(paddingValues)
        ) {
            composable<LoginRoute> {
                LoginScreen(
                    viewModel = sharedViewModel,
                    onNavigateToHome = {
                        navController.navigate(HomeRoute) {
                            popUpTo(LoginRoute) { inclusive = true }
                        }
                    }
                )
            }

            navigation<HomeRoute>(
                startDestination = EventListRoute
            ) {
                composable<EventListRoute> {
                    EventListScreen(
                        onTournamentSelected = {
                            navController.navigate(TournamentDetailRoute(it))
                        }
                    )
                }
                composable<TournamentDetailRoute>(
                    typeMap = mapOf(
                        typeOf<EventAbs>() to CustomNavType.EventType
                    )
                ) {
                    val arguments = it.toRoute<TournamentDetailRoute>()
                    TournamentDetailScreen(
                        arguments.tournamentId,
                        onNavToListScreen = {
                            navController.navigate(EventListRoute)
                        }
                    )
                }
            }
        }
    }
}