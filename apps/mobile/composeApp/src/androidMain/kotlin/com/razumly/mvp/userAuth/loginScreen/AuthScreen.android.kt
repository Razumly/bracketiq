package com.razumly.mvp.userAuth.loginScreen

import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import com.razumly.mvp.userAuth.AuthScreenBase
import com.razumly.mvp.userAuth.DefaultAuthComponent

@Composable
actual fun AuthScreen(component: DefaultAuthComponent) {
    val activity = LocalActivity.current as ComponentActivity
    AuthScreenBase(component = component, onOauth2 = { component.oauth2Login(activity) })
}