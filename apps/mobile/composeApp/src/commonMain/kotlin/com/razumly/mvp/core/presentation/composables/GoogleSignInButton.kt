package com.razumly.mvp.core.presentation.composables

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.icons.AndroidGoogleButtonDark
import com.razumly.mvp.icons.AndroidGoogleButtonLight
import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.iOSGoogleButtonDark
import com.razumly.mvp.icons.iOSGoogleButtonLight

@Composable
internal fun GoogleSignInButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isDarkTheme = isSystemInDarkTheme()
    val isIOS = Platform.isIOS

    val (buttonIcon, width, height) = when {
        isIOS && isDarkTheme -> {
            val aspectRatio = 199f / 44f
            val buttonHeight = 44.dp
            val buttonWidth = buttonHeight * aspectRatio
            Triple(MVPIcons.iOSGoogleButtonDark, buttonWidth, buttonHeight)
        }
        isIOS && !isDarkTheme -> {
            val aspectRatio = 199f / 44f
            val buttonHeight = 44.dp
            val buttonWidth = buttonHeight * aspectRatio
            Triple(MVPIcons.iOSGoogleButtonLight, buttonWidth, buttonHeight)
        }
        !isIOS && isDarkTheme -> {
            val aspectRatio = 189f / 40f
            val buttonHeight = 40.dp
            val buttonWidth = buttonHeight * aspectRatio
            Triple(MVPIcons.AndroidGoogleButtonDark, buttonWidth, buttonHeight)
        }
        else -> {
            val aspectRatio = 189f / 40f
            val buttonHeight = 40.dp
            val buttonWidth = buttonHeight * aspectRatio
            Triple(MVPIcons.AndroidGoogleButtonLight, buttonWidth, buttonHeight)
        }
    }

    Box(
        modifier = modifier
            .size(width, height)
            .clip(RoundedCornerShape(height/2))
            .clickable { onClick() }
    ) {
        Image(
            imageVector = buttonIcon,
            contentDescription = "Sign in with Google",
            modifier = Modifier.size(width, height),
            contentScale = ContentScale.Fit
        )
    }
}

