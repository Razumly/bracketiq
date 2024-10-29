package com.razumly.mvp.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.razumly.mvp.android.eventSearch.eventsScreen.EventsScreen
import com.razumly.mvp.android.userAuth.loginScreen.LoginScreen
import com.razumly.mvp.core.presentation.MainViewModel
import dev.icerock.moko.geo.LocationTracker
import dev.icerock.moko.permissions.PermissionsController
import org.koin.androidx.compose.KoinAndroidContext
import org.koin.androidx.compose.navigation.koinNavViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MyApplicationTheme {
                KoinAndroidContext {
                    App(this)
                }
            }
        }
    }
}

@Composable
fun App(activity: ComponentActivity) {
    val navController = rememberNavController()
    val sharedViewModel: MainViewModel = koinNavViewModel()
    LaunchedEffect(Unit) {
        with(sharedViewModel) {
            permissionsController.bind(activity)
            locationTracker.bind(activity)
            onStartTracking()
        }
    }

    NavHost(
        navController = navController,
        startDestination = "login",
        route = "root"
    ) {
        composable("login") { entry ->
            // Share ViewModel across navigation
            val backStackEntry = remember(entry) {
                navController.getBackStackEntry("root")
            }
            val sharedViewModel: MainViewModel = koinNavViewModel(
                viewModelStoreOwner = backStackEntry
            )


            LoginScreen(
                viewModel = sharedViewModel,
                onNavigateToHome = {
                    navController.navigate("events") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }

        composable("events") { entry ->
            EventsScreen(
                viewModel = sharedViewModel,
                onNavigateToLogin = {
                    navController.navigate("login") {
                        popUpTo("events") { inclusive = true }
                    }
                }
            )
        }
    }
}
