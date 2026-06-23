package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

class EventMatchEditingCoordinatorTest {
    @Test
    fun guarded_match_editing_commands_skip_when_not_allowed_and_delegate_when_allowed() {
        val coordinator = EventMatchEditingCoordinator()
        val event = Event(id = "event-1", eventType = EventType.LEAGUE)
        val existing = relation(match(id = "match-1", matchId = 1))

        assertFalse(
            coordinator.beginEditingIfAllowed(
                canManageMatchEditing = false,
                matches = listOf(existing),
                event = event,
                selectedDivisionId = null,
                buildRounds = ::simpleRounds,
            ),
        )
        assertFalse(coordinator.isEditingMatches.value)

        assertTrue(
            coordinator.beginEditingIfAllowed(
                canManageMatchEditing = true,
                matches = listOf(existing),
                event = event,
                selectedDivisionId = null,
                buildRounds = ::simpleRounds,
            ),
        )
        assertTrue(coordinator.isEditingMatches.value)

        assertFalse(
            coordinator.setLockForEditableMatchesIfEditable(
                canEditMatchesNow = false,
                matchIds = listOf("match-1"),
                locked = true,
                event = event,
                selectedDivisionId = null,
                buildRounds = ::simpleRounds,
            ),
        )
        assertFalse(coordinator.editableMatches.value.single().match.locked)

        assertTrue(
            coordinator.setLockForEditableMatchesIfEditable(
                canEditMatchesNow = true,
                matchIds = listOf(" match-1 "),
                locked = true,
                event = event,
                selectedDivisionId = null,
                buildRounds = ::simpleRounds,
            ),
        )
        assertTrue(coordinator.editableMatches.value.single().match.locked)

        assertNull(
            coordinator.createStagedMatchIfEditable(
                canEditMatchesNow = false,
                input = StagedMatchInput(
                    event = event,
                    selectedDivisionId = null,
                    creationContext = MatchCreateContext.BRACKET,
                    clientId = "blocked",
                    now = Instant.parse("2026-06-22T16:00:00Z"),
                ),
                openEditor = false,
                buildRounds = ::simpleRounds,
            ),
        )
        assertEquals(1, coordinator.editableMatches.value.size)

        assertFalse(
            coordinator.deleteMatchFromDialogIfEditable(
                canEditMatchesNow = false,
                matchId = "match-1",
                event = event,
                selectedDivisionId = null,
                buildRounds = ::simpleRounds,
            ),
        )
        assertEquals(1, coordinator.editableMatches.value.size)
    }

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
    fun show_match_edit_dialog_if_editable_builds_state_from_editable_matches() {
        val coordinator = EventMatchEditingCoordinator()
        val event = Event(id = "event-1", eventType = EventType.TOURNAMENT)
        val editable = relation(match(id = "editable", matchId = 1))
        val fallback = relation(match(id = "fallback", matchId = 2))
        coordinator.beginEditing(listOf(editable), event, null, ::simpleRounds)

        assertTrue(
            coordinator.showMatchEditDialogIfEditable(
                canEditMatchesNow = true,
                match = editable,
                teams = emptyList(),
                fields = emptyList(),
                fallbackMatches = listOf(fallback),
                event = event,
                players = emptyList(),
                creationContext = MatchCreateContext.BRACKET,
                isCreateMode = true,
            ),
        )

        val dialog = coordinator.showMatchEditDialog.value
        assertEquals(editable, dialog?.match)
        assertEquals(listOf(editable), dialog?.allMatches)
        assertEquals(EventType.TOURNAMENT, dialog?.eventType)
        assertTrue(dialog?.isCreateMode == true)

        coordinator.dismissMatchEditDialog(event, null, ::simpleRounds)
        assertFalse(
            coordinator.showMatchEditDialogIfEditable(
                canEditMatchesNow = false,
                match = editable,
                teams = emptyList(),
                fields = emptyList(),
                fallbackMatches = listOf(fallback),
                event = event,
                players = emptyList(),
                creationContext = MatchCreateContext.SCHEDULE,
                isCreateMode = false,
            ),
        )
        assertNull(coordinator.showMatchEditDialog.value)
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

    @Test
    fun commit_changes_returns_invalid_success_and_failure_results_with_loading_callbacks() = runTest {
        val coordinator = EventMatchEditingCoordinator()
        val tournament = Event(id = "event-1", eventType = EventType.TOURNAMENT)
        coordinator.beginEditing(emptyList(), tournament, null, ::simpleRounds)
        coordinator.createStagedMatch(
            input = StagedMatchInput(
                event = tournament,
                selectedDivisionId = null,
                creationContext = MatchCreateContext.BRACKET,
                clientId = "invalid",
                now = Instant.parse("2026-06-22T16:00:00Z"),
            ),
            openEditor = false,
            buildRounds = ::simpleRounds,
        )

        var repositoryCalls = 0
        val invalid = coordinator.commitChanges(
            isTournament = true,
            updateMatchesBulk = {
                repositoryCalls += 1
                Result.success(emptyList())
            },
        )
        assertIs<MatchEditCommitResult.Invalid>(invalid)
        assertEquals(0, repositoryCalls)
        assertTrue(coordinator.isEditingMatches.value)

        val league = Event(id = "event-1", eventType = EventType.LEAGUE)
        val existing = relation(match(id = "match-1", matchId = 1))
        coordinator.beginEditing(listOf(existing), league, null, ::simpleRounds)
        val loadingEvents = mutableListOf<String>()
        val success = coordinator.commitChanges(
            isTournament = false,
            updateMatchesBulk = { payload ->
                repositoryCalls += 1
                assertEquals(listOf("match-1"), payload.updates.map { match -> match.id })
                Result.success(payload.updates)
            },
            onCommitStarted = { loadingEvents += "start" },
            onCommitFinished = { loadingEvents += "finish" },
        )
        assertIs<MatchEditCommitResult.Success>(success)
        assertEquals(listOf("start", "finish"), loadingEvents)
        assertFalse(coordinator.isEditingMatches.value)

        coordinator.beginEditing(listOf(existing), league, null, ::simpleRounds)
        val failure = coordinator.commitChanges(
            isTournament = false,
            updateMatchesBulk = { Result.failure(IllegalStateException("boom")) },
            onCommitStarted = { loadingEvents += "failure-start" },
            onCommitFinished = { loadingEvents += "failure-finish" },
        )
        assertIs<MatchEditCommitResult.Failure>(failure)
        assertTrue(coordinator.isEditingMatches.value)
        assertEquals(listOf("start", "finish", "failure-start", "failure-finish"), loadingEvents)
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
