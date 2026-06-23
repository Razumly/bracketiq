package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

class EventMatchEditingCoordinatorTest {
    @Test
    fun staged_schedule_match_uses_client_id_and_prepares_create_payload() {
        val coordinator = EventMatchEditingCoordinator()
        val event = Event(
            id = "event-1",
            eventType = EventType.LEAGUE,
            divisions = listOf("division_a"),
        )
        val now = Instant.parse("2026-06-22T16:00:00Z")
        coordinator.beginEditing(emptyList(), event, "division_a", ::simpleRounds)

        val staged = coordinator.createStagedMatch(
            input = StagedMatchInput(
                event = event,
                selectedDivisionId = "division_a",
                creationContext = MatchCreateContext.SCHEDULE,
                seed = match(
                    id = "seed",
                    matchId = 0,
                    fieldId = " field-1 ",
                    start = now,
                    end = now.plus(2.hours),
                ),
                clientId = "match-1",
                now = now,
            ),
            openEditor = false,
            buildRounds = ::simpleRounds,
        )

        assertEquals("client:match-1", staged.match.id)
        assertEquals(1, staged.match.matchId)
        assertEquals("field-1", staged.match.fieldId)
        assertEquals(now, staged.match.start)
        assertEquals(now.plus(2.hours), staged.match.end)
        assertEquals("division_a", staged.match.division)

        val preparation = coordinator.prepareCommit(isTournament = false)
        val payload = assertIs<MatchEditCommitPreparation.Valid>(preparation).payload
        assertEquals(emptyList(), payload.updates)
        assertEquals(emptyList(), payload.deletes)
        assertEquals(1, payload.creates.size)
        assertEquals("match-1", payload.creates.single().clientId)
        assertEquals("schedule", payload.creates.single().creationContext)
        assertEquals(staged.match, payload.creates.single().match)
    }

    @Test
    fun add_bracket_match_from_anchor_links_anchor_and_uses_placeholder_team() {
        val coordinator = EventMatchEditingCoordinator()
        val event = Event(
            id = "event-1",
            eventType = EventType.TOURNAMENT,
            divisions = listOf("division_a"),
        )
        val anchor = relation(match(id = "anchor", matchId = 7, division = "division_a"))
        coordinator.beginEditing(listOf(anchor), event, "division_a", ::simpleRounds)

        val staged = coordinator.addBracketMatchFromAnchor(
            anchorMatchId = " anchor ",
            slot = BracketAddSlot.PREVIOUS_LEFT,
            event = event,
            selectedDivisionId = "division_a",
            clientId = "child-1",
            now = Instant.parse("2026-06-22T16:00:00Z"),
            buildRounds = ::simpleRounds,
        )

        assertEquals("client:child-1", staged?.match?.id)
        assertEquals("placeholder-local:1", staged?.match?.team1Id)
        assertEquals("anchor", staged?.match?.winnerNextMatchId)

        val updatedAnchor = coordinator.editableMatches.value.first { relation -> relation.match.id == "anchor" }
        assertEquals("client:child-1", updatedAnchor.match.previousLeftId)

        val payload = assertIs<MatchEditCommitPreparation.Valid>(
            coordinator.prepareCommit(isTournament = true),
        ).payload
        assertEquals(listOf("anchor"), payload.updates.map { match -> match.id })
        assertEquals("child-1", payload.creates.single().clientId)
        assertTrue(payload.creates.single().autoPlaceholderTeam)
    }

    @Test
    fun dismiss_match_edit_dialog_removes_pending_staged_create() {
        val coordinator = EventMatchEditingCoordinator()
        val event = Event(id = "event-1", eventType = EventType.LEAGUE)
        coordinator.beginEditing(emptyList(), event, null, ::simpleRounds)

        coordinator.createStagedMatch(
            input = StagedMatchInput(
                event = event,
                selectedDivisionId = null,
                creationContext = MatchCreateContext.BRACKET,
                clientId = "match-1",
                now = Instant.parse("2026-06-22T16:00:00Z"),
            ),
            openEditor = true,
            buildRounds = ::simpleRounds,
        )

        assertEquals(1, coordinator.editableMatches.value.size)
        coordinator.dismissMatchEditDialog(event, null, ::simpleRounds)

        assertEquals(emptyList(), coordinator.editableMatches.value)
        assertNull(coordinator.showMatchEditDialog.value)
        val payload = assertIs<MatchEditCommitPreparation.Valid>(
            coordinator.prepareCommit(isTournament = false),
        ).payload
        assertEquals(emptyList(), payload.creates)
    }

    private fun simpleRounds(matches: Map<String, MatchWithRelations>): List<List<MatchWithRelations?>> =
        listOf(matches.values.toList())

    private fun relation(match: MatchMVP): MatchWithRelations =
        MatchWithRelations(
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

    private fun match(
        id: String,
        matchId: Int,
        fieldId: String? = null,
        start: Instant? = null,
        end: Instant? = null,
        division: String? = null,
    ): MatchMVP =
        MatchMVP(
            id = id,
            matchId = matchId,
            eventId = "event-1",
            fieldId = fieldId,
            start = start,
            end = end,
            division = division,
        )
}
