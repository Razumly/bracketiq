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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navigation
import androidx.navigation.toRoute
import com.example.compose.MVPTheme
import com.google.android.libraries.places.api.Places
import com.razumly.mvp.android.createEvent.CreateEventScreen
import com.razumly.mvp.android.eventContent.matchDetailScreen.MatchDetailScreen
import com.razumly.mvp.android.navTypes.CustomNavType
import com.razumly.mvp.android.userAuth.loginScreen.LoginScreen
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.presentation.MainViewModel
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

val LocalUserSession = compositionLocalOf<UserData?> { null }
val LocalNavController = compositionLocalOf<NavController> { error("No NavController provided") }

@Composable
fun App(activity: ComponentActivity) {
    val navController = rememberNavController()
    val sharedViewModel: MainViewModel = koinNavViewModel()

    // Track current route to determine bottom bar visibility
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val shouldShowBottomBar = currentRoute != LoginRoute.toString()
    val currentUser = remember { mutableStateOf<UserData?>(null) }
    Places.initialize(activity, BuildConfig.googleMapsApiKey)

    LaunchedEffect(Unit) {
        with(sharedViewModel) {
            permissionsController.bind(activity)
            locationTracker.bind(activity)
            onStartTracking()
        }
    }
    CompositionLocalProvider(LocalNavController provides navController) {
        MVPBottomNavBar(shouldShowBottomBar) { paddingValues ->
            CompositionLocalProvider(LocalUserSession provides currentUser.value) {
                NavHost(
                    navController = navController,
                    startDestination = LoginRoute,
                    modifier = Modifier.padding(paddingValues)
                ) {
                    composable<LoginRoute> {
                        LoginScreen(
                            viewModel = sharedViewModel,
                            onNavigateToHome = { userData ->
                                currentUser.value = userData
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
                                typeOf<EventAbs>() to CustomNavType.EventType,
                            )
                        ) { backStackEntry ->
                            val arguments = backStackEntry.toRoute<TournamentDetailRoute>()

                            TournamentDetailScreen(
                                tournamentId = arguments.tournamentId,
                                onNavToListScreen = {
                                    navController.navigate(EventListRoute)
                                },
                                onMatchClick = { match ->
                                    navController.navigate(
                                        MatchDetailRoute(
                                            match,
                                        )
                                    )
                                },
                            )
                        }

                        composable<MatchDetailRoute>(
                            typeMap = mapOf(
                                typeOf<MatchMVP>() to CustomNavType.MatchMVPType,
                                typeOf<Tournament>() to CustomNavType.TournamentType,
                            )
                        ) { backStackEntry ->
                            val arguments = backStackEntry.toRoute<MatchDetailRoute>()

                            MatchDetailScreen(arguments.match)
                        }

                        composable<CreateRoute> {
                            CreateEventScreen()
                        }
                    }
                }
            }
        }
    }
}