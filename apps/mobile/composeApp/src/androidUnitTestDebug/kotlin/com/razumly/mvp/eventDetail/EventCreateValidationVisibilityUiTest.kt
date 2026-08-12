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
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.dp
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_MANUAL
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.InclusivePriceBreakdown
import com.razumly.mvp.core.data.repositories.InclusivePriceQuote
import com.razumly.mvp.core.data.repositories.InclusivePriceQuoteDirection
import com.razumly.mvp.eventDetail.shared.localImageScheme
import kotlinx.coroutines.CompletableDeferred
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
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

    @Test
    fun split_league_shows_only_division_playoff_count() {
        val splitLeague = Event(
            eventType = EventType.LEAGUE,
            includePlayoffs = true,
            singleDivision = false,
            maxParticipants = 8,
        )
        val divisionEditor = DivisionEditorState(playoffTeamCount = 4)

        composeRule.setContent {
            CompositionLocalProvider(localImageScheme provides testImageScheme()) {
                MaterialTheme {
                    Column {
                        EventDetailsDivisionEditorForm(
                            state = EventDetailsDivisionEditorFormState(
                                editEvent = splitLeague,
                                divisionDetails = emptyList(),
                                selectedDivisions = emptyList(),
                                divisionEditor = divisionEditor,
                                divisionEditorDefaults = divisionEditor,
                                divisionEditorReady = true,
                                divisionScheduleUsesSets = false,
                                skillDivisionTypeOptions = emptyList(),
                                ageDivisionTypeOptions = emptyList(),
                                genderOptions = emptyList(),
                                divisionInputsExpanded = true,
                                hostHasAccount = false,
                                isNewEvent = false,
                                showValidationErrors = false,
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
                        SimpleEventDetailsDivisionEditorForm(
                            state = EventDetailsDivisionEditorFormState(
                                editEvent = splitLeague,
                                divisionDetails = emptyList(),
                                selectedDivisions = emptyList(),
                                divisionEditor = divisionEditor,
                                divisionEditorDefaults = divisionEditor,
                                divisionEditorReady = true,
                                divisionScheduleUsesSets = false,
                                skillDivisionTypeOptions = emptyList(),
                                ageDivisionTypeOptions = emptyList(),
                                genderOptions = emptyList(),
                                divisionInputsExpanded = true,
                                hostHasAccount = false,
                                isNewEvent = false,
                                showValidationErrors = false,
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
                        EventDetailsDivisionEditorActionsContent(
                            state = EventDetailsDivisionEditorActionsState(
                                editEvent = splitLeague,
                                divisionEditor = divisionEditor,
                                divisionEditorReady = true,
                                isSkillLevelValid = true,
                                isLeaguePlayoffTeamsValid = true,
                                showValidationErrors = false,
                                divisionDetails = emptyList(),
                            ),
                            actions = EventDetailsDivisionEditorActions(
                                onDivisionEditorChange = {},
                                onSaveDivision = {},
                                onResetDivisionEditor = {},
                                onEditDivision = {},
                                onRemoveDivision = {},
                            ),
                        )
                    }
                }
            }
        }

        composeRule.onAllNodesWithText("Event Playoff Team Count *").assertCountEquals(0)
        composeRule.onAllNodesWithText("Division Playoff Team Count *").assertCountEquals(1)
    }

    @Test
    fun division_price_only_applies_the_accepted_server_total() {
        val hostQuote = CompletableDeferred<Result<InclusivePriceQuote>>()
        var persistedPriceCents = 1_000
        var quoteConfirmed = false

        composeRule.setContent {
            CompositionLocalProvider(localImageScheme provides testImageScheme()) {
                MaterialTheme {
                    EventDetailsDivisionEditorForm(
                        state = EventDetailsDivisionEditorFormState(
                            editEvent = Event(
                                id = "event-price-test",
                                priceCents = persistedPriceCents,
                                maxParticipants = 8,
                                singleDivision = true,
                            ),
                            divisionDetails = emptyList(),
                            selectedDivisions = emptyList(),
                            divisionEditor = DivisionEditorState(priceCents = persistedPriceCents),
                            divisionEditorDefaults = DivisionEditorState(priceCents = persistedPriceCents),
                            divisionEditorReady = true,
                            divisionScheduleUsesSets = false,
                            skillDivisionTypeOptions = emptyList(),
                            ageDivisionTypeOptions = emptyList(),
                            genderOptions = emptyList(),
                            divisionInputsExpanded = true,
                            hostHasAccount = true,
                            isNewEvent = true,
                            showValidationErrors = false,
                            addSelfToEvent = false,
                            inclusivePriceEditorKey = "division-price-test",
                        ),
                        actions = EventDetailsDivisionEditorFormActions(
                            onEditEvent = { update ->
                                persistedPriceCents = update(Event(priceCents = persistedPriceCents)).priceCents
                            },
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
                            quoteInclusivePrice = { direction, amountCents, _ ->
                                when (direction) {
                                    InclusivePriceQuoteDirection.TOTAL_PRICE -> Result.success(
                                        priceQuote(
                                            direction = direction,
                                            requestedAmountCents = amountCents,
                                            hostReceivesCents = 800,
                                            processingFeeCents = 150,
                                            platformFeeCents = 50,
                                            totalPriceCents = 1_000,
                                        ),
                                    )
                                    InclusivePriceQuoteDirection.HOST_AMOUNT -> hostQuote.await()
                                }
                            },
                            onPriceQuoteConfirmationChange = { quoteConfirmed = it },
                        ),
                    )
                }
            }
        }

        composeRule.waitUntil { quoteConfirmed }
        composeRule.onAllNodes(hasSetTextAction())[1].performTextReplacement("7777")
        composeRule.waitForIdle()

        assertFalse(quoteConfirmed)
        assertEquals(1_000, persistedPriceCents)

        hostQuote.complete(
            Result.success(
                priceQuote(
                    direction = InclusivePriceQuoteDirection.HOST_AMOUNT,
                    requestedAmountCents = 7_777,
                    hostReceivesCents = 7_777,
                    processingFeeCents = 1_543,
                    platformFeeCents = 556,
                    totalPriceCents = 9_876,
                ),
            ),
        )
        composeRule.waitUntil { quoteConfirmed && persistedPriceCents == 9_876 }

        assertTrue(quoteConfirmed)
        assertEquals(9_876, persistedPriceCents)
    }


    @Test
    fun editing_single_division_pool_count_allows_null_without_restoring_previous_value() {
        val detail = DivisionDetail(
            id = "event-pool-test__division__m_skill_open_age_u18",
            maxParticipants = 8,
            playoffTeamCount = 4,
            poolCount = 3,
        )
        val event = Event(
            id = "event-pool-test",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            teamSignup = true,
            singleDivision = true,
            divisions = listOf(detail.id),
            divisionDetails = listOf(detail),
            maxParticipants = 8,
            playoffTeamCount = 4,
            registrationPaymentMode = REGISTRATION_PAYMENT_MODE_MANUAL,
        )
        val editor = DivisionEditorState(
            editingId = detail.id,
            gender = "M",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "u18",
            name = "Men's Open U18",
            maxParticipants = 8,
            playoffTeamCount = 4,
            poolCount = 3,
        )
        var activeEditor = editor

        composeRule.setContent {
            var renderedEditor by remember { mutableStateOf(editor) }
            CompositionLocalProvider(localImageScheme provides testImageScheme()) {
                MaterialTheme {
                    EventDetailsDivisionEditorForm(
                        state = EventDetailsDivisionEditorFormState(
                            editEvent = event,
                            divisionDetails = listOf(detail),
                            selectedDivisions = listOf(detail.id),
                            divisionEditor = renderedEditor,
                            divisionEditorDefaults = editor.copy(editingId = null),
                            divisionEditorReady = true,
                            divisionScheduleUsesSets = false,
                            skillDivisionTypeOptions = emptyList(),
                            ageDivisionTypeOptions = emptyList(),
                            genderOptions = emptyList(),
                            divisionInputsExpanded = true,
                            hostHasAccount = false,
                            isNewEvent = false,
                            showValidationErrors = true,
                            addSelfToEvent = false,
                        ),
                        actions = EventDetailsDivisionEditorFormActions(
                            onEditEvent = { this },
                            onDivisionEditorChange = {
                                activeEditor = it
                                renderedEditor = it
                            },
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

        composeRule.onNodeWithText("Pool Count *").assertIsDisplayed()
        composeRule.onAllNodes(hasSetTextAction())[3].performTextReplacement("")
        composeRule.waitForIdle()

        assertEquals(null, activeEditor.poolCount)
        composeRule.onAllNodes(hasSetTextAction())[3].assert(
            SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText,
                AnnotatedString(""),
            ),
        )
        composeRule.onNodeWithText("Required when pool play is enabled.").assertIsDisplayed()

        composeRule.onAllNodes(hasSetTextAction())[3].performTextReplacement("2")
        composeRule.waitForIdle()

        assertEquals(2, activeEditor.poolCount)

        composeRule.onAllNodes(hasSetTextAction())[3].performTextReplacement("0")
        composeRule.waitForIdle()

        assertEquals(0, activeEditor.poolCount)
        composeRule.onNodeWithText("Required when pool play is enabled.").assertIsDisplayed()
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

    private fun priceQuote(
        direction: InclusivePriceQuoteDirection,
        requestedAmountCents: Int,
        hostReceivesCents: Int,
        processingFeeCents: Int,
        platformFeeCents: Int,
        totalPriceCents: Int,
    ): InclusivePriceQuote = InclusivePriceQuote(
        version = 1,
        direction = direction,
        requestedAmountCents = requestedAmountCents,
        breakdown = InclusivePriceBreakdown(
            hostReceivesCents = hostReceivesCents,
            processingFeeCents = processingFeeCents,
            platformFeeCents = platformFeeCents,
            totalPriceCents = totalPriceCents,
            platformFeePercentage = 0.123,
        ),
    )
}
