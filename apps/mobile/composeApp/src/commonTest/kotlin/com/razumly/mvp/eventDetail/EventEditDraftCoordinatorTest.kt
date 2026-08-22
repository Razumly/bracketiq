package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Instant

class EventEditDraftCoordinatorTest {
    @Test
    fun given_readonly_draft_when_seeded_and_refreshed_then_event_fields_and_scoring_are_populated() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(fieldIds = emptyList()),
            canEditInitial = false,
        )
        val event = leagueEvent(
            divisions = listOf("division-a"),
            fieldIds = listOf("field-1"),
        )

        coordinator.refreshReadOnlyDraft(
            event = event,
            sourceFields = listOf(field(id = "field-1", divisions = emptyList())),
            leagueScoringConfig = LeagueScoringConfigDTO(pointsForWin = 3),
        )

        assertEquals(listOf("field-1"), coordinator.editedEvent.value.fieldIds)
        assertEquals(listOf("division_a"), coordinator.editableFields.value.single().divisions)
        assertEquals(1, coordinator.fieldCount.value)
        assertEquals(3, coordinator.editableLeagueScoringConfig.value.pointsForWin)
    }

    @Test
    fun given_editing_seed_when_applied_then_canonical_field_values_and_slot_order_are_preserved() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(fieldIds = listOf("field-1")),
            canEditInitial = true,
        )
        val canonicalField = field(
            id = "field-1",
            name = null,
            divisions = emptyList(),
            location = null,
        ).copy(
            lat = 40.7128,
            long = -74.0060,
            heading = 12.5,
            inUse = true,
            rentalSlotIds = listOf("rental-slot-1"),
            organizationId = "organization-1",
        )
        val canonicalSlots = listOf(
            slot("slot-2", startDate = Instant.parse("2026-04-20T12:00:00Z")),
            slot("slot-1", startDate = Instant.parse("2026-04-13T12:00:00Z")),
        )

        coordinator.seedDraftForEditing(
            event = leagueEvent(fieldIds = listOf("field-1")),
            sourceFields = listOf(canonicalField),
            timeSlots = canonicalSlots,
            leagueScoringConfig = LeagueScoringConfigDTO(),
        )

        assertEquals(canonicalField, coordinator.editableFields.value.single())
        assertEquals(canonicalSlots, coordinator.editableLeagueTimeSlots.value)
    }

    @Test
    fun given_field_count_when_selected_then_fields_resize_and_slots_are_pruned() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(),
            canEditInitial = true,
        )
        coordinator.seedDraftForEditing(
            event = leagueEvent(
                divisions = listOf("division-a"),
                fieldIds = listOf("field-1", "field-2"),
                location = "Main Park",
            ),
            sourceFields = listOf(
                field(id = "field-1", name = "", divisions = emptyList(), location = null),
                field(id = "field-2", name = "Second", divisions = listOf("division-a"), location = "Court"),
            ),
            timeSlots = listOf(slot(id = "slot-1", scheduledFieldIds = listOf("field-1", "field-2"))),
            leagueScoringConfig = LeagueScoringConfigDTO(),
        )

        coordinator.selectFieldCount(1)

        assertEquals(listOf("field-1"), coordinator.editedEvent.value.fieldIds)
        assertEquals(listOf("field-1"), coordinator.editableLeagueTimeSlots.value.single().scheduledFieldIds)
        assertEquals("Resource 1", coordinator.editableFields.value.single().name)
        assertEquals("Main Park", coordinator.editableFields.value.single().location)
    }

    @Test
    fun given_edited_event_when_updated_then_field_defaults_and_slot_boundaries_are_synced() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(location = "Old Park"),
            canEditInitial = true,
        )
        coordinator.seedDraftForEditing(
            event = leagueEvent(
                fieldIds = listOf("field-1"),
                location = "Old Park",
                start = Instant.parse("2026-04-13T12:00:00Z"),
                end = Instant.parse("2026-05-13T12:00:00Z"),
            ),
            sourceFields = listOf(field(id = "field-1", location = "Old Park")),
            timeSlots = listOf(
                slot(
                    id = "slot-1",
                    startDate = Instant.parse("2026-04-13T12:00:00Z"),
                    endDate = Instant.parse("2026-05-13T12:00:00Z"),
                ),
            ),
            leagueScoringConfig = LeagueScoringConfigDTO(),
        )

        coordinator.updateEditedEvent { current ->
            current.copy(
                location = "New Park",
                start = Instant.parse("2026-04-20T12:00:00Z"),
                end = Instant.parse("2026-05-20T12:00:00Z"),
            )
        }

        assertEquals("New Park", coordinator.editableFields.value.single().location)
        assertEquals(Instant.DISTANT_PAST, coordinator.editableLeagueTimeSlots.value.single().startDate)
        assertEquals(Instant.parse("2026-05-20T00:00:00Z"), coordinator.editableLeagueTimeSlots.value.single().endDate)
    }

    @Test
    fun given_local_field_names_and_league_slots_when_updated_then_draft_state_is_updated() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent(fieldIds = listOf("field-1")),
            canEditInitial = true,
        )
        coordinator.seedDraftForEditing(
            event = leagueEvent(fieldIds = listOf("field-1")),
            sourceFields = listOf(field(id = "field-1")),
            timeSlots = emptyList(),
            leagueScoringConfig = LeagueScoringConfigDTO(),
        )

        coordinator.updateLocalFieldName(0, "Center Court")
        coordinator.addLeagueTimeSlot(
            now = Instant.parse("2026-04-13T12:00:00Z"),
            idFactory = { "slot-1" },
        )
        coordinator.updateLeagueScoringConfig { copy(pointsForWin = 4) }
        coordinator.applyPreparedEditableFields(
            listOf(field(id = "prepared-field", fieldNumber = 1, name = "Center Court")),
        )

        assertEquals("Center Court", coordinator.editableFields.value.single().name)
        assertEquals(listOf("prepared-field"), coordinator.editedEvent.value.fieldIds)
        assertEquals("slot-1", coordinator.editableLeagueTimeSlots.value.single().id)
        assertEquals(4, coordinator.editableLeagueScoringConfig.value.pointsForWin)
    }

    @Test
    fun given_participant_immutable_fields_when_changes_are_requested_then_event_type_and_registration_mode_stay_locked() {
        val coordinator = EventEditDraftCoordinator(
            initialEvent = leagueEvent().copy(teamSignup = false),
            canEditInitial = true,
        )
        coordinator.setControlLocks(setOf("eventType", "teamSignup"))

        coordinator.updateEditedEvent { current ->
            current.copy(
                name = "Renamed League",
                eventType = EventType.EVENT,
                teamSignup = true,
            )
        }

        assertEquals(EventEditorControlLocks(eventType = true, teamSignup = true), coordinator.controlLocks.value)
        assertEquals("Renamed League", coordinator.editedEvent.value.name)
        assertEquals(EventType.LEAGUE, coordinator.editedEvent.value.eventType)
        assertEquals(false, coordinator.editedEvent.value.teamSignup)
    }

    @Test
    fun given_each_event_type_when_registration_unit_changes_then_contract_policy_is_enforced() {
        val requestedStates = listOf(
            EventType.EVENT to true,
            EventType.WEEKLY_EVENT to false,
            EventType.LEAGUE to false,
            EventType.TOURNAMENT to false,
            EventType.TRYOUT to true,
        )

        requestedStates.forEach { (eventType, requestedTeamSignup) ->
            val coordinator = EventEditDraftCoordinator(
                initialEvent = Event(eventType = EventType.EVENT, teamSignup = false),
                canEditInitial = true,
            )

            coordinator.updateEditedEvent { current ->
                current.copy(
                    eventType = eventType,
                    teamSignup = requestedTeamSignup,
                )
            }

            val expectedTeamSignup = when (eventType) {
                EventType.LEAGUE, EventType.TOURNAMENT -> true
                EventType.TRYOUT -> false
                EventType.EVENT, EventType.WEEKLY_EVENT -> requestedTeamSignup
            }
            assertEquals(expectedTeamSignup, coordinator.editedEvent.value.teamSignup)
        }
    }

    @Test
    fun given_room_lock_metadata_when_editor_starts_after_restart_then_controls_are_locked() {
        val persistedEvent = Event(
            eventType = EventType.EVENT,
            eventTypeLocked = true,
            registrationUnitLocked = true,
            eventTypeHasProtectedHistory = true,
        )
        val coordinator = EventEditDraftCoordinator(
            initialEvent = persistedEvent,
            canEditInitial = true,
        )

        coordinator.setControlLocks(emptySet())

        assertEquals(
            EventEditorControlLocks(
                eventType = true,
                teamSignup = true,
                eventTypeHasProtectedHistory = true,
            ),
            coordinator.controlLocks.value,
        )
    }

    private fun leagueEvent(
        eventType: EventType = EventType.LEAGUE,
        divisions: List<String> = listOf("open"),
        fieldIds: List<String> = listOf("field-1"),
        location: String = "Main Park",
        start: Instant = Instant.parse("2026-04-13T12:00:00Z"),
        end: Instant = Instant.parse("2026-05-13T12:00:00Z"),
    ): Event {
        return Event(
            id = "event-1",
            name = "League",
            eventType = eventType,
            divisions = divisions,
            fieldIds = fieldIds,
            location = location,
            start = start,
            end = end,
            timeZone = "UTC",
            singleDivision = true,
        )
    }

    private fun field(
        id: String,
        fieldNumber: Int = 1,
        name: String? = "Field $fieldNumber",
        divisions: List<String> = listOf("open"),
        location: String? = "Main Park",
    ): Field {
        return Field(
            id = id,
            fieldNumber = fieldNumber,
            name = name,
            divisions = divisions,
            location = location,
        )
    }

    private fun slot(
        id: String,
        startDate: Instant = Instant.parse("2026-04-13T12:00:00Z"),
        endDate: Instant? = Instant.parse("2026-05-13T12:00:00Z"),
        scheduledFieldIds: List<String> = listOf("field-1"),
    ): TimeSlot {
        return TimeSlot(
            id = id,
            dayOfWeek = 1,
            daysOfWeek = listOf(1),
            divisions = listOf("open"),
            startTimeMinutes = 9 * 60,
            endTimeMinutes = 10 * 60,
            startDate = startDate,
            timeZone = "UTC",
            repeating = true,
            endDate = endDate,
            scheduledFieldId = scheduledFieldIds.firstOrNull(),
            scheduledFieldIds = scheduledFieldIds,
            price = null,
        )
    }
}
