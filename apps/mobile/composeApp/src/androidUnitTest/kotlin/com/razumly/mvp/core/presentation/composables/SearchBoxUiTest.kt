package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.text.AnnotatedString
import com.razumly.mvp.eventSearch.util.EventFilter
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class SearchBoxUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun parent_query_reset_clears_the_visible_search_field() {
        composeRule.setContent {
            var query by mutableStateOf("stale query")
            MaterialTheme {
                SearchBox(
                    placeholder = "Search",
                    query = query,
                    filter = false,
                    onFilterChange = {},
                    onChange = { query = it },
                    onSearch = {},
                    onFocusChange = {},
                    onPositionChange = { _, _ -> },
                    onToggleFilter = {},
                )
                Button(onClick = { query = "" }) {
                    Text("Reset query")
                }
            }
        }

        composeRule.onNode(hasSetTextAction()).assertEditableTextEquals("stale query")
        composeRule.onNodeWithText("Reset query").performClick()
        assertTrue(composeRule.onAllNodesWithText("stale query").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun search_ime_action_submits_the_current_controlled_query() {
        composeRule.setContent {
            var query by mutableStateOf("")
            var submittedQuery by mutableStateOf("")
            MaterialTheme {
                SearchBox(
                    placeholder = "Search",
                    query = query,
                    filter = false,
                    onFilterChange = {},
                    onChange = { query = it },
                    onSearch = { submittedQuery = it },
                    onFocusChange = {},
                    onPositionChange = { _, _ -> },
                    onToggleFilter = {},
                )
                Text("Submitted: $submittedQuery")
            }
        }

        composeRule.onNode(hasSetTextAction()).performTextInput("new query")
        composeRule.onNode(hasSetTextAction()).performImeAction()

        composeRule.onNodeWithText("Submitted: new query").assertExists()
    }

    @Test
    fun invalid_price_draft_is_explained_and_cannot_be_applied() {
        var currentFilter by mutableStateOf(EventFilter(price = 10.0 to 20.0))
        composeRule.setContent {
            MaterialTheme {
                SearchBox(
                    placeholder = "Search",
                    query = "",
                    filter = true,
                    currentFilter = currentFilter,
                    onFilterChange = { update -> currentFilter = currentFilter.update() },
                    onChange = {},
                    onSearch = {},
                    onFocusChange = {},
                    onPositionChange = { _, _ -> },
                    onToggleFilter = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Filter").performClick()
        composeRule.onNodeWithTag(MIN_PRICE_INPUT_TEST_TAG).performTextReplacement("30")

        composeRule.onNodeWithText("Minimum price cannot exceed maximum price.").assertExists()
        composeRule.onNodeWithTag(APPLY_FILTERS_TEST_TAG).assertIsNotEnabled()
        composeRule.runOnIdle {
            assertEquals(10.0 to 20.0, currentFilter.price)
        }
    }

    @OptIn(ExperimentalTime::class)
    @Test
    fun normalized_same_day_start_exposes_a_durable_active_filter_state() {
        var currentFilter by mutableStateOf(
            EventFilter(date = normalizeFilterStartDate(Clock.System.now()) to null)
        )
        composeRule.setContent {
            MaterialTheme {
                SearchBox(
                    placeholder = "Search",
                    query = "",
                    filter = true,
                    currentFilter = currentFilter,
                    onFilterChange = { update -> currentFilter = currentFilter.update() },
                    onChange = {},
                    onSearch = {},
                    onFocusChange = {},
                    onPositionChange = { _, _ -> },
                    onToggleFilter = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Filter").assertStateDescriptionEquals("Active")

        composeRule.runOnIdle {
            currentFilter = EventFilter(date = Clock.System.now() to null)
        }
        composeRule.onNodeWithContentDescription("Filter").assertStateDescriptionEquals("Inactive")
    }

    @Test
    fun external_filter_reset_discards_invalid_price_draft_and_restores_defaults() {
        var currentFilter by mutableStateOf(EventFilter(price = 10.0 to 20.0))
        composeRule.setContent {
            MaterialTheme {
                SearchBox(
                    placeholder = "Search",
                    query = "",
                    filter = true,
                    currentFilter = currentFilter,
                    onFilterChange = { update -> currentFilter = currentFilter.update() },
                    onChange = {},
                    onSearch = {},
                    onFocusChange = {},
                    onPositionChange = { _, _ -> },
                    onToggleFilter = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Filter").performClick()
        composeRule.onNodeWithTag(MIN_PRICE_INPUT_TEST_TAG).performTextReplacement("30")
        composeRule.onNodeWithText("Minimum price cannot exceed maximum price.").assertExists()

        composeRule.runOnIdle {
            currentFilter = EventFilter()
        }
        composeRule.runOnIdle {
            assertNull(currentFilter.price)
        }
        composeRule.waitUntil(timeoutMillis = 5_000) {
            val errorIsGone = composeRule
                .onAllNodesWithText("Minimum price cannot exceed maximum price.")
                .fetchSemanticsNodes()
                .isEmpty()
            val priceInputIsGone = composeRule
                .onAllNodes(hasTestTag(MIN_PRICE_INPUT_TEST_TAG))
                .fetchSemanticsNodes()
                .isEmpty()
            errorIsGone && priceInputIsGone
        }
        assertTrue(
            composeRule.onAllNodesWithText("Minimum price cannot exceed maximum price.")
                .fetchSemanticsNodes()
                .isEmpty()
        )
        assertTrue(
            composeRule.onAllNodes(hasTestTag(MIN_PRICE_INPUT_TEST_TAG))
                .fetchSemanticsNodes()
                .isEmpty()
        )
        composeRule.onNodeWithTag(APPLY_FILTERS_TEST_TAG).assertIsEnabled()
        composeRule.onNodeWithTag(PRICE_FILTER_SWITCH_TEST_TAG).performClick()
        composeRule.onNodeWithTag(MIN_PRICE_INPUT_TEST_TAG).assertEditableTextEquals("0")
        composeRule.onNodeWithTag(MAX_PRICE_INPUT_TEST_TAG).assertEditableTextEquals("100")
        composeRule.runOnIdle {
            assertEquals(0.0 to 100.0, currentFilter.price)
        }
    }
}

private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertEditableTextEquals(
    expected: String,
) = assert(
    SemanticsMatcher.expectValue(
        SemanticsProperties.EditableText,
        AnnotatedString(expected),
    )
)

private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertStateDescriptionEquals(
    expected: String,
) = assert(
    SemanticsMatcher.expectValue(
        SemanticsProperties.StateDescription,
        expected,
    )
)
