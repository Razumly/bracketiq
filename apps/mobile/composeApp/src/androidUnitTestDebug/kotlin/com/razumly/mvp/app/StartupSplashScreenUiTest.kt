package com.razumly.mvp.app

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class StartupSplashScreenUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun given_startup_splash_when_rendered_then_brand_and_loading_state_are_visible() {
        composeRule.setContent {
            MaterialTheme {
                ComposeStartupSplashScreen()
            }
        }

        composeRule.onNodeWithText("BracketIQ").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Loading BracketIQ").assertIsDisplayed()
    }
}
