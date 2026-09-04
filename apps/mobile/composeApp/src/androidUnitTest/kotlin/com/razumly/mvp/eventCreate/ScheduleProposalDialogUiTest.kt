package com.razumly.mvp.eventCreate

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorCatalogsDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalDto
import com.razumly.mvp.core.network.dto.EventEditorAffectedCompetitionPhaseDto
import com.razumly.mvp.core.network.dto.EventEditorUnscheduledMatchDto
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalGraphDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorExpectedCreateRevisionsDto
import com.razumly.mvp.core.network.dto.EventEditorImmutableDto
import com.razumly.mvp.core.network.dto.EventEditorParticipationDto
import com.razumly.mvp.core.network.dto.EventEditorPaymentDto
import com.razumly.mvp.core.network.dto.EventEditorRegistrationDto
import com.razumly.mvp.core.network.dto.EventEditorResourcesDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorMatchProjectionDto
import com.razumly.mvp.core.network.dto.MatchApiDto
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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
class ScheduleProposalDialogUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun given_completeProposal_when_dialogRenders_then_showsGraphAssignmentsAndActions() {
        var accepted = false

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = buildProposal(),
                    onAccept = { accepted = true },
                    onReject = {},
                )
            }
        }

        proposalSnapshotLabels().forEach { label ->
            composeRule.onNodeWithText(label, substring = true).assertIsDisplayed()
        }

        composeRule.onNodeWithText("Accept and create").performClick()

        assertTrue(accepted)
    }

    @Test
    fun givenProposal_when_rejectClicked_then_invokesRejectCallback() {
        var rejected = false

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = buildProposal(),
                    onAccept = {},
                    onReject = { rejected = true },
                )
            }
        }

        composeRule.onNodeWithText("Reject").assertIsDisplayed().performClick()

        assertTrue(rejected)
    }

    @Test
    fun givenPlayerOfficialAssignment_when_dialogRenders_then_acceptanceRemainsEnabled() {
        var accepted = false
        val completeProposal = buildProposal()
        val playerAssignment = MatchOfficialAssignment(
            positionId = "referee",
            slotIndex = 0,
            holderType = OfficialAssignmentHolderType.PLAYER,
            userId = "player-1",
        )
        val playerProposal = completeProposal.copy(
            graph = completeProposal.graph.copy(
                matches = completeProposal.graph.matches.map { match ->
                    match.copy(
                        officialId = null,
                        officialAssignments = listOf(playerAssignment),
                        officialIds = listOf(playerAssignment),
                        teamOfficialId = null,
                    )
                },
            ),
        )

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = playerProposal,
                    onAccept = { accepted = true },
                    onReject = {},
                )
            }
        }

        composeRule.onNodeWithText("Accept and create").assertIsEnabled().performClick()
        assertTrue(accepted)
    }

    @Test
    fun givenPartialProposal_when_dialogRenders_then_showsIncompleteData_and_partialAcceptInvokesCallback() {
        var accepted = false
        val confirmation = mutableStateOf(false)

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = buildPartialProposal(),
                    confirmPartial = confirmation.value,
                    onAccept = { if (confirmation.value) accepted = true else confirmation.value = true },
                    onReject = {},
                    onReturnToSetup = { confirmation.value = false },
                )
            }
        }

        composeRule.onNodeWithText("Incomplete schedule: 1 placed, 1 unscheduled").assertIsDisplayed()
        composeRule.onNodeWithText(
            "match-unplaced (match 2, phaseDivisionId playoff-phase, phase PLAYOFF, sourceDivisionId division-1)",
        ).assertIsDisplayed()
        composeRule.onNodeWithText(
            "playoff-phase: Playoffs (PLAYOFF, sourceDivisionId division-1)",
        ).assertIsDisplayed()
        composeRule.onNodeWithText("Review partial acceptance").assertIsEnabled().performClick()
        assertFalse(accepted)
        composeRule.onNodeWithText("Back to proposal").performClick()
        assertFalse(accepted)
        composeRule.onNodeWithText("Review partial acceptance").performClick()
        composeRule.onNodeWithText("Accept partial schedule").performClick()
        assertTrue(accepted)
    }
    @Test
    fun given_optional_staffing_gap_when_reviewed_then_acceptance_remains_enabled() {
        val proposal = buildProposal().let { complete ->
            complete.copy(graph = complete.graph.copy(matches = complete.graph.matches.map {
                it.copy(officialId = null, officialAssignments = emptyList(), officialIds = emptyList(), teamOfficialId = null)
            }))
        }
        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(proposal = proposal, onAccept = {}, onReject = {})
            }
        }
        composeRule.onNodeWithText("Accept and create").assertIsEnabled()
    }
    @Test
    fun givenMissingReferencedResourceName_when_dialogRenders_then_acceptanceIsBlocked() {
        val completeProposal = buildProposal()
        val proposalWithMissingName = completeProposal.copy(
            graph = completeProposal.graph.copy(
                event = completeProposal.graph.event.copy(
                    fields = completeProposal.graph.event.fields.map { field ->
                        field.copy(name = "")
                    },
                ),
            ),
        )

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = proposalWithMissingName,
                    onAccept = {},
                    onReject = {},
                )
            }
        }

        composeRule.onNodeWithText("Accept and create").assertIsNotEnabled()
    }
    @Test
    fun givenStaleProposal_when_dialogRenders_then_offersRefreshAndReject_withoutAccepting() {
        var accepted = false
        var refreshed = false
        var rejected = false

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = buildProposal(),
                    isStale = true,
                    onAccept = { accepted = true },
                    onRefresh = { refreshed = true },
                    onReject = { rejected = true },
                )
            }
        }

        composeRule.onNodeWithText(
            "This schedule proposal is stale and cannot be accepted. Refresh to review the current proposal; your event setup is still here.",
        ).assertIsDisplayed()
        composeRule.onNodeWithText("Refresh proposal").assertIsEnabled().performClick()
        composeRule.onNodeWithText("Reject").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Accept and create").assertDoesNotExist()
        assertTrue(refreshed)
        assertTrue(rejected)
        assertFalse(accepted)
    }
}
private fun proposalSnapshotLabels(): List<String> {
    val snapshot = requireNotNull(
        object {}.javaClass.getResourceAsStream(
            "/snapshots/ScheduleProposalDialogUiTest/complete-proposal.txt",
        ),
    ) {
        "The complete proposal dialog snapshot is missing."
    }
    return snapshot.bufferedReader().use { reader ->
        reader.readLines().map(String::trim).filter(String::isNotBlank).also {
            check(it.isNotEmpty()) { "The complete proposal dialog snapshot is empty." }
        }
    }
}
private fun buildProposal(): EventEditorCreateProposalDto {
    val start = "2026-08-24T21:00:00Z"
    val end = "2026-08-24T22:00:00Z"
    val draft = EventEditorDraftDto(
        basics = EventEditorBasicsDto(
            name = "Proposal League",
            description = "",
            eventType = "LEAGUE",
            start = start,
            timeZone = "America/New_York",
            location = "Court Center",
            address = "1 Main Street",
            affiliateUrl = "",
            state = "DRAFT",
        ),
        participation = EventEditorParticipationDto(
            teamSignup = true,
            singleDivision = true,
            registrationByDivisionType = false,
            registrationCutoffHours = 0,
            allowTeamSplitDefault = false,
        ),
        registration = EventEditorRegistrationDto(
            payment = EventEditorPaymentDto(
                mode = "MANUAL",
                priceCents = 0,
                taxHandling = "NONE",
                organizerManualTaxRateBps = 0,
                allowPaymentPlans = false,
            ),
        ),
        competition = EventEditorCompetitionDto(
            doubleElimination = false,
            includePlayoffs = false,
            splitLeaguePlayoffDivisions = false,
            usesSets = false,
        ),
        schedule = EventEditorScheduleDto(
            mode = "FIXED_END",
            endConstraint = end,
        ),
        resources = EventEditorResourcesDto(),
        staff = EventEditorStaffDto(
            teamCheckInMode = "NONE",
            teamCheckInOpenMinutesBefore = 0,
            allowMatchRosterEdits = false,
            allowTemporaryMatchPlayers = false,
            autoCreatePointMatchIncidents = false,
        ),
    )
    val match = MatchApiDto(
        id = "match-1",
        matchId = 1,
        eventId = "event-1",
        start = start,
        end = end,
        placementState = "PLACED",
        phase = "Main phase",
        division = "division-1",
        fieldId = "field-1",
        team1Id = "team-1",
        team2Id = "team-2",
        teamOfficialId = "team-1",
        officialAssignments = listOf(
            MatchOfficialAssignment(
                positionId = "referee",
                slotIndex = 0,
                holderType = OfficialAssignmentHolderType.OFFICIAL,
                userId = "official-1",
            ),
        ),
    )
    val graphEvent = com.razumly.mvp.core.network.dto.EventApiDto(
        id = "event-1",
        name = "Proposal League",
        hostId = "host-1",
        start = start,
        end = end,
        timeZone = "America/New_York",
        eventType = "LEAGUE",
        divisions = listOf("division-1"),
        fieldIds = listOf("field-1"),
        officialIds = listOf("official-1"),
        fields = listOf(
            com.razumly.mvp.core.data.dataTypes.Field(
                id = "field-1",
                fieldNumber = 1,
                name = "Resource 1",
            ),
        ),
        teams = listOf(
            com.razumly.mvp.core.network.dto.TeamApiDto(
                id = "team-1",
                name = "Alpha",
                players = listOf(
                    com.razumly.mvp.core.network.dto.EventEditorProposalGraphUserDto(
                        id = "player-1",
                        firstName = "Alex",
                        lastName = "Player",
                    ),
                ),
            ),
            com.razumly.mvp.core.network.dto.TeamApiDto(id = "team-2", name = "Beta"),
        ),
        officials = listOf(
            com.razumly.mvp.core.network.dto.EventEditorProposalGraphUserDto(
                id = "official-1",
                firstName = "Jane",
                lastName = "Official",
            ),
        ),
        officialPositions = listOf(
            com.razumly.mvp.core.data.dataTypes.EventOfficialPosition(
                id = "referee",
                name = "Referee",
            ),
        ),
    )
    val snapshot = EventEditorSnapshotDto(
        contractVersion = 3,
        draft = draft,
        mode = "CREATE",
        editorRevision = "editor-revision",
        capabilities = com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto(
            canUseOnlinePayments = false,
            canManageStaff = true,
            canEdit = true,
            supportsTeamStaffing = true,
        ),
        catalogs = EventEditorCatalogsDto(
            fields = listOf(
                buildJsonObject {
                    put("id", "field-1")
                    put("name", "Resource 1")
                },
            ),
        ),
        immutable = EventEditorImmutableDto(),
        scheduleState = com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto(
            sourceType = "CREATE",
            matchCount = 0,
            revision = "schedule-revision",
            hasProtectedHistory = false,
        ),
    )
    return EventEditorCreateProposalDto(
        status = "PROPOSED",
        createOperationId = "operation-1",
        eventId = "event-1",
        proposalRevision = "proposal-revision",
        expectedRevisions = EventEditorExpectedCreateRevisionsDto(
            editorRevision = "editor-revision",
            staffRevision = null,
            scheduleRevision = "schedule-revision",
        ),
        completion = EventEditorCreateCompletionDto(EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE),
        snapshot = snapshot,
        revisionBinding = EventEditorRevisionBindingDto(
            editorRevision = "editor-revision",
            scheduleRevision = "schedule-revision",
            availabilityRevision = "availability-revision",
        ),
        scheduleOutcome = EventEditorScheduleOutcomeDto(
            status = EventEditorScheduleOutcomeStatus.BUILT,
            matchCount = 1,
            matches = listOf(
                EventEditorMatchProjectionDto(
                    id = "match-1",
                    eventId = "event-1",
                ),
            ),
        ),
        graph = EventEditorCreateProposalGraphDto(
            event = graphEvent,
            matches = listOf(match),
        ),
    )
}
private fun buildPartialProposal(): EventEditorCreateProposalDto {
    val complete = buildProposal()
    val placed = EventEditorMatchProjectionDto(
        id = "match-1",
        matchId = 1,
        eventId = "event-1",
        start = "2026-08-24T21:00:00Z",
        end = "2026-08-24T22:00:00Z",
        placementState = "PLACED",
        phase = "POOL",
        phaseDivisionId = "pool-phase",
        sourceDivisionId = "division-1",
        fieldId = "field-1",
        team1Id = "team-1",
        team2Id = "team-2",
        officialId = "official-1",
    )
    val unplaced = EventEditorMatchProjectionDto(
        id = "match-unplaced",
        matchId = 2,
        eventId = "event-1",
        placementState = "UNPLACED",
        phase = "PLAYOFF",
        phaseDivisionId = "playoff-phase",
        sourceDivisionId = "division-1",
        team1Id = "team-1",
        team2Id = "team-2",
    )
    val unplacedGraphMatch = complete.graph.matches.single().copy(
        id = "match-unplaced",
        matchId = 2,
        start = null,
        end = null,
        placementState = "UNPLACED",
        phase = "PLAYOFF",
        phaseDivisionId = "playoff-phase",
        fieldId = null,
        officialId = null,
        officialAssignments = null,
        officialIds = null,
        teamOfficialId = null,
    )
    return complete.copy(
        scheduleOutcome = EventEditorScheduleOutcomeDto(
            status = EventEditorScheduleOutcomeStatus.PARTIAL,
            matchCount = 2,
            matches = listOf(placed, unplaced),
            unscheduledMatches = listOf(
                EventEditorUnscheduledMatchDto(
                    id = unplaced.id,
                    matchId = unplaced.matchId,
                    phaseDivisionId = unplaced.phaseDivisionId!!,
                    phase = unplaced.phase!!,
                    sourceDivisionId = unplaced.sourceDivisionId,
                ),
            ),
            affectedCompetitionPhases = listOf(
                EventEditorAffectedCompetitionPhaseDto(
                    id = "playoff-phase",
                    name = "Playoffs",
                    phase = "PLAYOFF",
                    sourceDivisionId = "division-1",
                ),
            ),
            placedMatchCount = 1,
            unplacedMatchCount = 1,
        ),
        graph = complete.graph.copy(
            matches = listOf(complete.graph.matches.single(), unplacedGraphMatch),
        ),
    )
}
