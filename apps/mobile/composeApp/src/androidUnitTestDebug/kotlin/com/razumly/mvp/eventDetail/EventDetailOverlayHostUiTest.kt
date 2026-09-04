package com.razumly.mvp.eventDetail

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceGraphDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.network.dto.EventEditorScheduleWarningDto

import com.razumly.mvp.core.network.dto.EventEditorMaintenanceUnscheduledMatchDto
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import kotlin.test.assertEquals
import kotlinx.datetime.TimeZone
import kotlin.test.assertTrue
import kotlin.test.assertFalse
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
class EventDetailOverlayHostUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun given_incomplete_proposal_with_more_than_eight_unscheduled_matches_when_review_renders_then_all_rows_are_available_before_acceptance() {
        var accepted = false
        val review = maintenanceReviewWithUnscheduledMatches(count = 9)

        composeRule.setContent {
            MaterialTheme {
                EventScheduleMaintenanceReviewDialog(
                    review = review,
                    onAccept = { accepted = true },
                    onReject = {},
                    onDismiss = {},
                    onRequestFreshProposal = {},
                )
            }
        }

        composeRule.onNodeWithText("Graph summary").assertIsDisplayed()
        composeRule.onNodeWithText("Proposed matches (9):").assertIsDisplayed()
        composeRule.onNodeWithText("9 matches remain unscheduled.")
            .performScrollTo()
            .assertIsDisplayed()
        review.reviewedProposal.scheduleOutcome.unscheduledMatches.forEach { match ->
            composeRule.onNodeWithText(maintenanceUnscheduledMatchLabel(match))
                .performScrollTo()
                .assertIsDisplayed()
        }

        composeRule.onNodeWithText("Review partial acceptance").performClick()
        assertFalse(accepted)
        composeRule.onNodeWithText("Accept partial schedule").performClick()
        assertTrue(accepted)
    }

    @Test
    fun given_placed_and_protected_matches_when_review_renders_then_each_row_exposes_explicit_placement_details() {
        val review = maintenanceReviewWithPlacedAndProtectedMatches()

        composeRule.setContent {
            MaterialTheme {
                EventScheduleMaintenanceReviewDialog(
                    review = review,
                    onAccept = {},
                    onReject = {},
                    onDismiss = {},
                    onRequestFreshProposal = {},
                )
            }
        }

        composeRule.onNodeWithText("Complete: 2 placed matches.").assertIsDisplayed()
        composeRule.onNodeWithText("Proposed matches (2):").assertIsDisplayed()
        composeRule.onNodeWithText("Match: match-regular (match 11)")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText("Placement: PLACED")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText(
            "Start: 1 Sep, 2026-10:00 AM · End: 1 Sep, 2026-11:00 AM",
        ).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Field: Court 1 (field-1)")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText(
            "Phase/division: phase POOL · division Division A · " +
                "phaseDivisionId pool-a · sourceDivisionId division-a",
        ).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Match: match-fixed (match 12)")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText("Placement: PLACED · fixed/protected")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText(
            "Start: 1 Sep, 2026-12:00 PM · End: 1 Sep, 2026-01:00 PM",
        ).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Field: Court 2 (field-2)")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText(
            "Phase/division: phase PLAYOFF · division Championship · " +
                "phaseDivisionId playoff · sourceDivisionId division-b",
        ).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithText("Protected matches (1):")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText("match-fixed")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule.onNodeWithText("Warning: Keep the fixed match in place.")
            .performScrollTo()
            .assertIsDisplayed()
    }


    @Test
    fun given_proposed_review_when_accept_and_reject_are_selected_then_callbacks_are_invoked() {
        var accepted = false
        var rejected = false
        val review = maintenanceReviewWithUnscheduledMatches(count = 1)

        composeRule.setContent {
            MaterialTheme {
                EventScheduleMaintenanceReviewDialog(
                    review = review,
                    onAccept = { accepted = true },
                    onReject = { rejected = true },
                    onDismiss = {},
                    onRequestFreshProposal = {},
                )
            }
        }

        composeRule.onNodeWithText("Review partial acceptance").assertIsDisplayed().performClick()
        assertFalse(accepted)
        composeRule.onNodeWithText("Back to proposal").performClick()
        composeRule.onNodeWithText("Reject").assertIsDisplayed().performClick()
        assertFalse(accepted)
        assertTrue(rejected)
    }

    @Test
    fun given_stale_proposal_when_review_renders_then_refresh_label_remains_accessible() {
        var refreshed = false
        val review = maintenanceReviewWithUnscheduledMatches(count = 1).copy(
            phase = EventScheduleMaintenanceReviewPhase.STALE,
        )

        composeRule.setContent {
            MaterialTheme {
                EventScheduleMaintenanceReviewDialog(
                    review = review,
                    onAccept = {},
                    onReject = {},
                    onDismiss = {},
                    onRequestFreshProposal = { refreshed = true },
                )
            }
        }

        composeRule.onNodeWithText("Request new proposal").assertIsDisplayed().performClick()
        assertTrue(refreshed)
    }

    @Test
    fun given_failed_request_when_review_renders_then_retry_and_setup_are_available_without_acceptance() {
        var retried = false
        var returned = false
        composeRule.setContent {
            MaterialTheme {
                EventScheduleMaintenanceReviewDialog(
                    review = EventScheduleMaintenanceReview(
                        phase = EventScheduleMaintenanceReviewPhase.FAILED,
                        message = "Connection failed. Your setup is retained.",
                    ),
                    onAccept = { error("Failed proposals cannot be accepted.") },
                    onReject = {},
                    onDismiss = { returned = true },
                    onRequestFreshProposal = { retried = true },
                )
            }
        }
        composeRule.onNodeWithText("Connection failed. Your setup is retained.").assertIsDisplayed()
        composeRule.onNodeWithText("Retry proposal").performClick()
        composeRule.onNodeWithText("Return to setup").performClick()
        composeRule.onNodeWithText("Accept").assertDoesNotExist()
        composeRule.onNodeWithText("Save without schedule").assertDoesNotExist()
        assertTrue(retried)
        assertTrue(returned)
    }

    @Test
    fun given_event_time_zone_when_review_renders_then_match_times_use_the_event_zone() {
        val match = EventEditorMatchProjectionDto(
            id = "match-time-zone",
            matchId = 1,
            eventId = "event-1",
            start = "2026-09-01T10:00:00Z",
            end = "2026-09-01T11:00:00Z",
        )

        assertEquals(
            "Start: 1 Sep, 2026-03:00 AM · End: 1 Sep, 2026-04:00 AM",
            maintenanceMatchTimingLabel(
                match = match,
                timeZone = TimeZone.of("America/Los_Angeles"),
            ),
        )
    }

    @Test
    fun given_review_time_zone_when_graph_omits_time_zone_then_match_times_use_review_zone() {
        val review = maintenanceReviewWithPlacedAndProtectedMatches().copy(
            eventTimeZone = "America/Los_Angeles",
        )

        composeRule.setContent {
            MaterialTheme {
                EventScheduleMaintenanceReviewDialog(
                    review = review,
                    onAccept = {},
                    onReject = {},
                    onDismiss = {},
                    onRequestFreshProposal = {},
                )
            }
        }

        composeRule.onNodeWithText(
            "Start: 1 Sep, 2026-03:00 AM · End: 1 Sep, 2026-04:00 AM",
        ).performScrollTo().assertIsDisplayed()
    }

    @Test
    fun given_accepted_sync_pending_review_when_retry_selected_then_only_retry_is_available() {
        var retried = false
        val review = maintenanceReviewWithUnscheduledMatches(count = 1).copy(
            phase = EventScheduleMaintenanceReviewPhase.ACCEPTED_SYNC_PENDING,
            message = "Schedule accepted, but the current schedule could not be synchronized.",
        )

        composeRule.setContent {
            MaterialTheme {
                EventScheduleMaintenanceReviewDialog(
                    review = review,
                    onAccept = {},
                    onReject = {},
                    onDismiss = {},
                    onRequestFreshProposal = {},
                    onRetryAcceptedScheduleSync = { retried = true },
                )
            }
        }

        composeRule.onNodeWithText("Schedule accepted — sync required").assertIsDisplayed()
        composeRule.onNodeWithText(review.message!!).assertIsDisplayed()
        composeRule.onAllNodesWithText("Accept").assertCountEquals(0)
        composeRule.onAllNodesWithText("Reject").assertCountEquals(0)
        composeRule.onAllNodesWithText("Close").assertCountEquals(0)
        composeRule.onNodeWithText("Retry sync").assertIsDisplayed().performClick()
        assertTrue(retried)
    }

    @Test
    fun given_match_teams_and_graph_links_when_labels_render_then_names_seeds_and_links_are_visible() {
        val match = EventEditorMatchProjectionDto(
            id = "match-2",
            matchId = 2,
            eventId = "event-1",
            team1Id = "team-a",
            team2Id = "team-b",
            team1Seed = 1,
            team2Seed = 4,
            previousLeftId = "match-1",
            winnerNextMatchId = "match-3",
        )

        assertEquals(
            "Teams: Alpha (seed 1) vs Beta (seed 4)",
            maintenanceMatchTeamsLabel(
                match = match,
                canonicalMatch = null,
                teamNames = mapOf("team-a" to "Alpha", "team-b" to "Beta"),
            ),
        )
        assertEquals(
            "Depends on: after Match 1, winner -> Match 3",
            maintenanceMatchDependencyLabel(
                match = match,
                canonicalMatch = null,
                matchLabels = mapOf(
                    "match-1" to "Match 1",
                    "match-2" to "Match 2",
                    "match-3" to "Match 3",
                ),
            ),
        )
    }

    private fun maintenanceReviewWithPlacedAndProtectedMatches(): EventScheduleMaintenanceReview {
        val matches = listOf(
            EventEditorMatchProjectionDto(
                id = "match-regular",
                matchId = 11,
                eventId = "event-1",
                start = "2026-09-01T10:00:00Z",
                end = "2026-09-01T11:00:00Z",
                placementState = "PLACED",
                phase = "POOL",
                division = "Division A",
                phaseDivisionId = "pool-a",
                sourceDivisionId = "division-a",
                fieldId = "field-1",
            ),
            EventEditorMatchProjectionDto(
                id = "match-fixed",
                matchId = 12,
                eventId = "event-1",
                start = "2026-09-01T12:00:00Z",
                end = "2026-09-01T13:00:00Z",
                locked = true,
                placementState = "PLACED",
                phase = "PLAYOFF",
                division = "Championship",
                phaseDivisionId = "playoff",
                sourceDivisionId = "division-b",
                fieldId = "field-2",
            ),
        )
        val outcome = EventEditorMaintenanceScheduleOutcomeDto(
            status = EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE,
            isComplete = true,
            matchCount = matches.size,
            placedMatchCount = matches.size,
            unplacedMatchCount = 0,
            matches = matches,
            unscheduledMatches = emptyList(),
            affectedCompetitionPhases = emptyList(),
            warnings = listOf(
                EventEditorScheduleWarningDto(
                    code = "PROTECTED_MATCH",
                    message = "Keep the fixed match in place.",
                ),
            ),
        )
        val proposal = EventEditorMaintenanceProposalDto(
            status = EventEditorMaintenanceResponseStatus.PROPOSED,
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.COMPLETE,
            operationId = "maintenance-operation-1",
            proposalRevision = "proposal-revision-1",
            revisionBinding = EventEditorRevisionBindingDto(
                editorRevision = "editor-revision-1",
                scheduleRevision = "schedule-revision-1",
                availabilityRevision = "availability-revision-1",
            ),
            graph = EventEditorMaintenanceGraphDto(
                event = EventApiDto(
                    id = "event-1",
                    fields = listOf(
                        Field(id = "field-1", fieldNumber = 1, name = "Court 1"),
                        Field(id = "field-2", fieldNumber = 2, name = "Court 2"),
                    ),
                ),
                matches = matches,
            ),
            protectedMatchIds = listOf("match-fixed"),
            scheduleOutcome = outcome,
        )
        return EventScheduleMaintenanceReview(
            proposal = proposal,
            acceptanceOperationId = "acceptance-operation-1",
        )
    }

    private fun maintenanceReviewWithUnscheduledMatches(
        count: Int,
    ): EventScheduleMaintenanceReview {
        val matches = (1..count).map { index ->
            EventEditorMatchProjectionDto(
                id = "unscheduled-match-$index",
                matchId = index,
                eventId = "event-1",
                placementState = "UNPLACED",
                phase = "POOL",
                phaseDivisionId = "phase-division-$index",
                sourceDivisionId = "source-division-$index",
            )
        }
        val unscheduledMatches = matches.map { match ->
            EventEditorMaintenanceUnscheduledMatchDto(
                id = match.id,
                matchId = match.matchId,
                phaseDivisionId = match.phaseDivisionId!!,
                phase = match.phase!!,
                sourceDivisionId = match.sourceDivisionId,
            )
        }
        val outcome = EventEditorMaintenanceScheduleOutcomeDto(
            status = EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE,
            isComplete = false,
            matchCount = count,
            placedMatchCount = 0,
            unplacedMatchCount = count,
            matches = matches,
            unscheduledMatches = unscheduledMatches,
            affectedCompetitionPhases = emptyList(),
            warnings = emptyList(),
        )
        val proposal = EventEditorMaintenanceProposalDto(
            status = EventEditorMaintenanceResponseStatus.PROPOSED,
            contractVersion = 3,
            eventId = "event-1",
            operation = EventEditorMaintenanceOperation.COMPLETE,
            operationId = "maintenance-operation-1",
            proposalRevision = "proposal-revision-1",
            revisionBinding = EventEditorRevisionBindingDto(
                editorRevision = "editor-revision-1",
                scheduleRevision = "schedule-revision-1",
                availabilityRevision = "availability-revision-1",
            ),
            graph = EventEditorMaintenanceGraphDto(
                event = EventApiDto(id = "event-1"),
                matches = matches,
            ),
            protectedMatchIds = emptyList(),
            scheduleOutcome = outcome,
        )
        return EventScheduleMaintenanceReview(
            proposal = proposal,
            acceptanceOperationId = "acceptance-operation-1",
        )
    }
}
