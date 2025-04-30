package com.razumly.mvp.userAuth

import androidx.compose.runtime.Composable

@Composable
actual fun AuthScreen(component: DefaultAuthComponent) {
    AuthScreenBase(component = component, onOauth2 = { component.oauth2Login() })
}