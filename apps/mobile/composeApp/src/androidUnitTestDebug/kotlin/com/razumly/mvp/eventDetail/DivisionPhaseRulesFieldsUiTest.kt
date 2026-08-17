package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.razumly.mvp.core.data.dataTypes.DivisionCompetitionPhase
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.MatchTimekeepingConfigMVP
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class DivisionPhaseRulesFieldsUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun zero_break_between_halves_stays_blank() {
        val event = Event(
            matchRulesOverride = MatchRulesConfigMVP(
                scoringModel = "PERIODS",
                segmentCount = 2,
                segmentLabel = "Half",
                timekeeping = MatchTimekeepingConfigMVP(
                    timerMode = "COUNT_UP",
                    segmentDurationMinutes = 45,
                    segmentBreakDurationMinutes = 0,
                ),
            ),
        )

        composeRule.setContent {
            MaterialTheme {
                DivisionPhaseRulesFields(
                    title = "League",
                    phase = DivisionCompetitionPhase.LEAGUE,
                    event = event,
                    sport = null,
                    usesSets = false,
                    phaseSettings = emptyMap(),
                    onPhaseSettingsChange = {},
                    onCalculatedDurationChange = {},
                )
            }
        }

        composeRule.onNodeWithText("Break between halves (min)").assertIsDisplayed()
        val inputs = composeRule.onAllNodes(hasSetTextAction())
        inputs.assertCountEquals(2)
        inputs[1].assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText,
                AnnotatedString(""),
            ),
        )
    }
}
