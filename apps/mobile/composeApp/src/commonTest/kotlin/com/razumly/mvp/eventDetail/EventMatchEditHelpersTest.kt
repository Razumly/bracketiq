package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventMatchEditHelpersTest {
    @Test
    fun official_check_in_edit_updates_the_target_slot_and_primary_legacy_state() {
        val match = MatchMVP(
            id = "match-1",
            matchId = 1,
            eventId = "event-1",
            officialId = "official-1",
            officialCheckedIn = false,
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "referee",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "official-1",
                    eventOfficialId = "event-official-1",
                    checkedIn = false,
                ),
                MatchOfficialAssignment(
                    positionId = "line-judge",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "official-2",
                    eventOfficialId = "event-official-2",
                    checkedIn = false,
                ),
            ),
        )

        val updated = match.withOfficialAssignmentCheckIn(" referee ", 0, true)

        assertTrue(updated.officialIds.first().checkedIn)
        assertFalse(updated.officialIds.last().checkedIn)
        assertEquals(true, updated.officialCheckedIn)
    }
    @Test
    fun normalizeEditableBracketGraph_assigns_previous_slots_from_incoming_next_links() {
        val left = relation(match(id = "left", matchId = 1, winnerNextMatchId = "final"))
        val right = relation(match(id = "right", matchId = 2, winnerNextMatchId = "final"))
        val final = relation(match(id = "final", matchId = 3))

        val normalized = normalizeEditableBracketGraph(listOf(left, right, final))
        val normalizedFinal = normalized.first { relation -> relation.match.id == "final" }

        assertEquals("left", normalizedFinal.match.previousLeftId)
        assertEquals("right", normalizedFinal.match.previousRightId)
        assertEquals("left", normalizedFinal.previousLeftMatch?.id)
        assertEquals("right", normalizedFinal.previousRightMatch?.id)
        assertEquals("final", normalized.first { relation -> relation.match.id == "left" }.winnerNextMatch?.id)
    }

    @Test
    fun validateEditableMatches_rejects_overlapping_matches_on_same_field() {
        val first = relation(
            match(
                id = "match-1",
                matchId = 1,
                fieldId = "field-1",
                start = Instant.parse("2026-04-14T15:00:00Z"),
                end = Instant.parse("2026-04-14T16:00:00Z"),
            ),
        )
        val second = relation(
            match(
                id = "match-2",
                matchId = 2,
                fieldId = "field-1",
                start = Instant.parse("2026-04-14T15:30:00Z"),
                end = Instant.parse("2026-04-14T16:30:00Z"),
            ),
        )

        val result = validateEditableMatches(
            matches = listOf(first, second),
            isTournament = false,
            stagedCreates = emptyMap(),
            isClientMatchId = { false },
        )

        assertFalse(result.isValid)
        assertEquals("Matches #1 and #2 overlap on the same field", result.errorMessage)
    }

    @Test
    fun validateEditableMatches_rejects_overlapping_matches_with_shared_participants() {
        val first = relation(
            match(
                id = "match-1",
                matchId = 1,
                team1Id = "team-1",
                start = Instant.parse("2026-04-14T15:00:00Z"),
                end = Instant.parse("2026-04-14T16:00:00Z"),
            ),
        )
        val second = relation(
            match(
                id = "match-2",
                matchId = 2,
                team2Id = "team-1",
                start = Instant.parse("2026-04-14T15:30:00Z"),
                end = Instant.parse("2026-04-14T16:30:00Z"),
            ),
        )

        val result = validateEditableMatches(
            matches = listOf(first, second),
            isTournament = false,
            stagedCreates = emptyMap(),
            isClientMatchId = { false },
        )

        assertFalse(result.isValid)
        assertEquals("Matches #1 and #2 have overlapping participants", result.errorMessage)
    }

    @Test
    fun validateEditableMatches_rejects_staged_schedule_match_without_field_start_and_end() {
        val stagedId = "client:match-1"
        val result = validateEditableMatches(
            matches = listOf(relation(match(id = stagedId, matchId = 1))),
            isTournament = false,
            stagedCreates = mapOf(
                stagedId to StagedMatchCreateMeta(
                    clientId = "match-1",
                    creationContext = MatchCreateContext.SCHEDULE,
                    autoPlaceholderTeam = false,
                ),
            ),
            isClientMatchId = { id -> id?.startsWith("client:") == true },
        )

        assertFalse(result.isValid)
        assertEquals("Schedule match #1 requires field, start, and end.", result.errorMessage)
    }

    @Test
    fun validateEditableMatches_rejects_staged_tournament_match_without_bracket_links() {
        val stagedId = "client:match-1"
        val result = validateEditableMatches(
            matches = listOf(
                relation(
                    match(
                        id = stagedId,
                        matchId = 1,
                        fieldId = "field-1",
                        start = Instant.parse("2026-04-14T15:00:00Z"),
                        end = Instant.parse("2026-04-14T16:00:00Z"),
                    ),
                ),
            ),
            isTournament = true,
            stagedCreates = mapOf(
                stagedId to StagedMatchCreateMeta(
                    clientId = "match-1",
                    creationContext = MatchCreateContext.BRACKET,
                    autoPlaceholderTeam = true,
                ),
            ),
            isClientMatchId = { id -> id?.startsWith("client:") == true },
        )

        assertFalse(result.isValid)
        assertEquals("Tournament match #1 must include at least one bracket link.", result.errorMessage)
    }

    @Test
    fun shouldResetBracketMatch_resets_all_tournament_matches_and_only_league_playoff_matches() {
        val scheduleMatch = match(id = "schedule", matchId = 1)
        val bracketMatch = match(id = "bracket", matchId = 2, winnerNextMatchId = "final")

        assertTrue(
            shouldResetBracketMatch(
                event = Event(eventType = EventType.TOURNAMENT),
                match = scheduleMatch,
            ),
        )
        assertFalse(
            shouldResetBracketMatch(
                event = Event(eventType = EventType.LEAGUE, includePlayoffs = false),
                match = bracketMatch,
            ),
        )
        assertTrue(
            shouldResetBracketMatch(
                event = Event(eventType = EventType.LEAGUE, includePlayoffs = true),
                match = bracketMatch,
            ),
        )
        assertFalse(
            shouldResetBracketMatch(
                event = Event(eventType = EventType.LEAGUE, includePlayoffs = true),
                match = scheduleMatch,
            ),
        )
    }

    @Test
    fun toEmptyBracketMatch_clears_score_and_official_state_without_clearing_links() {
        val source = match(
            id = "match-1",
            matchId = 1,
            teamOfficialId = "official-team",
            winnerNextMatchId = "final",
        ).copy(
            officialId = "official-1",
            team1Points = listOf(21),
            team2Points = listOf(18),
            setResults = listOf(1),
            locked = true,
        )

        val reset = source.toEmptyBracketMatch()

        assertNull(reset.officialId)
        assertNull(reset.teamOfficialId)
        assertEquals(emptyList(), reset.team1Points)
        assertEquals(emptyList(), reset.team2Points)
        assertEquals(emptyList(), reset.setResults)
        assertFalse(reset.locked)
        assertEquals("final", reset.winnerNextMatchId)
    }

    @Test
    fun resetBracketMatchesAfterSchedule_resets_matching_matches_and_refetches() = runTest {
        val scoredBracketMatch = match(
            id = "bracket",
            matchId = 1,
            winnerNextMatchId = "final",
        ).copy(
            officialId = "official-1",
            team1Points = listOf(3),
            locked = true,
        )
        val scheduleMatch = match(id = "schedule", matchId = 2)
        val finalSnapshot = listOf(scoredBracketMatch.toEmptyBracketMatch(), scheduleMatch)
        val requestedEventIds = mutableListOf<String>()
        val updates = mutableListOf<List<MatchMVP>>()

        val result = resetBracketMatchesAfterSchedule(
            event = Event(
                id = "event-1",
                eventType = EventType.LEAGUE,
                includePlayoffs = true,
            ),
            getMatchesOfTournament = { eventId ->
                requestedEventIds += eventId
                if (requestedEventIds.size == 1) {
                    listOf(scoredBracketMatch, scheduleMatch)
                } else {
                    finalSnapshot
                }
            },
            updateMatchesBulk = { matches -> updates += matches },
        )

        assertEquals(listOf("event-1", "event-1"), requestedEventIds)
        assertEquals(listOf(listOf(scoredBracketMatch.toEmptyBracketMatch())), updates)
        assertEquals(finalSnapshot, result)
    }

    @Test
    fun resetBracketMatchesAfterSchedule_skips_update_when_no_matches_need_reset() = runTest {
        val scheduleMatch = match(id = "schedule", matchId = 1)
        val requestedEventIds = mutableListOf<String>()
        val updates = mutableListOf<List<MatchMVP>>()

        val result = resetBracketMatchesAfterSchedule(
            event = Event(
                id = "event-1",
                eventType = EventType.LEAGUE,
                includePlayoffs = true,
            ),
            getMatchesOfTournament = { eventId ->
                requestedEventIds += eventId
                listOf(scheduleMatch)
            },
            updateMatchesBulk = { matches -> updates += matches },
        )

        assertEquals(listOf("event-1", "event-1"), requestedEventIds)
        assertEquals(emptyList(), updates)
        assertEquals(listOf(scheduleMatch), result)
    }

    private fun relation(match: MatchMVP): MatchWithRelations {
        return MatchWithRelations(
            match = match,
            field = null,
            team1 = null,
            team2 = null,
            teamOfficial = null,
            winnerNextMatch = null,
            loserNextMatch = null,
            previousLeftMatch = null,
            previousRightMatch = null,
        )
    }

    private fun match(
        id: String,
        matchId: Int,
        team1Id: String? = null,
        team2Id: String? = null,
        teamOfficialId: String? = null,
        fieldId: String? = null,
        start: Instant? = null,
        end: Instant? = null,
        winnerNextMatchId: String? = null,
        loserNextMatchId: String? = null,
        previousLeftId: String? = null,
        previousRightId: String? = null,
    ): MatchMVP {
        return MatchMVP(
            id = id,
            matchId = matchId,
            eventId = "event-1",
            team1Id = team1Id,
            team2Id = team2Id,
            teamOfficialId = teamOfficialId,
            fieldId = fieldId,
            start = start,
            end = end,
            winnerNextMatchId = winnerNextMatchId,
            loserNextMatchId = loserNextMatchId,
            previousLeftId = previousLeftId,
            previousRightId = previousRightId,
        )
    }
}
