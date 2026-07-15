package com.razumly.mvp.app

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class LoadingOverlayUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun loading_overlay_consumes_taps_before_they_reach_underlying_content() {
        var tapCount = 0

        composeRule.setContent {
            MaterialTheme {
                Box(modifier = Modifier.size(240.dp)) {
                    Button(
                        onClick = { tapCount += 1 },
                        modifier = Modifier
                            .align(Alignment.Center)
                            .testTag("underlying-action"),
                    ) {
                        Text("Underlying action")
                    }

                    LoadingOverlay(
                        message = "Saving...",
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }

        composeRule.onNodeWithTag("underlying-action").performTouchInput { click(center) }

        composeRule.runOnIdle {
            assertEquals(0, tapCount)
        }
    }
}
