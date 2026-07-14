package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.eventSearch.util.EventFilter
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class InputControlsUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun givenTappableReadOnlyField_whenRendered_thenItIsEnabledAndClickable() {
        var tapCount = 0
        composeRule.setContent {
            MaterialTheme {
                StandardTextField(
                    value = "July 14, 2026",
                    onValueChange = {},
                    modifier = Modifier.testTag("date-picker-field"),
                    label = "Date",
                    readOnly = true,
                    onTap = { tapCount += 1 },
                )
            }
        }

        val field = composeRule
            .onNodeWithTag("date-picker-field")
            .assertIsEnabled()
            .assertHasClickAction()
            .assertContentDescriptionEquals("Date")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "July 14, 2026"))

        field.performClick()

        composeRule.runOnIdle {
            assertEquals(1, tapCount)
            tapCount = 0
        }
        field.performTouchInput { click() }
        composeRule.runOnIdle {
            assertEquals(1, tapCount)
        }
    }

    @Test
    fun givenValidUnloadedMultiSelectValue_whenDropdownRenders_thenStoredValueIsShown() {
        composeRule.setContent {
            MaterialTheme {
                PlatformDropdown(
                    selectedValue = "",
                    onSelectionChange = {},
                    options = listOf(DropdownOption(value = "loaded", label = "Loaded label")),
                    multiSelect = true,
                    selectedValues = listOf("loaded", "legacy-id"),
                    onMultiSelectionChange = {},
                )
            }
        }

        composeRule
            .onNodeWithText("Loaded label, legacy-id")
            .assertIsEnabled()
            .assertHasClickAction()
    }

    @Test
    fun givenFilterDateField_whenRendered_thenItIsEnabledAndClickable() {
        composeRule.setContent {
            MaterialTheme {
                SearchBox(
                    placeholder = "Search",
                    query = "",
                    filter = true,
                    currentFilter = EventFilter(),
                    onFilterChange = {},
                    onChange = {},
                    onSearch = {},
                    onFocusChange = {},
                    onPositionChange = { _, _ -> },
                    onToggleFilter = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Filter").performClick()
        val startDateField = composeRule
            .onNodeWithTag(START_DATE_FILTER_FIELD_TEST_TAG)
            .assertIsEnabled()
            .assertHasClickAction()
            .assertContentDescriptionEquals("Start Date")

        startDateField.performTouchInput { click() }
        composeRule.onNodeWithText("OK").assertExists()
    }

    @Test
    fun givenCollapseOnSelect_whenTagIsChosen_thenSemanticAndPhysicalActivationCanReopen() {
        var query by mutableStateOf("")
        var selectedSlugs = emptyList<String>()
        composeRule.setContent {
            MaterialTheme {
                EventTagSearchDropdown(
                    value = query,
                    onValueChange = { query = it },
                    tags = listOf(
                        EventTag(name = "Tryouts", slug = "tryouts", eventCount = 4),
                    ),
                    selectedTagSlugs = emptySet(),
                    onTagSelected = { tag -> selectedSlugs = selectedSlugs + tag.slug },
                    collapseOnSelect = true,
                )
            }
        }

        val searchField = composeRule.onNode(hasSetTextAction())
        searchField.performClick()
        composeRule.onNodeWithText("Tryouts (4)").performClick()

        composeRule.runOnIdle {
            assertEquals(listOf("tryouts"), selectedSlugs)
        }
        composeRule.onNodeWithText("Tryouts (4)").assertDoesNotExist()
        searchField.performClick()
        composeRule.onNodeWithText("Tryouts (4)").performClick()

        composeRule.runOnIdle {
            assertEquals(listOf("tryouts", "tryouts"), selectedSlugs)
        }
        composeRule.onNodeWithText("Tryouts (4)").assertDoesNotExist()
        searchField.performTouchInput { click() }
        composeRule.onNodeWithText("Tryouts (4)").assertExists()
    }
}
