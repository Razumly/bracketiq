package com.razumly.mvp.core.presentation.guides

import androidx.compose.ui.geometry.Rect
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GuideControllerAccountScopeTest {
    @Test
    fun authenticated_account_change_cancels_the_active_guide_and_rejects_stale_completion_state() {
        val completedCallbacks = mutableListOf<String>()
        val controller = GuideController(onGuideCompleted = completedCallbacks::add)
        val guide = AppGuide(
            id = "discover",
            steps = listOf(
                AppGuideStep(
                    id = "discover-step",
                    targetId = "discover-target",
                    title = "Discover",
                    body = "Find events.",
                ),
            ),
        )
        controller.registerTarget(
            targetId = "discover-target",
            bounds = Rect(0f, 0f, 100f, 100f),
            highlightShape = GuideHighlightShape.RoundedRect(),
        )
        controller.updateAccount("account-a")
        controller.updateCompletedGuideIds(
            accountId = "account-a",
            ids = emptySet(),
            loaded = true,
        )
        controller.maybeStartGuide(guide)
        assertTrue(controller.hasActiveGuide)

        controller.updateAccount("account-b")

        assertFalse(controller.hasActiveGuide)
        assertNull(controller.activeGuide)
        assertEquals(0, controller.activeStepIndex)
        assertFalse(controller.completedGuideIdsLoaded)
        assertTrue(controller.completedGuideIds.isEmpty())
        assertTrue(completedCallbacks.isEmpty())

        controller.updateCompletedGuideIds(
            accountId = "account-a",
            ids = setOf(guide.id),
            loaded = true,
        )
        assertFalse(controller.completedGuideIdsLoaded)
        assertTrue(controller.completedGuideIds.isEmpty())

        controller.updateCompletedGuideIds(
            accountId = "account-b",
            ids = emptySet(),
            loaded = true,
        )
        controller.maybeStartGuide(guide)

        assertTrue(controller.hasActiveGuide)
        controller.dismiss()
        assertEquals(listOf(guide.id), completedCallbacks)
    }
}
