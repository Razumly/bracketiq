package com.razumly.mvp.eventManagement

import android.app.Application
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.presentation.LocalNavBarPadding
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingHandlerImpl
import com.razumly.mvp.core.util.LocalLoadingHandler
import com.razumly.mvp.core.util.LocalPopupHandler
import com.razumly.mvp.core.util.PopupHandlerImpl
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class EventManagementEmptyStateUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun empty_state_explains_event_management_and_offers_creation() {
        var createCalls = 0
        composeRule.setContent {
            MaterialTheme {
                EventManagementEmptyState(onCreateEvent = { createCalls += 1 })
            }
        }

        composeRule.onNodeWithText("No events to manage yet").assertIsDisplayed()
        composeRule.onNodeWithText(
            "Create your first event, then return here to manage its schedule and participants.",
        ).assertIsDisplayed()
        composeRule.onNodeWithText("Create an event").performClick()

        assertEquals(1, createCalls)
    }

    @Test
    fun full_screen_keeps_initial_load_failure_visible_and_retryable_after_popup_is_dismissed() {
        val component = EventManagementUiFakeComponent(
            initialError = ErrorMessage("Failed to load events: Network unavailable"),
        )
        val popupHandler = PopupHandlerImpl()

        composeRule.setContent {
            CompositionLocalProvider(
                LocalNavBarPadding provides PaddingValues(),
                LocalPopupHandler provides popupHandler,
                LocalLoadingHandler provides LoadingHandlerImpl(),
            ) {
                MaterialTheme {
                    EventManagementScreen(component)
                }
            }
        }

        composeRule.onNodeWithText("Unable to load events").assertIsDisplayed()
        composeRule.onNodeWithText("Failed to load events: Network unavailable").assertIsDisplayed()
        composeRule.onAllNodesWithText("No events to manage yet").assertCountEquals(0)

        composeRule.runOnIdle(popupHandler::clearError)

        composeRule.onNodeWithText("Unable to load events").assertIsDisplayed()
        composeRule.onNodeWithText("Try again").performClick()
        assertEquals(1, component.retryCalls)
    }
}

private class EventManagementUiFakeComponent(
    initialError: ErrorMessage? = null,
) : EventManagementComponent {
    override val events: StateFlow<List<Event>> = MutableStateFlow(emptyList())
    override val onEventSelected: (Event) -> Unit = {}
    override val isLoadingMore: StateFlow<Boolean> = MutableStateFlow(false)
    override val hasMoreEvents: StateFlow<Boolean> = MutableStateFlow(false)
    override val onBack: () -> Unit = {}
    override val onCreateEvent: () -> Unit = {}
    override val errorState: StateFlow<ErrorMessage?> = MutableStateFlow(initialError)
    override val isLoading: StateFlow<Boolean> = MutableStateFlow(false)
    var retryCalls: Int = 0
        private set

    override fun setLoadingHandler(handler: LoadingHandler) = Unit
    override fun loadMoreEvents() = Unit
    override fun retryLoadingEvents() {
        retryCalls += 1
    }
}
