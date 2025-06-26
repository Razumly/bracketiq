package com.razumly.mvp.profile

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.presentation.composables.PaymentProcessorButton
import com.razumly.mvp.core.util.LocalErrorHandler
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.eventDetail.DefaultEventDetailComponent
import com.razumly.mvp.home.LocalNavBarPadding

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(component: ProfileComponent) {
    val errorHandler = LocalErrorHandler.current
    val navPadding = LocalNavBarPadding.current
    val loadingHandler = LocalLoadingHandler.current

    LaunchedEffect(Unit) {
        component.setLoadingHandler(loadingHandler)
    }


    LaunchedEffect(Unit) {
        component.errorState.collect { error ->
            if (error != null) {
                errorHandler.showError(error.message)
            }
        }
    }
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Profile") },
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(navPadding)
                .padding(bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Button(onClick = { component.manageTeams() }){
                Text("Manage Teams")
            }
            Button(
                onClick = { component.clearCache() },
            ) {
                Text("Clear Cache")
            }
            Button(
                onClick = { component.manageEvents() },
            ) {
                Text("Manage Events")
            }
            PaymentProcessorButton(
                onClick = { component.manageStripeAccount() }, component,"Manage Stripe Account"
            )
            Button(
                onClick = { component.onLogout() },
            ) {
                Text("Logout")
            }
        }
    }
}