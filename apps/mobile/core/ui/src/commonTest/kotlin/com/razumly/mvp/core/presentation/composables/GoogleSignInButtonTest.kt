package com.razumly.mvp.core.presentation.composables

import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.util.Platform
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals

class GoogleSignInButtonTest {

    @Test
    fun givenLightAndDarkThemes_whenPlatformArtworkIsResolved_thenEachThemeKeepsItsOwnVector() {
        val darkArtwork = googleSignInButtonArtwork(isDarkTheme = true)
        val lightArtwork = googleSignInButtonArtwork(isDarkTheme = false)
        val expectedAspectRatio = if (Platform.isIOS) {
            IOS_GOOGLE_SIGN_IN_ASPECT_RATIO
        } else {
            ANDROID_GOOGLE_SIGN_IN_ASPECT_RATIO
        }

        assertNotEquals(darkArtwork.imageVector, lightArtwork.imageVector)
        assertEquals(expectedAspectRatio, darkArtwork.aspectRatio)
        assertEquals(expectedAspectRatio, lightArtwork.aspectRatio)
    }

    @Test
    fun givenAndroidArtwork_whenButtonWidthIsResolved_thenExistingDimensionsArePreserved() {
        assertEquals(
            236.25.dp,
            googleSignInButtonWidth(
                buttonHeight = 50.dp,
                aspectRatio = ANDROID_GOOGLE_SIGN_IN_ASPECT_RATIO,
            ),
        )
    }

    @Test
    fun givenIosArtwork_whenButtonWidthIsResolved_thenExistingDimensionsArePreserved() {
        assertEquals(
            (50f * 199f / 44f).dp,
            googleSignInButtonWidth(
                buttonHeight = 50.dp,
                aspectRatio = IOS_GOOGLE_SIGN_IN_ASPECT_RATIO,
            ),
        )
    }

    @Test
    fun givenInvalidArtworkRatio_whenButtonWidthIsResolved_thenItFailsClosed() {
        assertFailsWith<IllegalArgumentException> {
            googleSignInButtonWidth(
                buttonHeight = 50.dp,
                aspectRatio = 0f,
            )
        }
    }
}
