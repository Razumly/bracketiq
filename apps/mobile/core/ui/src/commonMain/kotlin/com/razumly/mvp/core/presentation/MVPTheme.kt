package com.razumly.mvp.core.presentation

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable

internal expect val MVPAppTypography: Typography

@Composable
fun MVPTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkAppColorScheme else LightAppColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = MVPAppTypography,
        content = content,
    )
}
