package com.razumly.mvp.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

@Composable
fun ProfileScreen(component: ProfileComponent) {
    Box {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Button(onClick = { component.manageTeams() }){
                Text("Manage Teams")
            }
        }
        Button(
            modifier = Modifier.align(Alignment.BottomCenter),
            onClick = { component.onLogout() },
        ) {
            Text("Logout")
        }
    }
}