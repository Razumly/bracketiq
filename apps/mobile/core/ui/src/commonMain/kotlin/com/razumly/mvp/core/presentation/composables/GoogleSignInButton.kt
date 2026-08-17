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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal const val ANDROID_GOOGLE_SIGN_IN_ASPECT_RATIO = 189f / 40f
internal const val IOS_GOOGLE_SIGN_IN_ASPECT_RATIO = 199f / 44f

internal data class GoogleSignInButtonArtwork(
    val imageVector: ImageVector,
    val aspectRatio: Float,
)

internal expect fun googleSignInButtonArtwork(
    isDarkTheme: Boolean,
): GoogleSignInButtonArtwork

internal fun googleSignInButtonWidth(
    buttonHeight: Dp,
    aspectRatio: Float,
): Dp {
    require(aspectRatio > 0f) { "Google sign-in artwork must have a positive aspect ratio." }
    return buttonHeight * aspectRatio
}

@Composable
fun GoogleSignInButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isDarkTheme = isSystemInDarkTheme()
    val artwork = googleSignInButtonArtwork(isDarkTheme)
    val height = 50.dp
    val width = googleSignInButtonWidth(height, artwork.aspectRatio)

    Box(
        modifier = modifier
            .size(width, height)
            .clip(RoundedCornerShape(height / 2))
            .clickable { onClick() }
    ) {
        Image(
            imageVector = artwork.imageVector,
            contentDescription = "Sign in with Google",
            modifier = Modifier.size(width, height),
            contentScale = ContentScale.Fit
        )
    }
}
