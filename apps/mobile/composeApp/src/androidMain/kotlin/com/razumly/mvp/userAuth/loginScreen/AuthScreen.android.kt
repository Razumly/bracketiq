package com.razumly.mvp.userAuth.loginScreen

import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

@Composable
actual fun AuthScreen(component: AuthComponent) {
    val activity = LocalActivity.current as ComponentActivity
    AuthScreenBase(component = component, onOauth2 = { component.oauth2Login(activity) })
}