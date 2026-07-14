package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.icons.MVPIcons
import com.razumly.mvp.icons.iOSGoogleButtonDark
import com.razumly.mvp.icons.iOSGoogleButtonLight

internal actual fun googleSignInButtonArtwork(
    isDarkTheme: Boolean,
): GoogleSignInButtonArtwork = GoogleSignInButtonArtwork(
    imageVector = if (isDarkTheme) {
        MVPIcons.iOSGoogleButtonDark
    } else {
        MVPIcons.iOSGoogleButtonLight
    },
    aspectRatio = IOS_GOOGLE_SIGN_IN_ASPECT_RATIO,
)
