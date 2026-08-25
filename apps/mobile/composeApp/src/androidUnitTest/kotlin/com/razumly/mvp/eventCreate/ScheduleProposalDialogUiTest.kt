package com.razumly.mvp.eventCreate

import android.app.Application
import androidx.compose.material3.MaterialTheme
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
        var rejected = false

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = buildProposal(),
                    onAccept = { accepted = true },
                    onReject = { rejected = true },
                )
            }
        }

        proposalSnapshotLabels().forEach { label ->
            composeRule.onNodeWithText(label, substring = true).assertIsDisplayed()
        }

        composeRule.onNodeWithText("Accept and create").performClick()
        composeRule.onNodeWithText("Reject").performClick()

        assertTrue(accepted)
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
    fun givenPartialProposal_when_dialogRenders_then_acceptanceIsBlocked() {
        var accepted = false
        val completeProposal = buildProposal()
        val incompleteProposal = completeProposal.copy(
            graph = completeProposal.graph.copy(
                matches = completeProposal.graph.matches.map { match ->
                    match.copy(
                        fieldId = null,
                        officialAssignments = match.officialAssignments?.map { assignment ->
                            assignment.copy(userId = null, eventOfficialId = null)
                        },
                    )
                },
            ),
        )

        composeRule.setContent {
            MaterialTheme {
                ScheduleProposalDialog(
                    proposal = incompleteProposal,
                    onAccept = { accepted = true },
                    onReject = {},
                )
            }
        }

        composeRule.onNodeWithText("Cannot accept:", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("Accept and create").assertIsNotEnabled()

        assertFalse(accepted)
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
