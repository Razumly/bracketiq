package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.math.abs
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(
    sdk = [35],
    application = Application::class,
    qualifiers = "w360dp-h640dp",
)
class EventCardUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun compact_card_displays_metadata_and_keeps_type_price_below_date() {
        composeRule.setContent {
            MaterialTheme {
                Box(modifier = Modifier.width(360.dp)) {
                    ComposeEventCard(
                        data = NativeEventCardData(
                            id = "draft-event",
                            imageUrl = null,
                            usesLogoFallback = false,
                            title = "Summer Tournament",
                            location = "River City Sports Club",
                            eventTypeLabel = "Tournament",
                            registrationLabel = "Team registration",
                            divisionLabel = "Division: Open",
                            skillLevelLabel = "Skill: Advanced",
                            dateLabel = "Jul 18, 2030",
                            priceLabel = "\$500.00 - \$700.00",
                            prizeLabel = null,
                            lifecycleLabel = "Draft",
                            lifecycleTone = "draft",
                        ),
                        onMapClick = {},
                    )
                }
            }
        }

        composeRule.onNodeWithText("Jul 18, 2030").assertIsDisplayed()
        composeRule.onNodeWithText("Tournament").assertIsDisplayed()
        composeRule.onNodeWithText("\$500.00 - \$700.00").assertIsDisplayed()
        composeRule.onNodeWithTag(EVENT_CARD_TYPE_PRICE_TEST_TAG).assertIsDisplayed()
        composeRule.onNodeWithText("Division: Open", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("Skill: Advanced", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("Draft").assertIsDisplayed()
        composeRule.onNodeWithTag(EVENT_CARD_MAP_TEST_TAG).assertIsDisplayed()

        val dateRowBounds = composeRule
            .onNodeWithTag(EVENT_CARD_DATE_REGISTRATION_TEST_TAG)
            .fetchSemanticsNode()
            .boundsInRoot
        val cardBounds = composeRule
            .onNodeWithTag(EVENT_CARD_TEST_TAG)
            .fetchSemanticsNode()
            .boundsInRoot
        val typePriceBounds = composeRule
            .onNodeWithTag(EVENT_CARD_TYPE_PRICE_TEST_TAG)
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue(typePriceBounds.top >= dateRowBounds.bottom)
        assertTrue(typePriceBounds.bottom <= cardBounds.bottom)
        assertTrue(cardBounds.bottom - typePriceBounds.bottom <= 32f)
        assertTrue(abs(cardBounds.width - cardBounds.height) <= 1f)
    }

    @Test
    fun long_content_grows_upward_while_type_price_stays_at_card_bottom() {
        composeRule.setContent {
            MaterialTheme {
                Box(modifier = Modifier.width(360.dp)) {
                    ComposeEventCard(
                        data = NativeEventCardData(
                            id = "long-event",
                            imageUrl = null,
                            usesLogoFallback = false,
                            title = "Pacific University Elite Prospect Camp Session II",
                            location = "Pacific University",
                            eventTypeLabel = "Event",
                            registrationLabel = "Individual registration",
                            divisionLabel = "Division: Entering 9th Grade and Up",
                            skillLevelLabel = "Skill: Open",
                            dateLabel = "July 24, 2026. CEVA lists this as a prospect camp for athletes entering 9th grade and up.",
                            priceLabel = "\$110",
                            prizeLabel = null,
                            lifecycleLabel = "Published",
                            lifecycleTone = "published",
                        ),
                        onMapClick = {},
                    )
                }
            }
        }

        composeRule.onNodeWithText(
            "Pacific University Elite Prospect Camp Session II",
        ).assertIsDisplayed()

        val cardBounds = composeRule
            .onNodeWithTag(EVENT_CARD_TEST_TAG)
            .fetchSemanticsNode()
            .boundsInRoot
        val typePriceBounds = composeRule
            .onNodeWithTag(EVENT_CARD_TYPE_PRICE_TEST_TAG)
            .fetchSemanticsNode()
            .boundsInRoot

        assertTrue(typePriceBounds.bottom <= cardBounds.bottom)
        assertTrue(cardBounds.bottom - typePriceBounds.bottom <= 32f)
    }
}
