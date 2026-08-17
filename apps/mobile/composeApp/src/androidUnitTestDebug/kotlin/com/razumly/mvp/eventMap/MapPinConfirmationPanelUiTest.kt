package com.razumly.mvp.eventMap

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class MapPinConfirmationPanelUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun searchResults_renderExplicitDistinctAndActionablePinChoices() {
        var confirmedIndex: Int? = null
        val firstLabel = "Choose map pin for Community Center, 100 Main Street"
        val secondLabel = "Choose map pin for Community Center, 200 Oak Avenue"

        composeRule.setContent {
            MaterialTheme {
                MapPinConfirmationPanel(
                    options = listOf(
                        MapPinConfirmationOption(
                            index = 0,
                            key = "first",
                            name = "Community Center",
                            address = "100 Main Street",
                        ),
                        MapPinConfirmationOption(
                            index = 1,
                            key = "second",
                            name = "Community Center",
                            address = "200 Oak Avenue",
                        ),
                    ),
                    onConfirm = { index -> confirmedIndex = index },
                )
            }
        }

        composeRule.onNodeWithText("Choose a map pin").assertIsDisplayed()
        composeRule
            .onNodeWithText("Select the correct result below, then press Select Location.")
            .assertIsDisplayed()
        composeRule.onNodeWithContentDescription(firstLabel).assertHasClickAction()

        val secondPin = composeRule
            .onNodeWithContentDescription(secondLabel)
            .assertIsDisplayed()
            .assertHasClickAction()
        val semantics = secondPin.fetchSemanticsNode().config
        assertEquals(Role.Button, semantics[SemanticsProperties.Role])
        assertTrue(SemanticsActions.OnClick in semantics)

        secondPin.performClick()

        assertEquals(1, confirmedIndex)
    }

    @Test
    fun accessibilityLabel_avoidsRepeatingAnAddressUsedAsThePlaceName() {
        assertEquals(
            "Choose map pin for 100 Main Street",
            mapPinConfirmationAccessibilityLabel(
                name = "100 Main Street",
                address = " 100 Main Street ",
            ),
        )
    }
}
