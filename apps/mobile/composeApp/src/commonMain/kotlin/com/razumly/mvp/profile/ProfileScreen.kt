package com.razumly.mvp.profile

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.razumly.mvp.home.LocalNavBarPadding

@Composable
fun ProfileScreen(component: ProfileComponent) {
    val navPadding = LocalNavBarPadding.current
    Scaffold { innerPadding ->
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
                onClick = { component.onLogout() },
            ) {
                Text("Logout")
            }
        }
    }
}