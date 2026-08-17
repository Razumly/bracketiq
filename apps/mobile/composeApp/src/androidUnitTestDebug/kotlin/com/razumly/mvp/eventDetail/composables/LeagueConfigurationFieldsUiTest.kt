package com.razumly.mvp.eventDetail.composables

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import com.razumly.mvp.core.data.dataTypes.LeagueConfig
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class LeagueConfigurationFieldsUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun zero_rest_time_between_matches_stays_blank() {
        composeRule.setContent {
            MaterialTheme {
                LeagueConfigurationFields(
                    leagueConfig = LeagueConfig(restTimeMinutes = 0),
                    onLeagueConfigChange = {},
                )
            }
        }

        val inputs = composeRule.onAllNodes(hasSetTextAction())
        inputs.assertCountEquals(3)
        inputs[1].assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText,
                AnnotatedString(""),
            ),
        )
    }

    @Test
    fun zero_playoff_rest_time_between_matches_stays_blank() {
        composeRule.setContent {
            MaterialTheme {
                TournamentConfigurationFields(
                    usesSets = false,
                    showEliminationControl = false,
                    tournamentConfig = TournamentConfig(restTimeMinutes = 0),
                    onTournamentConfigChange = {},
                    showPrize = false,
                )
            }
        }

        val inputs = composeRule.onAllNodes(hasSetTextAction())
        inputs.assertCountEquals(2)
        inputs[0].assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText,
                AnnotatedString(""),
            ),
        )
    }
}
