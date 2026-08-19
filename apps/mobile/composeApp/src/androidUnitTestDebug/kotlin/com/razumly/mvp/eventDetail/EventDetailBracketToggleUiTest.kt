package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
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
    qualifiers = "w360dp-h640dp",
)
class EventDetailBracketToggleUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun bracket_toggle_stays_right_aligned_and_selects_losers() {
        var isLosersBracket by mutableStateOf(false)

        composeRule.setContent {
            MaterialTheme {
                EventDetailDivisionSelectorBar(
                    divisionState = null,
                    poolState = null,
                    showBracketToggle = true,
                    isLosersBracket = isLosersBracket,
                    onDivisionSelected = {},
                    onPoolSelected = {},
                    onBracketToggle = { isLosersBracket = !isLosersBracket },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        val rootRight = composeRule.onRoot().getUnclippedBoundsInRoot().right.value
        val toggle = composeRule.onNodeWithContentDescription("Bracket view toggle")
        val toggleRight = toggle.getUnclippedBoundsInRoot().right.value

        assertTrue(
            actual = toggleRight >= rootRight - 12.5f,
            message = "Toggle right edge $toggleRight must align with root edge $rootRight.",
        )
        composeRule.onNodeWithText("Winners").assertIsDisplayed()
        composeRule.onNodeWithText("Losers").assertIsDisplayed().performClick()
        composeRule.waitForIdle()

        toggle.assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.StateDescription,
                "Losers bracket selected",
            ),
        )
    }

    @Test
    fun given_split_playoff_divisions_when_opening_bracket_selector_then_each_division_is_listed() {
        val options = listOf(
            BracketDivisionOption(id = "playoff_gold", label = "Gold"),
            BracketDivisionOption(id = "playoff_silver", label = "Silver"),
        )
        val divisionDetails = listOf(
            DivisionDetail(id = "playoff_gold", kind = "PLAYOFF", name = "Gold"),
            DivisionDetail(id = "playoff_silver", kind = "PLAYOFF", name = "Silver"),
        )
        var selectedDivisionId by mutableStateOf("playoff_gold")

        composeRule.setContent {
            MaterialTheme {
                EventDetailDivisionSelectorBar(
                    divisionState = buildSelectedDivisionPillState(
                        selectedDivisionId = selectedDivisionId,
                        options = options,
                        singleDivision = true,
                        allowPhaseSelection = true,
                        divisionDetails = divisionDetails,
                    ),
                    poolState = null,
                    onDivisionSelected = { divisionId -> selectedDivisionId = divisionId },
                    onPoolSelected = {},
                )
            }
        }

        composeRule.onNodeWithText("Division: Gold").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Silver").assertIsDisplayed().performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithText("Division: Silver").assertIsDisplayed()
    }
}
