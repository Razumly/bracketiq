package com.razumly.mvp.userAuth.loginScreen

import androidx.compose.runtime.Composable
import com.razumly.mvp.userAuth.AuthScreenBase
import com.razumly.mvp.userAuth.DefaultAuthComponent

@Composable
actual fun AuthScreen(component: DefaultAuthComponent) {
    AuthScreenBase(component = component, onOauth2 = { component.oauth2Login() })
}