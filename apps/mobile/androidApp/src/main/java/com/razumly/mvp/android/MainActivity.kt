package com.razumly.mvp.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.razumly.mvp.android.homeScreen.HomeScreen
import com.razumly.mvp.android.loginScreen.LoginScreen
import com.razumly.mvp.core.presentation.MainViewModel
import org.koin.androidx.compose.KoinAndroidContext
import org.koin.androidx.compose.navigation.koinNavViewModel
import org.koin.core.annotation.KoinExperimentalAPI

@OptIn(KoinExperimentalAPI::class)
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MyApplicationTheme {
                KoinAndroidContext {
                    val viewModel: MainViewModel = koinNavViewModel()
                    AppNavigation(viewModel)
                }
            }
        }
    }
}

@Composable
fun AppNavigation(viewModel: MainViewModel) {
    val navController = rememberNavController()

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
                    navController.navigate("home") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }

        composable("home") { entry ->
            val backStackEntry = remember(entry) {
                navController.getBackStackEntry("root")
            }
            val sharedViewModel: MainViewModel = koinNavViewModel(
                viewModelStoreOwner = backStackEntry
            )

            HomeScreen(
                viewModel = sharedViewModel,
                onNavigateToLogin = {
                    navController.navigate("login") {
                        popUpTo("home") { inclusive = true }
                    }
                }
            )
        }
    }
}
