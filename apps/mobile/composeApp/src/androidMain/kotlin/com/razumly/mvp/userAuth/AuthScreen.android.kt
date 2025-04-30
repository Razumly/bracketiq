package com.razumly.mvp.userAuth

import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable

@Composable
actual fun AuthScreen(component: DefaultAuthComponent) {
    val activity = LocalActivity.current as ComponentActivity
    AuthScreenBase(component = component, onOauth2 = { component.oauth2Login(activity) })
}