package com.razumly.mvp.core.presentation.composables

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
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
class EventCardUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun lifecycle_badge_is_laid_out_below_date_and_price_row() {
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
                            dateLabel = "Jul 18, 2030",
                            priceLabel = "\$120",
                            prizeLabel = null,
                            lifecycleLabel = "Draft",
                            lifecycleTone = "draft",
                        ),
                        onMapClick = {},
                    )
                }
            }
        }

        val date = composeRule.onNodeWithText("Jul 18, 2030").assertIsDisplayed()
        composeRule.onNodeWithText("\$120").assertIsDisplayed()
        val badge = composeRule.onNodeWithText("Draft").assertIsDisplayed()

        assertTrue(
            date.fetchSemanticsNode().boundsInRoot.bottom <=
                badge.fetchSemanticsNode().boundsInRoot.top,
        )
    }
}
