package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.eventDetail.shared.localImageScheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class EventCreateValidationVisibilityUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun hero_hides_untouched_create_errors_until_validation_is_attempted() {
        composeRule.setContent {
            var showValidationErrors by remember { mutableStateOf(false) }
            CompositionLocalProvider(localImageScheme provides testImageScheme()) {
                MaterialTheme {
                    Column {
                        Button(onClick = { showValidationErrors = true }) {
                            Text("Attempt validation")
                        }
                        LazyColumn {
                            eventDetailsHeroSection(
                                state = EventDetailsHeroState(
                                    editView = true,
                                    isNewEvent = true,
                                    event = Event(),
                                    editEvent = Event(),
                                    eventNameInput = "",
                                    isValid = false,
                                    showValidationErrors = showValidationErrors,
                                    isLocationValid = false,
                                    isColorLoaded = false,
                                    heroSpacerHeight = 120.dp,
                                    roundedCornerSize = 16.dp,
                                    eventMetaLine = "",
                                    summaryTags = emptyList(),
                                    registrationHoldExpiresAt = null,
                                ),
                                actions = EventDetailsHeroActions(
                                    onShowImageSelector = {},
                                    onEventNameInputChange = {},
                                    onOpenLocationMap = {},
                                    onMapRevealCenterChange = {},
                                    onRegistrationHoldExpired = {},
                                    joinButton = {},
                                ),
                            )
                        }
                    }
                }
            }
        }

        assertHiddenInitialEventErrors()

        composeRule.onNodeWithText("Attempt validation").performClick()

        composeRule.onNodeWithText("Select an image for the event.").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Enter a Value").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Select a Location").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun division_editor_hides_untouched_required_errors_until_validation_is_attempted() {
        composeRule.setContent {
            var showValidationErrors by remember { mutableStateOf(false) }
            CompositionLocalProvider(localImageScheme provides testImageScheme()) {
                MaterialTheme {
                    Column {
                        Button(onClick = { showValidationErrors = true }) {
                            Text("Attempt validation")
                        }
                        EventDetailsDivisionEditorForm(
                            state = EventDetailsDivisionEditorFormState(
                                editEvent = Event(),
                                divisionDetails = emptyList(),
                                selectedDivisions = emptyList(),
                                divisionEditor = DivisionEditorState(),
                                divisionEditorDefaults = DivisionEditorState(),
                                divisionEditorReady = true,
                                divisionScheduleUsesSets = false,
                                skillDivisionTypeOptions = emptyList(),
                                ageDivisionTypeOptions = emptyList(),
                                genderOptions = emptyList(),
                                divisionInputsExpanded = true,
                                hostHasAccount = false,
                                isNewEvent = true,
                                showValidationErrors = showValidationErrors,
                                addSelfToEvent = false,
                            ),
                            actions = EventDetailsDivisionEditorFormActions(
                                onEditEvent = { this },
                                onDivisionEditorChange = {},
                                onDivisionEditorDefaultsChange = {},
                                onUpdateDivisionEditorSelection = { _, _, _ -> },
                                onNormalizeLeagueConfigWithSportMode = { it },
                                onUpdateDivisionLeagueConfig = {},
                                onUpdateDivisionPlayoffConfig = {},
                                onUpdateDivisionTournamentConfig = {},
                                onSyncLeagueSlotsForSelectedDivisions = { _, _ -> },
                                onSetDivisionPaymentPlansEnabled = {},
                                onSyncDivisionInstallmentCount = {},
                                onUpdateDivisionInstallmentAmount = { _, _ -> },
                                onSetDivisionInstallmentDueDatePickerIndex = {},
                                onAddDivisionInstallmentRow = {},
                                onRemoveDivisionInstallmentRow = {},
                                onAddSelfToEventChange = {},
                                onAddCurrentUser = {},
                                onDivisionInputsExpandedChange = {},
                            ),
                        )
                    }
                }
            }
        }

        composeRule.onAllNodesWithText("Select a gender.").assertCountEquals(0)
        composeRule.onAllNodesWithText("Select a skill division.").assertCountEquals(0)
        composeRule.onAllNodesWithText("Select an age division.").assertCountEquals(0)

        composeRule.onNodeWithText("Attempt validation").performClick()

        composeRule.onNodeWithText("Select a gender.").assertIsDisplayed()
        composeRule.onNodeWithText("Select a skill division.").assertIsDisplayed()
        composeRule.onNodeWithText("Select an age division.").assertIsDisplayed()
    }

    private fun assertHiddenInitialEventErrors() {
        composeRule.onAllNodesWithText("Select an image for the event.").assertCountEquals(0)
        composeRule.onAllNodesWithText("Enter a Value").assertCountEquals(0)
        composeRule.onAllNodesWithText("Select a Location").assertCountEquals(0)
    }

    private fun testImageScheme() = DynamicScheme(
        seedColor = Color(0xFF006A6A),
        isDark = false,
        specVersion = ColorSpec.SpecVersion.SPEC_2025,
        style = PaletteStyle.Neutral,
    )
}
