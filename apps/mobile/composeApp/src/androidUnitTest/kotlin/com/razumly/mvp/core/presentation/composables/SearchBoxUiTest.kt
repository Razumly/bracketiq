package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertTrue
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

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
                    onFilterChange = { this },
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

        composeRule.onNode(hasSetTextAction()).assertTextEquals("stale query")
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
                    onFilterChange = { this },
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
}
