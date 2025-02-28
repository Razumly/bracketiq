package com.razumly.mvp.userAuth.loginScreen

import androidx.compose.runtime.Composable

@Composable
actual fun AuthScreen(component: AuthComponent) {
    AuthScreenBase(component = component, onOauth2 = { component.oauth2Login() })
}