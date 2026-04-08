package com.razumly.mvp.userAuth

import androidx.compose.runtime.Composable
import com.razumly.mvp.core.presentation.composables.AppleSignInButton

@Composable
actual fun AuthScreen(component: DefaultAuthComponent) {
    AuthScreenBase(
        component = component,
        onGoogleOauth2 = { component.oauth2Login() },
        appleSignInButton = {
            AppleSignInButton(onClick = component::appleLogin)
        },
    )
}
