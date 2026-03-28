package com.razumly.mvp.core.data.dataTypes

import com.razumly.mvp.eventCreate.createSport
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OfficialStaffingTest {
    @Test
    fun normalized_match_official_assignments_preserves_distinct_slots_for_same_user() {
        val assignments = listOf(
            MatchOfficialAssignment(
                positionId = "position-r1",
                slotIndex = 0,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = "official-1",
                eventOfficialId = "event-official-1",
            ),
            MatchOfficialAssignment(
                positionId = "position-line",
                slotIndex = 0,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = "official-1",
                eventOfficialId = "event-official-1",
            ),
            MatchOfficialAssignment(
                positionId = "position-line",
                slotIndex = 1,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = "official-2",
                eventOfficialId = "event-official-2",
            ),
        )

        val normalized = assignments.normalizedMatchOfficialAssignments()

        assertEquals(3, normalized.size)
        assertEquals(
            listOf("position-r1:0", "position-line:0", "position-line:1"),
            normalized.map { assignment -> "${assignment.positionId}:${assignment.slotIndex}" },
        )
        assertEquals(
            listOf("official-1", "official-1", "official-2"),
            normalized.map(MatchOfficialAssignment::userId),
        )
    }

    @Test
    fun normalized_match_official_assignments_keeps_first_assignment_for_duplicate_slot() {
        val assignments = listOf(
            MatchOfficialAssignment(
                positionId = "position-line",
                slotIndex = 0,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = "official-2",
                eventOfficialId = "event-official-2",
            ),
            MatchOfficialAssignment(
                positionId = "position-line",
                slotIndex = 0,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = "official-1",
                eventOfficialId = "event-official-1",
            ),
        )

        val normalized = assignments.normalizedMatchOfficialAssignments()

        assertEquals(1, normalized.size)
        assertEquals("official-2", normalized.single().userId)
    }

    @Test
    fun sync_official_staffing_seeds_positions_and_event_officials_from_sport_defaults() {
        val sport = createSport(id = "sport-1", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "R1", count = 1),
                SportOfficialPositionTemplate(name = "Line Judge", count = 2),
            ),
        )
        val event = Event(
            id = "event-1",
            name = "Event",
            sportId = sport.id,
            officialIds = listOf("official-1", "official-2"),
        )

        val synced = event.syncOfficialStaffing(sport = sport)

        assertEquals(listOf("R1", "Line Judge"), synced.officialPositions.map(EventOfficialPosition::name))
        assertEquals(listOf(1, 2), synced.officialPositions.map(EventOfficialPosition::count))
        assertEquals(listOf("official-1", "official-2"), synced.officialIds)
        assertEquals(2, synced.eventOfficials.size)
        assertTrue(
            synced.eventOfficials.all { official ->
                official.positionIds == synced.officialPositions.map(EventOfficialPosition::id)
            },
        )
    }

    @Test
    fun should_replace_defaults_only_when_existing_positions_still_match_previous_sport() {
        val previousSport = createSport(id = "sport-old", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
            ),
        )
        val nextSport = createSport(id = "sport-new", usePointsPerSetWin = false).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Umpire", count = 1),
            ),
        )
        val defaultBackedEvent = Event(
            id = "event-2",
            sportId = nextSport.id,
            officialPositions = previousSport.defaultEventOfficialPositions("event-2"),
        )
        val customizedEvent = defaultBackedEvent.copy(
            officialPositions = listOf(
                EventOfficialPosition(
                    id = "custom-1",
                    name = "Lead Official",
                    count = 1,
                    order = 0,
                ),
            ),
        )

        assertTrue(
            defaultBackedEvent.shouldReplaceOfficialPositionsWithSportDefaults(
                previousSport = previousSport,
                nextSport = nextSport,
            ),
        )
        assertFalse(
            customizedEvent.shouldReplaceOfficialPositionsWithSportDefaults(
                previousSport = previousSport,
                nextSport = nextSport,
            ),
        )
    }

    @Test
    fun add_and_remove_position_keep_event_official_role_mappings_in_sync() {
        val sport = createSport(id = "sport-3", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
            ),
        )
        val baseEvent = Event(
            id = "event-3",
            sportId = sport.id,
            officialIds = listOf("official-1"),
        ).syncOfficialStaffing(sport = sport)

        val withAddedPosition = baseEvent.addOfficialPosition(name = "Assistant Referee", sport = sport)
        val addedPositionId = withAddedPosition.officialPositions
            .first { position -> position.name == "Assistant Referee" }
            .id
        val withUpdatedRole = withAddedPosition.updateOfficialUserPositions(
            userId = "official-1",
            positionIds = listOf(addedPositionId),
            sport = sport,
        )
        val withoutAddedPosition = withUpdatedRole.removeOfficialPosition(
            positionId = addedPositionId,
            sport = sport,
        )

        assertEquals(2, withAddedPosition.officialPositions.size)
        assertTrue(withAddedPosition.eventOfficials.single().positionIds.contains(addedPositionId))
        assertEquals(listOf(addedPositionId), withUpdatedRole.eventOfficials.single().positionIds)
        assertTrue(withoutAddedPosition.officialPositions.none { position -> position.id == addedPositionId })
        assertTrue(withoutAddedPosition.eventOfficials.isEmpty())
        assertTrue(withoutAddedPosition.officialIds.isEmpty())
    }

    @Test
    fun removing_last_position_keeps_positions_empty_until_defaults_are_explicitly_loaded() {
        val sport = createSport(id = "sport-4", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
            ),
        )
        val seeded = Event(
            id = "event-4",
            sportId = sport.id,
            officialIds = listOf("official-1"),
        ).syncOfficialStaffing(sport = sport)

        val cleared = seeded.removeOfficialPosition(
            positionId = seeded.officialPositions.single().id,
            sport = sport,
        )
        val restored = cleared.syncOfficialStaffing(
            sport = sport,
            replacePositionsWithSportDefaults = true,
        )

        assertTrue(cleared.officialPositions.isEmpty())
        assertTrue(cleared.eventOfficials.isEmpty())
        assertTrue(cleared.officialIds.isEmpty())
        assertEquals(listOf("Referee"), restored.officialPositions.map(EventOfficialPosition::name))
    }

    @Test
    fun match_assignment_helpers_preserve_roles_and_check_in_state() {
        val match = MatchMVP(
            id = "match-1",
            eventId = "event-1",
            matchId = 1,
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "position-r1",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "official-1",
                    eventOfficialId = "event-official-1",
                    checkedIn = false,
                ),
                MatchOfficialAssignment(
                    positionId = "position-line",
                    slotIndex = 1,
                    holderType = OfficialAssignmentHolderType.PLAYER,
                    userId = "player-1",
                    checkedIn = true,
                ),
            ),
        )

        val updated = match.updateOfficialAssignmentCheckIn(
            userId = "official-1",
            checkedIn = true,
        )

        assertEquals(listOf("official-1", "player-1"), updated.assignedOfficialUserIds())
        assertTrue(updated.isUserAssignedToOfficialSlot("player-1"))
        assertTrue(updated.isUserCheckedInForOfficialSlot("player-1"))
        assertEquals("official-1", updated.primaryAssignedOfficialId())
        assertTrue(updated.primaryAssignedOfficialCheckedIn())
        assertEquals(
            listOf("R1", "Line Judge 2 (Player)"),
            updated.officialAssignmentLabels(
                positions = listOf(
                    EventOfficialPosition(id = "position-r1", name = "R1", count = 1, order = 0),
                    EventOfficialPosition(id = "position-line", name = "Line Judge", count = 2, order = 1),
                ),
            ),
        )
    }
}
