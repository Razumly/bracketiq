package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.presentation.RentalCreateContext
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DefaultCreateEventComponentTest : MainDispatcherTest() {
    @Test
    fun selecting_league_or_tournament_enables_open_ended_end_flag() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        assertTrue(harness.component.newEventState.value.noFixedEndDateTime)

        harness.component.onTypeSelected(EventType.EVENT)
        advance()
        assertFalse(harness.component.newEventState.value.noFixedEndDateTime)
    }

    @Test
    fun given_rental_context_when_updating_event_then_rental_constraints_lock_type_schedule_and_pricing() = runTest(testDispatcher) {
        val rentalContext = RentalCreateContext(
            organizationId = "org-1",
            organizationName = "Org One",
            organizationLocation = "Main Gym",
            organizationCoordinates = listOf(-122.25, 37.78),
            organizationFieldIds = listOf("org-field-1"),
            selectedFieldIds = listOf(" field-a ", "field-a", "field-b"),
            selectedTimeSlotIds = listOf(" slot-a ", "slot-a"),
            requiredTemplateIds = listOf("template-a", "template-b"),
            rentalPriceCents = 2500,
            startEpochMillis = 1_700_000_000_000,
            endEpochMillis = 1_700_003_600_000,
        )
        val harness = CreateEventHarness(rentalContext = rentalContext)
        advance()

        val initial = harness.component.newEventState.value
        assertEquals(EventType.EVENT, initial.eventType)
        assertEquals("org-1", initial.organizationId)
        assertEquals(listOf("field-a", "field-b"), initial.fieldIds)
        assertEquals(listOf("slot-a"), initial.timeSlotIds)
        assertEquals(2500, initial.priceCents)
        assertEquals(instant(1_700_000_000_000), initial.start)
        assertEquals(instant(1_700_003_600_000), initial.end)

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.updateEventField {
            copy(
                eventType = EventType.TOURNAMENT,
                organizationId = "org-override",
                fieldIds = listOf("field-override"),
                timeSlotIds = listOf("slot-override"),
                priceCents = 1,
                start = instant(1_600_000_000_000),
                end = instant(1_600_003_600_000),
            )
        }
        advance()

        val constrained = harness.component.newEventState.value
        assertEquals(EventType.EVENT, constrained.eventType)
        assertEquals("org-1", constrained.organizationId)
        assertEquals(listOf("field-a", "field-b"), constrained.fieldIds)
        assertEquals(listOf("slot-a"), constrained.timeSlotIds)
        assertEquals(2500, constrained.priceCents)
        assertEquals(instant(1_700_000_000_000), constrained.start)
        assertEquals(instant(1_700_003_600_000), constrained.end)
    }

    @Test
    fun given_league_slots_when_field_count_reduced_then_invalid_scheduled_field_ids_are_cleared() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(2)
        advance()
        val fieldIds = harness.component.localFields.value.map { it.id }

        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 2,
                startTimeMinutes = 60,
                endTimeMinutes = 120,
                scheduledFieldId = fieldIds[1],
            )
        }
        advance()

        harness.component.selectFieldCount(1)
        advance()

        assertEquals(1, harness.component.localFields.value.size)
        assertNull(harness.component.leagueSlots.value.first().scheduledFieldId)
        assertEquals(emptyList(), harness.component.leagueSlots.value.first().scheduledFieldIds)
    }

    @Test
    fun given_league_creation_when_fields_and_slots_submitted_then_only_valid_slots_are_created_and_mapped() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(2)
        advance()
        val localFieldIds = harness.component.localFields.value.map { it.id }

        harness.component.updateEventField {
            copy(
                name = "League Create Test",
                organizationId = "org-123",
                divisions = listOf("B", "Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLocalFieldDivisions(0, listOf("A"))
        harness.component.updateLocalFieldDivisions(1, emptyList())
        advance()

        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = localFieldIds[0],
            )
        }
        harness.component.addLeagueTimeSlot()
        harness.component.updateLeagueTimeSlot(1) {
            copy(
                dayOfWeek = 2,
                startTimeMinutes = 700,
                endTimeMinutes = 650,
                scheduledFieldId = localFieldIds[1],
            )
        }
        harness.component.updateLeagueScoringConfig {
            copy(
                pointsForWin = 3,
                pointsForLoss = 0,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(1, harness.eventRepository.createEventCalls.size)
        assertEquals(1, harness.onEventCreatedCount)
        assertEquals(2, harness.fieldRepository.createdFields.size)
        assertEquals(2, harness.fieldRepository.createdTimeSlots.size)

        val createCall = harness.eventRepository.createEventCalls.single()
        val createdFieldIds = harness.fieldRepository.createdFields.map { it.id }
        val createdSlots = harness.fieldRepository.createdTimeSlots

        assertEquals(createdFieldIds, createCall.event.fieldIds)
        assertEquals(createdSlots.map { it.id }, createCall.event.timeSlotIds)
        assertEquals(listOf("a"), harness.fieldRepository.createdFields[0].divisions)
        assertEquals(listOf("b", "open"), harness.fieldRepository.createdFields[1].divisions)
        assertEquals(createdFieldIds.first(), createdSlots[0].scheduledFieldId)
        assertEquals(createdFieldIds.first(), createdSlots[1].scheduledFieldId)
        assertEquals(listOf(1, 3), createdSlots.mapNotNull { it.dayOfWeek }.sorted())
        assertEquals(3, createCall.leagueScoringConfig?.pointsForWin)
        assertEquals(emptyList(), createCall.requiredTemplateIds)
    }

    @Test
    fun given_league_creation_with_no_event_divisions_when_field_divisions_empty_then_open_is_used() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()

        harness.component.updateEventField {
            copy(
                name = "League Field Division Fallback",
                organizationId = "org-open",
                divisions = emptyList(),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLocalFieldDivisions(0, emptyList())
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 2,
                daysOfWeek = listOf(2),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = harness.component.localFields.value.first().id,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(1, harness.fieldRepository.createdFields.size)
        assertEquals(listOf("open"), harness.fieldRepository.createdFields.first().divisions)
    }

    @Test
    fun given_league_creation_with_multi_field_slot_selection_when_submitted_then_slot_expands_for_each_day_and_field() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(2)
        advance()
        val localFieldIds = harness.component.localFields.value.map { it.id }

        harness.component.updateEventField {
            copy(
                name = "League Multi-Field Slot",
                organizationId = "org-multi",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = localFieldIds.first(),
                scheduledFieldIds = localFieldIds,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createdSlots = harness.fieldRepository.createdTimeSlots
        val createdFieldIds = harness.fieldRepository.createdFields.map { field -> field.id }
        assertEquals(4, createdSlots.size)
        assertEquals(
            setOf(
                Pair(1, createdFieldIds[0]),
                Pair(3, createdFieldIds[0]),
                Pair(1, createdFieldIds[1]),
                Pair(3, createdFieldIds[1]),
            ),
            createdSlots.map { slot -> Pair(slot.dayOfWeek, slot.scheduledFieldId) }.toSet(),
        )
    }

    @Test
    fun given_tournament_creation_when_submitted_then_fields_are_created_without_league_slots_or_scoring_config() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.TOURNAMENT)
        advance()
        harness.component.selectFieldCount(1)
        advance()

        harness.component.updateEventField {
            copy(
                name = "Tournament Create Test",
                organizationId = "org-456",
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.addLeagueTimeSlot()
        harness.component.updateLeagueScoringConfig { copy(pointsForWin = 9) }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(1, harness.eventRepository.createEventCalls.size)
        assertEquals(1, harness.onEventCreatedCount)
        assertEquals(1, harness.fieldRepository.createdFields.size)
        assertEquals(0, harness.fieldRepository.createdTimeSlots.size)

        val createCall = harness.eventRepository.createEventCalls.single()
        assertEquals(emptyList(), createCall.event.timeSlotIds)
        assertNull(createCall.leagueScoringConfig)
    }
}
