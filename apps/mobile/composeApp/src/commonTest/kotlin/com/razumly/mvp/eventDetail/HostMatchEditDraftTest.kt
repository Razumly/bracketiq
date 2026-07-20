package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchTimekeepingConfigMVP
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HostMatchEditDraftTest {
    @Test
    fun given_three_sets_when_count_grows_then_targets_and_score_rows_resize_together() {
        val match = match().copy(
            team1Points = listOf(21, 16, 13),
            team2Points = listOf(10, 21, 15),
            setResults = listOf(1, 2, 2),
        )
        val drafts = buildHostMatchScoreDrafts(match, count = 3)

        val resizedTargets = resizeHostMatchTargetInputs(
            targets = listOf("21", "21", "15"),
            count = 4,
            fallback = 21,
        )
        val resizedDrafts = resizeHostMatchScoreDrafts(drafts, count = 4)

        assertEquals(listOf("21", "21", "15", "15"), resizedTargets)
        assertEquals(4, resizedDrafts.size)
        assertEquals(4, resizedDrafts.last().sequence)
        assertEquals(0, resizedDrafts.last().team1Score)
        assertFalse(resizedDrafts.last().confirmed)
    }

    @Test
    fun given_first_set_is_confirmed_when_local_draft_updates_then_second_confirmation_enables_without_save() {
        val drafts = listOf(
            HostMatchScoreDraft(sequence = 1, team1Score = 21, team2Score = 10, confirmed = false),
            HostMatchScoreDraft(sequence = 2, team1Score = 0, team2Score = 0, confirmed = false),
        )

        assertFalse(canToggleHostMatchConfirmation(drafts, index = 1, matchStarted = true))
        val confirmation = applyHostMatchConfirmation(
            drafts = drafts,
            index = 0,
            checked = true,
            scoringModel = "SETS",
            pointTargets = listOf(21, 21),
            supportsDraw = false,
        )

        assertNull(confirmation.errorMessage)
        assertTrue(confirmation.drafts.first().confirmed)
        assertTrue(canToggleHostMatchConfirmation(confirmation.drafts, index = 1, matchStarted = true))
    }

    @Test
    fun given_confirmed_rows_when_an_earlier_score_changes_then_that_and_later_confirmations_clear() {
        val drafts = listOf(
            HostMatchScoreDraft(sequence = 1, team1Score = 21, team2Score = 10, confirmed = true),
            HostMatchScoreDraft(sequence = 2, team1Score = 16, team2Score = 21, confirmed = true),
            HostMatchScoreDraft(sequence = 3, team1Score = 0, team2Score = 0, confirmed = false),
        )

        val updated = editHostMatchScoreDraft(
            drafts = drafts,
            index = 0,
            team = HostMatchScoreTeam.TEAM1,
            score = 22,
        )

        assertEquals(22, updated.first().team1Score)
        assertFalse(updated[0].confirmed)
        assertFalse(updated[1].confirmed)
    }

    @Test
    fun given_four_set_inputs_when_policy_builds_then_snapshot_has_four_exact_targets() {
        val result = buildHostMatchPolicySnapshot(
            baseRules = setRules(),
            segmentLabel = "set",
            segmentCount = 4,
            targetInputs = listOf("21", "21", "15", "11"),
            segmentDurationMinutes = null,
            segmentDurationTouched = false,
        )

        assertNull(result.errorMessage)
        assertEquals(4, result.snapshot?.segmentCount)
        assertEquals("Set", result.snapshot?.segmentLabel)
        assertEquals(listOf(21, 21, 15, 11), result.snapshot?.setPointTargets)
    }

    @Test
    fun given_timed_period_policy_when_duration_changes_then_minutes_are_saved_and_sequence_overrides_clear() {
        val result = buildHostMatchPolicySnapshot(
            baseRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 4,
                segmentLabel = "Quarter",
                timekeeping = ResolvedMatchTimekeepingConfigMVP(
                    timerMode = "COUNT_DOWN",
                    segmentDurationMinutes = 10,
                    segmentDurationMinutesBySequence = listOf(10, 10, 10, 10),
                ),
            ),
            segmentLabel = "Quarter",
            segmentCount = 4,
            targetInputs = emptyList(),
            segmentDurationMinutes = 12,
            segmentDurationTouched = true,
        )

        assertNull(result.errorMessage)
        assertEquals(12, result.snapshot?.timekeeping?.segmentDurationMinutes)
        assertEquals(emptyList(), result.snapshot?.timekeeping?.segmentDurationMinutesBySequence)
    }

    @Test
    fun given_completed_set_draft_when_payload_builds_then_segments_and_legacy_scores_stay_synchronized() {
        val source = match()
        val rules = setRules().copy(segmentCount = 4, setPointTargets = listOf(21, 21, 15, 11))
        val drafts = listOf(
            HostMatchScoreDraft(sequence = 1, team1Score = 21, team2Score = 10, confirmed = true),
            HostMatchScoreDraft(sequence = 2, team1Score = 16, team2Score = 21, confirmed = true),
            HostMatchScoreDraft(sequence = 3, team1Score = 15, team2Score = 8, confirmed = true),
            HostMatchScoreDraft(sequence = 4, team1Score = 0, team2Score = 0, confirmed = false),
        )

        val updated = buildHostMatchScorePayload(
            match = source,
            drafts = drafts,
            rules = rules,
            matchStarted = true,
            resultType = "REGULATION",
            forfeitingEventTeamId = null,
            statusReason = "",
            exceptionalActualEnd = null,
        )

        assertEquals(listOf(21, 16, 15, 0), updated.team1Points)
        assertEquals(listOf(10, 21, 8, 0), updated.team2Points)
        assertEquals(listOf(1, 2, 1, 0), updated.setResults)
        assertEquals(4, updated.segments.size)
        assertEquals("COMPLETE", updated.status)
        assertEquals("team-a", updated.winnerEventTeamId)
    }

    private fun match(): MatchMVP = MatchMVP(
        id = "match-1",
        matchId = 1,
        eventId = "event-1",
        team1Id = "team-a",
        team2Id = "team-b",
    )

    private fun setRules(): ResolvedMatchRulesMVP = ResolvedMatchRulesMVP(
        scoringModel = "SETS",
        segmentCount = 3,
        segmentLabel = "Set",
        setPointTargets = listOf(21, 21, 15),
    )
}
