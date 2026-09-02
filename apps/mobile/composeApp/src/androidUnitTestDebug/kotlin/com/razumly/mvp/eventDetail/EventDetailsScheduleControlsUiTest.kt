package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.ktx.DynamicScheme
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.SportResourceLabels
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.shared.localImageScheme
import kotlinx.datetime.TimeZone
import kotlin.test.assertEquals
import kotlin.time.Instant
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
class EventDetailsScheduleControlsUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun simple_enabled_schedule_state_shows_automation_and_generated_end_controls() {
        var changed: Boolean? = null
        composeRule.setContent {
            testTheme {
                LazyColumn {
                    simpleEventDetailsOptionsSection(
                        state = simpleOptionsState(
                            event = leagueEvent(automatedScheduling = true),
                        ),
                        actions = simpleOptionsActions { changed = it },
                    )
                }
            }
        }

        composeRule.onNodeWithText("Automated Scheduling").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("No Planned End").performScrollTo().assertIsDisplayed()
        composeRule.onNode(
            hasText("Automated Scheduling") and hasClickAction(),
        ).assertIsEnabled().performClick()

        assertEquals(false, changed)
    }

    @Test
    fun simple_disabled_schedule_state_hides_generated_end_control() {
        composeRule.setContent {
            testTheme {
                LazyColumn {
                    simpleEventDetailsOptionsSection(
                        state = simpleOptionsState(
                            event = leagueEvent(automatedScheduling = false),
                        ),
                        actions = simpleOptionsActions(),
                    )
                }
            }
        }

        composeRule.onNodeWithText("Automated Scheduling").performScrollTo().assertIsDisplayed()
        composeRule.onAllNodesWithText("No Planned End").assertCountEquals(0)
    }

    @Test
    fun simple_locked_schedule_state_shows_lock_reason_and_disables_automation() {
        composeRule.setContent {
            testTheme {
                LazyColumn {
                    simpleEventDetailsOptionsSection(
                        state = simpleOptionsState(
                            event = leagueEvent(automatedScheduling = true),
                            automatedSchedulingLocked = true,
                        ),
                        actions = simpleOptionsActions(),
                    )
                }
            }
        }

        composeRule.onNodeWithText("Automated Scheduling").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Automated Scheduling is locked for this event.").performScrollTo().assertIsDisplayed()
        composeRule.onNode(
            hasText("Automated Scheduling") and hasClickAction(),
        ).assertIsNotEnabled()
    }

    @Test
    fun advanced_enabled_schedule_state_shows_and_accepts_automation_toggle() {
        var changed: Boolean? = null
        composeAdvancedScheduleState(
            event = leagueEvent(automatedScheduling = true),
            onAutomatedSchedulingChange = { changed = it },
        )

        advancedAutomationToggle().assertIsEnabled().performClick()

        assertEquals(false, changed)
        composeRule.onNodeWithText("Timeslots (1)").assertIsDisplayed()
    }

    @Test
    fun advanced_disabled_schedule_state_removes_schedule_construction_controls() {
        composeAdvancedScheduleState(
            event = leagueEvent(automatedScheduling = false),
        )

        composeRule.onNodeWithText("Automated Scheduling").assertIsDisplayed()
        composeRule.onAllNodesWithText("Timeslots (1)").assertCountEquals(0)
        composeRule.onAllNodesWithText("Use timeslots").assertCountEquals(0)
    }

    @Test
    fun advanced_locked_schedule_state_keeps_control_visible_but_disabled() {
        composeAdvancedScheduleState(
            event = leagueEvent(automatedScheduling = true),
            automatedSchedulingLocked = true,
        )

        composeRule.onNodeWithText("Automated Scheduling").assertIsDisplayed()
        advancedAutomationToggle().assertIsNotEnabled()
    }

    private fun composeAdvancedScheduleState(
        event: Event,
        automatedSchedulingLocked: Boolean = false,
        onAutomatedSchedulingChange: (Boolean) -> Unit = {},
    ) {
        composeRule.setContent {
            testTheme {
                LazyColumn {
                    eventDetailsScheduleSection(
                        state = advancedScheduleState(
                            event = event,
                            automatedSchedulingLocked = automatedSchedulingLocked,
                        ),
                        actions = advancedScheduleActions(
                            onAutomatedSchedulingChange = onAutomatedSchedulingChange,
                        ),
                    )
                }
            }
        }
    }

    private fun advancedAutomationToggle() = composeRule.onNode(
        hasAnyDescendant(hasText("Automated Scheduling")) and isToggleable(),
        useUnmergedTree = true,
    )

    private fun simpleOptionsState(
        event: Event,
        automatedSchedulingLocked: Boolean = false,
    ) = SimpleEventDetailsOptionsState(
        editEvent = event,
        paidRegistrationEnabled = false,
        hostHasAccount = true,
        automatedSchedulingLocked = automatedSchedulingLocked,
    )

    private fun simpleOptionsActions(
        onAutomatedSchedulingChange: (Boolean) -> Unit = {},
    ) = SimpleEventDetailsOptionsActions(
        onEventTypeSelected = {},
        onTeamRegistrationChange = {},
        onMultipleDivisionsChange = {},
        onAutomatedSchedulingChange = onAutomatedSchedulingChange,
        onNoFixedEndDateChange = {},
        onPlayoffsOrPoolPlayChange = {},
        onDoubleEliminationChange = {},
        onPaidRegistrationChange = {},
        onManualPaymentsChange = {},
        onAutomaticRefundsChange = {},
        onPaymentPlansChange = {},
        onTeamsOfficiateChange = {},
        onTeamOfficialsMaySwapChange = {},
        onAllowRosterEditsChange = {},
        onAllowTemporaryPlayersChange = {},
    )

    private fun advancedScheduleState(
        event: Event,
        automatedSchedulingLocked: Boolean,
    ) = EventDetailsScheduleState(
        readOnlySection = ReadOnlySectionModel(sectionId = "schedule", title = "Schedule"),
        editSection = EditSectionModel(sectionId = "schedule", title = "Schedule"),
        sectionExpansionStates = mutableStateMapOf("schedule:edit" to true),
        eventDetailsMode = EventDetailsMode.EDIT,
        lazyListState = androidx.compose.foundation.lazy.LazyListState(),
        stickyHeaderTopInset = 0.dp,
        enabled = true,
        supportsScheduleConfig = true,
        event = event,
        editEvent = event,
        resourceLabels = SportResourceLabels(singular = "Court", plural = "Courts"),
        readOnlyFieldCount = 1,
        timeSlots = listOf(scheduleSlot()),
        fieldsById = emptyMap(),
        divisionDetails = emptyList(),
        fallbackDivisionIds = emptyList(),
        fieldCount = 1,
        fields = emptyList(),
        leagueTimeSlots = listOf(scheduleSlot()),
        availableRentalResources = emptyList(),
        selectedRentalResourceIds = emptySet(),
        rentalResourceSelectionLocked = false,
        eventTimeZone = TimeZone.UTC,
        slotErrors = emptyMap(),
        slotEditorEnabled = true,
        showUseManualTimeSlotsToggle = true,
        useManualTimeSlots = true,
        slotDivisionOptions = emptyList(),
        showSlotDivisions = false,
        allowDivisionEditsWhenReadOnly = false,
        allowLocalResourceCreationWithRentalResources = false,
        isFieldCountValid = true,
        isLeagueSlotsValid = true,
        showValidationErrors = false,
        scheduleTimeLocked = false,
        automatedSchedulingLocked = automatedSchedulingLocked,
    )

    private fun advancedScheduleActions(
        onAutomatedSchedulingChange: (Boolean) -> Unit,
    ) = EventDetailsScheduleActions(
        onDisabledClick = {},
        onAutomatedSchedulingChange = onAutomatedSchedulingChange,
        onRentalResourceSelectionChange = { _, _ -> },
        onFieldCountChange = {},
        onFieldNameChange = { _, _ -> },
        onAddSlot = {},
        onUpdateSlot = { _, _ -> },
        onRemoveSlot = {},
        onUseManualTimeSlotsChange = {},
    )

    private fun leagueEvent(automatedScheduling: Boolean) = Event(
        id = "ui-league",
        eventType = EventType.LEAGUE,
        isAutomatedScheduling = automatedScheduling,
        start = Instant.parse("2026-08-26T12:00:00Z"),
        end = Instant.parse("2026-08-26T14:00:00Z"),
    )

    private fun scheduleSlot() = TimeSlot(
        id = "slot-1",
        dayOfWeek = null,
        startTimeMinutes = 720,
        endTimeMinutes = 840,
        startDate = Instant.parse("2026-08-26T12:00:00Z"),
        repeating = false,
        endDate = Instant.parse("2026-08-26T14:00:00Z"),
        price = null,
)

    @Composable
    private fun testTheme(content: @Composable () -> Unit) {
        CompositionLocalProvider(localImageScheme provides testImageScheme()) {
            MaterialTheme(content = content)
        }
    }

    private fun testImageScheme() = DynamicScheme(
        seedColor = Color(0xFF006A6A),
        isDark = false,
        specVersion = ColorSpec.SpecVersion.SPEC_2025,
        style = PaletteStyle.Neutral,
    )
}
