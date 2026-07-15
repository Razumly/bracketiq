package com.razumly.mvp.core.presentation.guides

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(
    sdk = [35],
    application = Application::class,
    qualifiers = "w360dp-h480dp",
)
class GuideHostUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun long_accessibility_copy_keeps_navigation_controls_inside_viewport() {
        val controller = GuideController(onGuideCompleted = {})
        controller.updateAccount("guide-test-account")
        controller.updateCompletedGuideIds(
            accountId = "guide-test-account",
            ids = emptySet(),
            loaded = true,
        )
        controller.registerTarget(
            targetId = "guide-target",
            bounds = Rect(left = 24f, top = 360f, right = 336f, bottom = 420f),
            highlightShape = GuideHighlightShape.RoundedRect(),
        )
        controller.maybeStartGuide(
            AppGuide(
                id = "long-copy-guide",
                steps = listOf(
                    AppGuideStep(
                        id = "long-copy-step",
                        targetId = "guide-target",
                        title = "Manage every part of your event",
                        body = List(24) {
                            "Long localized guidance remains readable without hiding navigation controls."
                        }.joinToString(" "),
                    )
                ),
            )
        )

        composeRule.setContent {
            val platformDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(
                    density = platformDensity.density,
                    fontScale = 2f,
                )
            ) {
                MaterialTheme {
                    Box(modifier = Modifier.fillMaxSize()) {
                        GuideHost(controller = controller)
                    }
                }
            }
        }

        val dismissNode = composeRule.onNodeWithText("Done").assertIsDisplayed()
        val nextNode = composeRule
            .onNodeWithContentDescription("Finish guide")
            .assertIsDisplayed()
        val rootBounds = composeRule.onRoot().fetchSemanticsNode().boundsInRoot

        assertTrue(dismissNode.fetchSemanticsNode().boundsInRoot.bottom <= rootBounds.bottom)
        assertTrue(nextNode.fetchSemanticsNode().boundsInRoot.bottom <= rootBounds.bottom)
    }
}
