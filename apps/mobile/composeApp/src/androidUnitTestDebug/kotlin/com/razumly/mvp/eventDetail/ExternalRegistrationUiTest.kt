package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextReplacement
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.isAffiliateEvent
import com.razumly.mvp.eventDetail.shared.EventRegistrationWebsiteField
import com.razumly.mvp.eventDetail.shared.localImageScheme
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ExternalRegistrationUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun given_external_event_when_website_changes_then_accessible_input_preserves_operations() {
        val original = Event(
            id = "external-league",
            eventType = EventType.LEAGUE,
            affiliateUrl = "https://organizer.example/register",
            sourceType = "AFFILIATE_IMPORT",
            sourceId = "source-1",
            fieldIds = listOf("field-1"),
            teamSignup = true,
            doTeamsOfficiate = true,
        )
        val state = mutableStateOf(original)
        composeRule.setContent {
            CompositionLocalProvider(localImageScheme provides DynamicScheme(
                seedColor = Color(0xFF006A6A),
                isDark = false,
                specVersion = ColorSpec.SpecVersion.SPEC_2025,
                style = PaletteStyle.Neutral,
            )) {
                MaterialTheme {
                    EventRegistrationWebsiteField(state.value.affiliateUrl) {
                        state.value = state.value.copy(affiliateUrl = it)
                    }
                }
            }
        }
        composeRule.onNodeWithText("Registration website").assertIsDisplayed()
        composeRule.onNode(hasSetTextAction()).performTextReplacement("https://new-organizer.example/join")
        composeRule.runOnIdle {
            assertEquals(original.copy(affiliateUrl = "https://new-organizer.example/join"), state.value)
        }
        composeRule.onNode(hasSetTextAction()).performTextReplacement("javascript:alert(1)")
        composeRule.onNodeWithText("Enter a valid http:// or https:// registration website.").assertIsDisplayed()
        composeRule.onNode(hasSetTextAction()).performTextReplacement("")
        composeRule.runOnIdle {
            assertFalse(state.value.isAffiliateEvent())
            assertEquals(original.copy(affiliateUrl = null), state.value)
        }
    }
}
