@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventSearch

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import kotlinx.datetime.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class RentalBuilderAccessibilityUiTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun availableCell_exposesFieldDateTimeStatePriceAndSelectionAction() {
        val selectedDate = LocalDate(2030, 6, 10)
        val option = rentalOption()
        var selectedFieldId: String? = null
        var selectedStartMinutes: Int? = null

        composeRule.setContent {
            MaterialTheme {
                RentalDetailsContent(
                    selectedDate = selectedDate,
                    fieldOptions = listOf(option),
                    busyBlocks = emptyList(),
                    selections = emptyList(),
                    allSelectionCount = 0,
                    totalPriceCents = 0,
                    isLoadingFields = false,
                    isAvailabilityInteractive = true,
                    bottomPadding = 0.dp,
                    canGoNext = false,
                    validationMessage = null,
                    onSelectedDateChange = {},
                    onCreateSelection = { fieldId, startMinutes ->
                        selectedFieldId = fieldId
                        selectedStartMinutes = startMinutes
                    },
                    onCanUpdateSelection = { _, _, _ -> true },
                    onUpdateSelection = { _, _, _ -> true },
                    onDeleteSelection = {},
                    onNext = {},
                )
            }
        }

        val label = rentalSlotAccessibilityLabel(
            fieldLabel = "Court A",
            date = selectedDate,
            startMinutes = 60,
            endMinutes = 90,
            state = RentalSlotAccessibilityState.AVAILABLE,
            priceCents = 1_000,
        )
        composeRule
            .onNodeWithContentDescription(label)
            .assertHasClickAction()
            .performClick()

        assertEquals("field_1", selectedFieldId)
        assertEquals(60, selectedStartMinutes)
    }

    @Test
    fun freeAvailableCell_announcesThatNoPaymentIsRequired() {
        val selectedDate = LocalDate(2030, 6, 10)

        composeRule.setContent {
            MaterialTheme {
                RentalDetailsContent(
                    selectedDate = selectedDate,
                    fieldOptions = listOf(rentalOption(price = 0)),
                    busyBlocks = emptyList(),
                    selections = emptyList(),
                    allSelectionCount = 0,
                    totalPriceCents = 0,
                    isLoadingFields = false,
                    isAvailabilityInteractive = true,
                    bottomPadding = 0.dp,
                    canGoNext = false,
                    validationMessage = null,
                    onSelectedDateChange = {},
                    onCreateSelection = { _, _ -> },
                    onCanUpdateSelection = { _, _, _ -> true },
                    onUpdateSelection = { _, _, _ -> true },
                    onDeleteSelection = {},
                    onNext = {},
                )
            }
        }

        composeRule
            .onNodeWithContentDescription(
                rentalSlotAccessibilityLabel(
                    fieldLabel = "Court A",
                    date = selectedDate,
                    startMinutes = 60,
                    endMinutes = 90,
                    state = RentalSlotAccessibilityState.AVAILABLE,
                    priceCents = 0,
                )
            )
            .assertHasClickAction()
    }

    @Test
    fun selectedRange_exposesDeleteAndKeyboardEquivalentResizeActions() {
        val selectedDate = LocalDate(2030, 6, 10)
        val selection = RentalSelectionDraft(
            id = 7L,
            fieldId = "field_1",
            date = selectedDate,
            startMinutes = 90,
            endMinutes = 150,
        )
        var update: Triple<Long, Int, Int>? = null
        var deletedId: Long? = null

        composeRule.setContent {
            MaterialTheme {
                RentalDetailsContent(
                    selectedDate = selectedDate,
                    fieldOptions = listOf(rentalOption()),
                    busyBlocks = emptyList(),
                    selections = listOf(selection),
                    allSelectionCount = 1,
                    totalPriceCents = 2_000,
                    isLoadingFields = false,
                    isAvailabilityInteractive = true,
                    bottomPadding = 0.dp,
                    canGoNext = true,
                    validationMessage = null,
                    onSelectedDateChange = {},
                    onCreateSelection = { _, _ -> },
                    onCanUpdateSelection = { _, _, _ -> true },
                    onUpdateSelection = { selectionId, startMinutes, endMinutes ->
                        update = Triple(selectionId, startMinutes, endMinutes)
                        true
                    },
                    onDeleteSelection = { selectionId -> deletedId = selectionId },
                    onNext = {},
                )
            }
        }

        val selectionLabel = rentalSelectionAccessibilityLabel(
            fieldLabel = "Court A",
            date = selectedDate,
            startMinutes = 90,
            endMinutes = 150,
        )
        val startHandle = composeRule.onNodeWithContentDescription(
            "Adjust start time for $selectionLabel"
        )
        startHandle.assertHasClickAction()
        val actions = startHandle.fetchSemanticsNode().config[SemanticsActions.CustomActions]
        val action = actions.single { it.label == "Move start 30 minutes earlier" }
        composeRule.runOnIdle {
            assertTrue(action.action())
        }
        assertEquals(Triple(7L, 60, 150), update)

        val endHandle = composeRule.onNodeWithContentDescription(
            "Adjust end time for $selectionLabel"
        )
        endHandle.assertHasClickAction()
        val endActions = endHandle.fetchSemanticsNode().config[SemanticsActions.CustomActions]
        val endAction = endActions.single { it.label == "Move end 30 minutes earlier" }
        composeRule.runOnIdle {
            assertTrue(endAction.action())
        }
        assertEquals(Triple(7L, 90, 120), update)

        val deleteNode = composeRule
            .onNodeWithContentDescription("Delete $selectionLabel")
            .assertHasClickAction()
        val deleteAction = deleteNode.fetchSemanticsNode().config[SemanticsActions.OnClick]
        composeRule.runOnIdle {
            assertTrue(requireNotNull(deleteAction.action).invoke())
        }
        assertEquals(7L, deletedId)
    }

    @Test
    fun followingDate_rendersAfterMidnightSelectionAsAReadOnlyContinuation() {
        val selectedDate = LocalDate(2030, 6, 11)
        val selection = RentalSelectionDraft(
            id = 9L,
            fieldId = "field_1",
            date = LocalDate(2030, 6, 10),
            startMinutes = 23 * 60,
            endMinutes = 25 * 60,
        )
        var deletedId: Long? = null

        composeRule.setContent {
            MaterialTheme {
                RentalDetailsContent(
                    selectedDate = selectedDate,
                    fieldOptions = listOf(
                        rentalOption(
                            start = "2030-06-10T22:00:00Z",
                            end = "2030-06-11T02:00:00Z",
                        )
                    ),
                    busyBlocks = emptyList(),
                    selections = listOf(selection),
                    allSelectionCount = 1,
                    totalPriceCents = 4_000,
                    isLoadingFields = false,
                    isAvailabilityInteractive = true,
                    bottomPadding = 0.dp,
                    canGoNext = true,
                    validationMessage = null,
                    onSelectedDateChange = {},
                    onCreateSelection = { _, _ -> },
                    onCanUpdateSelection = { _, _, _ -> true },
                    onUpdateSelection = { _, _, _ -> true },
                    onDeleteSelection = { selectionId -> deletedId = selectionId },
                    onNext = {},
                )
            }
        }

        val sliceLabel = rentalSelectionAccessibilityLabel(
            fieldLabel = "Court A",
            date = selectedDate,
            startMinutes = 0,
            endMinutes = 60,
        )
        composeRule.onNodeWithContentDescription(
            "$sliceLabel, overnight continuation"
        ).assertExists()
        composeRule.onNodeWithContentDescription(
            rentalSlotAccessibilityLabel(
                fieldLabel = "Court A",
                date = selectedDate,
                startMinutes = 0,
                endMinutes = 30,
                state = RentalSlotAccessibilityState.SELECTED,
                priceCents = 1_000,
            )
        ).assertIsNotEnabled()
        composeRule.onAllNodesWithContentDescription(
            "Adjust start time",
            substring = true,
        ).assertCountEquals(0)

        composeRule
            .onNodeWithContentDescription("Delete $sliceLabel, overnight continuation")
            .assertHasClickAction()
            .performClick()
        assertEquals(9L, deletedId)
    }

    private fun rentalOption(
        start: String = "2030-06-10T01:00:00Z",
        end: String = "2030-06-10T03:00:00Z",
        price: Int = 2_000,
    ): RentalFieldOption = RentalFieldOption(
        field = Field(name = "Court A", id = "field_1"),
        rentalSlots = listOf(
            TimeSlot(
                id = "slot_1",
                dayOfWeek = null,
                daysOfWeek = null,
                startTimeMinutes = null,
                endTimeMinutes = null,
                startDate = Instant.parse(start),
                timeZone = "UTC",
                repeating = false,
                endDate = Instant.parse(end),
                scheduledFieldId = "field_1",
                scheduledFieldIds = listOf("field_1"),
                price = price,
            )
        ),
    )
}
