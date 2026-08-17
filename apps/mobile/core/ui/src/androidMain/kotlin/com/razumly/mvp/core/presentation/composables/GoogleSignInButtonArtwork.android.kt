package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.icons.AndroidGoogleButtonDark
import com.razumly.mvp.icons.AndroidGoogleButtonLight
import com.razumly.mvp.icons.MVPIcons

internal actual fun googleSignInButtonArtwork(
    isDarkTheme: Boolean,
): GoogleSignInButtonArtwork = GoogleSignInButtonArtwork(
    imageVector = if (isDarkTheme) {
        MVPIcons.AndroidGoogleButtonDark
    } else {
        MVPIcons.AndroidGoogleButtonLight
    },
    aspectRatio = ANDROID_GOOGLE_SIGN_IN_ASPECT_RATIO,
)
