@file:OptIn(kotlin.time.ExperimentalTime::class, kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package com.razumly.mvp.matchDetail

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.MatchSegmentMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.network.dto.MatchIncidentOperationDto
import com.razumly.mvp.core.network.dto.MatchLifecycleOperationDto
import com.razumly.mvp.core.network.dto.MatchOfficialCheckInOperationDto
import com.razumly.mvp.core.network.dto.MatchSegmentOperationDto
import com.razumly.mvp.eventCreate.CreateEvent_FakeEventRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeMatchRepository
import com.razumly.mvp.eventCreate.CreateEvent_FakeUserRepository
import com.razumly.mvp.eventCreate.MainDispatcherTest
import com.razumly.mvp.eventDetail.data.IMatchRepository
import com.razumly.mvp.eventDetail.data.StagedMatchCreate
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Instant

class MatchContentComponentTest : MainDispatcherTest() {
    @Test
    fun given_set_scoring_when_displaying_main_score_then_current_segment_score_is_returned() {
        val segments = listOf(
            createSegment(sequence = 1, team1Score = 21, team2Score = 18),
            createSegment(sequence = 2, team1Score = 7, team2Score = 11),
        )

        val team1Score = matchDisplayScore(
            scoringModel = "SETS",
            segments = segments,
            teamId = "team-a",
            legacyScores = listOf(21, 7),
            currentSegmentIndex = 1,
        )

        assertEquals(7, team1Score)
    }

    @Test
    fun given_period_scoring_when_displaying_main_score_then_full_match_score_is_returned() {
        val segments = listOf(
            createSegment(sequence = 1, team1Score = 14, team2Score = 10),
            createSegment(sequence = 2, team1Score = 7, team2Score = 3),
        )

        val team1Score = matchDisplayScore(
            scoringModel = "PERIODS",
            segments = segments,
            teamId = "team-a",
            legacyScores = listOf(14, 7),
            currentSegmentIndex = 1,
        )
        val team2Score = matchDisplayScore(
            scoringModel = "PERIODS",
            segments = segments,
            teamId = "team-b",
            legacyScores = listOf(10, 3),
            currentSegmentIndex = 1,
        )

        assertEquals(21, team1Score)
        assertEquals(13, team2Score)
    }

    @Test
    fun given_single_segment_points_only_match_when_evaluating_segment_breakdown_then_it_is_hidden() {
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "POINTS_ONLY",
            segmentCount = 1,
            segmentLabel = "Total",
        )

        val showSegmentBreakdown = shouldShowMatchSegmentBreakdown(
            rules = rules,
            segments = listOf(createSegment(sequence = 1, team1Score = 1, team2Score = 0)),
            team1Scores = listOf(1),
            team2Scores = listOf(0),
        )
        val activeSegmentLabel = activeMatchSegmentLabel(
            segmentBaseLabel = rules.segmentLabel,
            currentSegmentIndex = 0,
            showSegmentBreakdown = showSegmentBreakdown,
        )

        assertFalse(showSegmentBreakdown)
        assertEquals(null, activeSegmentLabel)
    }

    @Test
    fun given_multi_segment_period_match_when_evaluating_segment_breakdown_then_current_segment_is_labeled() {
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "PERIODS",
            segmentCount = 4,
            segmentLabel = "Quarter",
        )

        val showSegmentBreakdown = shouldShowMatchSegmentBreakdown(
            rules = rules,
            segments = listOf(
                createSegment(sequence = 1, team1Score = 7, team2Score = 3),
                createSegment(sequence = 2, team1Score = 0, team2Score = 0),
            ),
            team1Scores = listOf(7, 0),
            team2Scores = listOf(3, 0),
        )
        val activeSegmentLabel = activeMatchSegmentLabel(
            segmentBaseLabel = rules.segmentLabel,
            currentSegmentIndex = 1,
            showSegmentBreakdown = showSegmentBreakdown,
        )

        assertTrue(showSegmentBreakdown)
        assertEquals("Quarter 2", activeSegmentLabel)
    }

    @Test
    fun given_set_scoring_when_building_segment_tracker_then_each_segment_pair_is_returned() {
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "SETS",
            segmentCount = 3,
            segmentLabel = "Set",
        )

        val trackerEntries = buildMatchSegmentTrackerEntries(
            rules = rules,
            segmentBaseLabel = rules.segmentLabel,
            segments = listOf(
                createSegment(sequence = 1, team1Score = 21, team2Score = 18).copy(
                    status = "COMPLETE",
                    winnerEventTeamId = "team-a",
                ),
                createSegment(sequence = 2, team1Score = 9, team2Score = 11),
            ),
            team1Id = "team-a",
            team2Id = "team-b",
            team1Scores = listOf(21, 9, 0),
            team2Scores = listOf(18, 11, 0),
            currentSegmentIndex = 1,
        )

        assertEquals(3, trackerEntries.size)
        assertEquals("Set 1", trackerEntries[0].label)
        assertEquals(21, trackerEntries[0].team1Score)
        assertEquals(18, trackerEntries[0].team2Score)
        assertTrue(trackerEntries[0].isComplete)
        assertFalse(trackerEntries[0].isActive)
        assertTrue(trackerEntries[1].isActive)
        assertEquals(0, trackerEntries[2].team1Score)
        assertEquals(0, trackerEntries[2].team2Score)
    }

    @Test
    fun given_non_set_scoring_when_building_segment_tracker_then_it_is_hidden() {
        val trackerEntries = buildMatchSegmentTrackerEntries(
            rules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 4,
                segmentLabel = "Quarter",
            ),
            segmentBaseLabel = "Quarter",
            segments = listOf(createSegment(sequence = 1, team1Score = 7, team2Score = 3)),
            team1Id = "team-a",
            team2Id = "team-b",
            team1Scores = listOf(7, 0, 0, 0),
            team2Scores = listOf(3, 0, 0, 0),
            currentSegmentIndex = 0,
        )

        assertTrue(trackerEntries.isEmpty())
    }

    @Test
    fun given_event_rules_require_participant_when_evaluating_scoring_incidents_then_incident_entry_is_required() {
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "PERIODS",
            segmentCount = 2,
            segmentLabel = "Half",
            autoCreatePointIncidentType = "GOAL",
            pointIncidentRequiresParticipant = true,
        )

        assertTrue(
            shouldRequireScoringIncident(
                rules = rules,
                event = createEvent(teamIds = listOf("team-a", "team-b")).copy(
                    autoCreatePointMatchIncidents = false,
                ),
            )
        )
    }

    @Test
    fun given_auto_point_incidents_without_player_requirement_when_evaluating_scoring_then_direct_score_controls_remain() {
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "POINTS_ONLY",
            segmentCount = 1,
            segmentLabel = "Total",
            autoCreatePointIncidentType = "GOAL",
            pointIncidentRequiresParticipant = false,
        )

        assertFalse(
            shouldRequireScoringIncident(
                rules = rules,
                event = createEvent(teamIds = listOf("team-a", "team-b")).copy(
                    autoCreatePointMatchIncidents = true,
                ),
            )
        )
        assertEquals(listOf("DISCIPLINE"), incidentDialogTypes(rules, teamScoped = true))
    }

    @Test
    fun given_scoring_requires_player_when_building_incident_options_then_goal_is_default() {
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "PERIODS",
            segmentCount = 2,
            segmentLabel = "Half",
            supportedIncidentTypes = listOf("GOAL", "DISCIPLINE", "NOTE"),
            autoCreatePointIncidentType = "GOAL",
            pointIncidentRequiresParticipant = true,
        )
        val options = incidentDialogTypes(rules, teamScoped = true)

        assertEquals(listOf("GOAL", "DISCIPLINE"), options)
        assertEquals("GOAL", defaultIncidentDialogType(rules, options))
        assertEquals(listOf("NOTE"), incidentDialogTypes(rules, teamScoped = false))
    }

    @Test
    fun given_goal_incident_when_building_summary_then_only_team_player_and_minute_are_shown() {
        val player = createUser(id = "player-a", firstName = "Alex", lastName = "Striker")
        val team = createTeam(
            id = "team-a",
            captainId = "captain-a",
            playerIds = listOf("player-a"),
        ).copy(
            name = "Red Wolves",
            playerRegistrations = listOf(
                com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration(
                    id = "reg-a",
                    teamId = "team-a",
                    userId = "player-a",
                    status = "ACTIVE",
                    jerseyNumber = "9",
                )
            )
        ).toTeamWithRelations(mapOf("player-a" to player))
        val incident = MatchIncidentMVP(
            id = "incident-1",
            eventId = "event-1",
            matchId = "match-1",
            segmentId = "segment-1",
            eventTeamId = "team-a",
            eventRegistrationId = "reg-a",
            participantUserId = "player-a",
            incidentType = "GOAL",
            sequence = 1,
            linkedPointDelta = 1,
            minute = 12,
            note = "Header",
        )

        assertEquals(
            "Red Wolves | Alex Striker #9 | 12'",
            buildIncidentSummary(incident, team1 = team, team2 = null),
        )
    }

    @Test
    fun given_raw_status_value_when_formatting_match_details_then_title_case_is_returned() {
        assertEquals("Scheduled", titleCaseMatchValue("SCHEDULED"))
        assertEquals("In Progress", titleCaseMatchValue("IN_PROGRESS"))
        assertEquals("Not Started", titleCaseMatchValue("not-started"))
    }

    @Test
    fun given_official_assignment_when_building_detail_rows_then_name_and_position_are_used() {
        val match = createMatch(
            eventId = "event-1",
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = false,
        ).copy(
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "position-referee",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "official-123",
                    eventOfficialId = "event-official-123",
                    checkedIn = true,
                )
            )
        )

        val rows = buildMatchOfficialDetailRows(
            match = match,
            positions = listOf(EventOfficialPosition(id = "position-referee", name = "Referee")),
            usersById = mapOf(
                "official-123" to createUser(
                    id = "official-123",
                    firstName = "Jamie",
                    lastName = "Rivera",
                    userName = "jamie",
                )
            ),
        )

        val row = rows.single()
        assertEquals("Referee", row.positionLabel)
        assertEquals("Jamie Rivera", row.officialName)
        assertTrue(row.checkedIn)
    }

    @Test
    fun given_missing_official_user_when_building_detail_rows_then_raw_id_is_not_displayed() {
        val match = createMatch(
            eventId = "event-1",
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = false,
        ).copy(
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "position-referee",
                    slotIndex = 1,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "official-123",
                    eventOfficialId = "event-official-123",
                    checkedIn = false,
                )
            )
        )

        val rows = buildMatchOfficialDetailRows(
            match = match,
            positions = listOf(EventOfficialPosition(id = "position-referee", name = "Referee", count = 2)),
            usersById = emptyMap(),
        )

        val row = rows.single()
        assertEquals("Referee 2", row.positionLabel)
        assertEquals("Unknown official", row.officialName)
        assertFalse(row.officialName.contains("official-123"))
        assertFalse(row.checkedIn)
    }

    @Test
    fun given_assigned_official_team_when_match_not_checked_in_then_check_in_prompt_is_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = false,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertTrue(harness.component.isOfficial.value)
        assertFalse(harness.component.officialCheckedIn.value)
        assertTrue(harness.component.showOfficialCheckInDialog.value)
    }

    @Test
    fun given_match_missing_one_team_when_user_is_assigned_official_then_check_in_prompt_is_hidden() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = false,
        ).copy(team2Id = null)
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertTrue(harness.component.isOfficial.value)
        assertFalse(harness.component.officialCheckedIn.value)
        assertFalse(harness.component.showOfficialCheckInDialog.value)

        harness.component.confirmOfficialCheckIn()
        advance()

        assertTrue(harness.matchRepository.updatedMatches.isEmpty())
        assertFalse(harness.component.officialCheckedIn.value)
    }

    @Test
    fun given_slow_official_check_in_when_confirming_then_saving_state_is_exposed() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = false,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            updateDelayMillis = 1_000,
        )

        advance()

        harness.component.confirmOfficialCheckIn()
        testDispatcher.scheduler.runCurrent()

        assertTrue(harness.component.officialCheckInSaving.value)
        assertTrue(harness.component.showOfficialCheckInDialog.value)

        testDispatcher.scheduler.advanceTimeBy(1_000)
        advance()

        assertFalse(harness.component.officialCheckInSaving.value)
        assertTrue(harness.component.officialCheckedIn.value)
        assertFalse(harness.component.showOfficialCheckInDialog.value)
    }

    @Test
    fun given_event_team_member_swap_when_confirming_then_match_updates_then_check_in_prompt_is_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-a",
            officialCheckedIn = false,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertFalse(harness.component.isOfficial.value)
        assertFalse(harness.component.officialCheckedIn.value)
        assertTrue(harness.component.showOfficialCheckInDialog.value)

        harness.component.confirmOfficialCheckIn()
        advance()

        assertEquals(1, harness.matchRepository.updatedMatches.size)
        assertEquals("team-c", harness.matchRepository.updatedMatches[0].teamOfficialId)
        assertEquals(false, harness.matchRepository.updatedMatches[0].officialCheckedIn)
        assertTrue(harness.component.isOfficial.value)
        assertFalse(harness.component.officialCheckedIn.value)
        assertTrue(harness.component.showOfficialCheckInDialog.value)

        harness.component.confirmOfficialCheckIn()
        advance()

        assertEquals(2, harness.matchRepository.updatedMatches.size)
        assertEquals(true, harness.matchRepository.updatedMatches[1].officialCheckedIn)
        assertTrue(harness.component.isOfficial.value)
        assertTrue(harness.component.officialCheckedIn.value)
        assertFalse(harness.component.showOfficialCheckInDialog.value)
    }

    @Test
    fun given_official_already_checked_in_when_user_can_swap_then_swap_prompt_is_not_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-a",
            officialCheckedIn = true,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertFalse(harness.component.isOfficial.value)
        assertTrue(harness.component.officialCheckedIn.value)
        assertFalse(harness.component.showOfficialCheckInDialog.value)
    }

    @Test
    fun given_stale_cached_teams_when_user_profile_has_event_team_then_swap_prompt_is_still_shown() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-a",
            officialCheckedIn = false,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
                createTeam(id = "team-stale", captainId = user.id, playerIds = listOf(user.id)),
            ),
            currentUserTeamIdsInRepository = listOf("team-stale"),
        )

        advance()

        assertFalse(harness.component.isOfficial.value)
        assertFalse(harness.component.officialCheckedIn.value)
        assertTrue(harness.component.showOfficialCheckInDialog.value)
    }

    @Test
    fun given_period_rules_when_loading_match_then_segments_are_normalized_to_rule_count() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(usesSets = false)
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 4,
                segmentLabel = "Quarter",
            ),
            team1Points = listOf(0),
            team2Points = listOf(0),
            setResults = listOf(0),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertEquals(4, harness.component.matchWithTeams.value.match.segments.size)
    }

    @Test
    fun given_event_resolved_rules_when_match_snapshot_is_missing_then_match_detail_uses_event_rules() = runTest(testDispatcher) {
        val user = createUser(id = "official-1")
        val event = createEvent(teamIds = listOf("team-a", "team-b")).copy(
            usesSets = false,
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 2,
                segmentLabel = "Half",
                autoCreatePointIncidentType = "GOAL",
                pointIncidentRequiresParticipant = true,
            ),
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-a",
            officialCheckedIn = true,
        ).copy(
            matchRulesSnapshot = null,
            resolvedMatchRules = null,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
            ),
        )

        advance()

        assertEquals("PERIODS", harness.component.matchRules.value.scoringModel)
        assertEquals("Half", harness.component.matchRules.value.segmentLabel)
        assertTrue(harness.component.matchRules.value.pointIncidentRequiresParticipant)
        assertEquals("GOAL", harness.component.matchRules.value.autoCreatePointIncidentType)
    }

    @Test
    fun given_stale_selected_match_when_repository_has_checked_in_official_then_component_recovers_official_state() = runTest(testDispatcher) {
        val user = createUser(id = "official-1")
        val event = createEvent(teamIds = listOf("team-a", "team-b")).copy(
            officialPositions = listOf(EventOfficialPosition(id = "position-official", name = "Official")),
        )
        val selectedMatch = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-a",
            officialCheckedIn = false,
        )
        val refreshedMatch = selectedMatch.copy(
            officialId = user.id,
            officialCheckedIn = true,
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "position-official",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = user.id,
                    eventOfficialId = "event-official-1",
                    checkedIn = true,
                )
            ),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = selectedMatch,
            repositoryMatch = refreshedMatch,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
            ),
        )

        advance()

        assertTrue(harness.component.isOfficial.value)
        assertTrue(harness.component.officialCheckedIn.value)
    }

    @Test
    fun given_direct_score_update_when_backend_fails_then_local_room_score_is_kept() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = createMatch(
                eventId = event.id,
                team1Id = "team-a",
                team2Id = "team-b",
                teamOfficialId = "team-c",
                officialCheckedIn = true,
            ),
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            updateFailure = IllegalStateException("offline"),
        )

        advance()

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()

        assertEquals(1, harness.matchRepository.savedMatches.last().team1Points.first())
        assertTrue(harness.matchRepository.scoreSetCalls.isEmpty())
        assertEquals(listOf(1), harness.component.matchWithTeams.value.match.team1Points)

        testDispatcher.scheduler.advanceTimeBy(500)
        advance()

        assertEquals(1, harness.matchRepository.savedMatches.last().team1Points.first())
        assertEquals(1, harness.matchRepository.scoreSetCalls.single().match.team1Points.first())
        assertEquals(1, harness.matchRepository.scoreSetCalls.single().points)
        assertTrue(harness.matchRepository.updatedMatches.isEmpty())
        assertEquals(listOf(1), harness.component.matchWithTeams.value.match.team1Points)
        assertEquals(1, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])
    }

    @Test
    fun given_rapid_direct_score_updates_when_debounce_window_active_then_latest_absolute_score_is_sent_once() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = createMatch(
                eventId = event.id,
                team1Id = "team-a",
                team2Id = "team-b",
                teamOfficialId = "team-c",
                officialCheckedIn = true,
            ),
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()
        testDispatcher.scheduler.advanceTimeBy(200)
        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()

        assertEquals(2, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])
        assertEquals(2, harness.matchRepository.savedMatches.last().team1Points.first())
        assertTrue(harness.matchRepository.scoreSetCalls.isEmpty())

        testDispatcher.scheduler.advanceTimeBy(499)
        testDispatcher.scheduler.runCurrent()
        assertTrue(harness.matchRepository.scoreSetCalls.isEmpty())

        testDispatcher.scheduler.advanceTimeBy(1)
        advance()

        assertEquals(1, harness.matchRepository.scoreSetCalls.size)
        val scoreCall = harness.matchRepository.scoreSetCalls.single()
        assertEquals(2, scoreCall.points)
        assertEquals(2, scoreCall.match.team1Points.first())
        assertEquals(2, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])
    }

    @Test
    fun given_direct_score_update_before_local_save_completes_when_confirming_segment_then_debounced_score_post_is_not_sent() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 2,
                segmentLabel = "Half",
            ),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.updateScore(isTeam1 = true, increment = true)
        harness.component.requestSetConfirmation()
        harness.component.confirmSet()
        advance()

        assertTrue(harness.matchRepository.scoreSetCalls.isEmpty())
        val confirmationSync = harness.matchRepository.updatedMatches.single()
        assertEquals(listOf(1, 0), confirmationSync.team1Points)
        assertEquals("COMPLETE", confirmationSync.segments.first().status)
        assertEquals(1, confirmationSync.segments.first().scores["team-a"])
    }

    @Test
    fun given_set_hits_point_cap_when_scoring_then_component_blocks_further_increments_without_popup() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 1,
            pointsToVictory = listOf(21),
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            team1Points = listOf(20),
            team2Points = listOf(2),
            setResults = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 20, team2Score = 2)),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()

        assertEquals(21, harness.component.matchWithTeams.value.match.team1Points.first())
        assertFalse(harness.component.showSetConfirmDialog.value)

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()

        assertEquals(21, harness.component.matchWithTeams.value.match.team1Points.first())
        assertEquals(1, harness.matchRepository.savedMatches.size)
    }

    @Test
    fun given_set_reaches_point_cap_when_evaluating_controls_then_confirmation_enables_and_increment_disables() {
        val event = createEvent(teamIds = listOf("team-a", "team-b")).copy(
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 1,
            pointsToVictory = listOf(21),
        )
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "SETS",
            segmentCount = 1,
            segmentLabel = "Set",
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-a",
            officialCheckedIn = true,
        ).copy(
            team1Points = listOf(21),
            team2Points = listOf(2),
            setResults = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 21, team2Score = 2)),
        )

        assertFalse(canIncrementCurrentSegment(match, rules, event, setIndex = 0))
        assertTrue(canConfirmCurrentSegment(match, rules, event, setIndex = 0))
    }

    @Test
    fun given_set_is_below_point_cap_when_evaluating_controls_then_confirmation_stays_disabled() {
        val event = createEvent(teamIds = listOf("team-a", "team-b")).copy(
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 1,
            pointsToVictory = listOf(21),
        )
        val rules = ResolvedMatchRulesMVP(
            scoringModel = "SETS",
            segmentCount = 1,
            segmentLabel = "Set",
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-a",
            officialCheckedIn = true,
        ).copy(
            team1Points = listOf(20),
            team2Points = listOf(2),
            setResults = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 20, team2Score = 2)),
        )

        assertTrue(canIncrementCurrentSegment(match, rules, event, setIndex = 0))
        assertFalse(canConfirmCurrentSegment(match, rules, event, setIndex = 0))
    }

    @Test
    fun given_final_set_is_confirmed_when_confirming_again_then_no_second_sync_occurs() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 1,
            pointsToVictory = listOf(21),
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            team1Points = listOf(21),
            team2Points = listOf(18),
            setResults = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 21, team2Score = 18)),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.confirmSet()
        advance()

        assertTrue(harness.component.matchFinished.value)
        assertEquals("COMPLETE", harness.component.matchWithTeams.value.match.segments.first().status)
        assertEquals(1, harness.matchRepository.operationCalls.size)

        harness.component.confirmSet()
        advance()

        assertEquals(1, harness.matchRepository.operationCalls.size)
    }

    @Test
    fun given_non_final_set_is_confirmed_when_sync_succeeds_then_current_set_advances_immediately() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 3,
            pointsToVictory = listOf(21, 21, 21),
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            team1Points = listOf(21, 0, 0),
            team2Points = listOf(18, 0, 0),
            setResults = listOf(0, 0, 0),
            segments = listOf(
                createSegment(sequence = 1, team1Score = 21, team2Score = 18),
                createSegment(sequence = 2, team1Score = 0, team2Score = 0),
                createSegment(sequence = 3, team1Score = 0, team2Score = 0),
            ),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.confirmSet()
        advance()

        assertFalse(harness.component.matchFinished.value)
        assertEquals(1, harness.component.currentSet.value)
        assertEquals("COMPLETE", harness.component.matchWithTeams.value.match.segments.first().status)
        assertEquals("NOT_STARTED", harness.component.matchWithTeams.value.match.segments[1].status)
    }

    @Test
    fun given_playoff_match_with_stale_single_segment_rules_when_loading_detail_then_event_best_of_count_wins() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            eventType = EventType.LEAGUE,
            usesSets = true,
            setsPerMatch = 1,
            winnerSetCount = 3,
            loserSetCount = 1,
            winnerBracketPointsToVictory = listOf(21, 21, 21),
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "SETS",
                segmentCount = 1,
                segmentLabel = "Set",
            ),
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "SETS",
                segmentCount = 1,
                segmentLabel = "Set",
            ),
            team1Points = listOf(21),
            team2Points = listOf(18),
            setResults = listOf(1),
            winnerNextMatchId = "match-2",
            segments = listOf(
                createSegment(sequence = 1, team1Score = 21, team2Score = 18).copy(
                    status = "COMPLETE",
                    winnerEventTeamId = "team-a",
                )
            ),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        assertFalse(harness.component.matchFinished.value)
        assertEquals(1, harness.component.currentSet.value)
        assertEquals(3, harness.component.matchWithTeams.value.match.segments.size)
        assertEquals(listOf(21, 0, 0), harness.component.matchWithTeams.value.match.team1Points)
        assertEquals(listOf(18, 0, 0), harness.component.matchWithTeams.value.match.team2Points)
    }

    @Test
    fun given_stale_repository_emit_before_debounced_sync_finishes_when_scoring_then_visible_score_does_not_roll_back() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val initialMatch = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = initialMatch,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()
        harness.matchRepository.emitRemoteMatch(initialMatch)
        testDispatcher.scheduler.runCurrent()

        assertEquals(1, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])
        assertEquals(listOf(1), harness.component.matchWithTeams.value.match.team1Points)

        testDispatcher.scheduler.advanceTimeBy(500)
        advance()

        assertEquals(1, harness.matchRepository.scoreSetCalls.single().points)
        assertEquals(1, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])
    }

    @Test
    fun given_delayed_older_direct_score_response_when_newer_edit_exists_then_visible_score_stays_on_newer_value() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = createMatch(
                eventId = event.id,
                team1Id = "team-a",
                team2Id = "team-b",
                teamOfficialId = "team-c",
                officialCheckedIn = true,
            ),
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            scoreSetDelaySequence = listOf(700, 700),
        )

        advance()

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()
        testDispatcher.scheduler.advanceTimeBy(500)
        testDispatcher.scheduler.runCurrent()

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()
        assertEquals(2, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])

        testDispatcher.scheduler.advanceTimeBy(500)
        testDispatcher.scheduler.runCurrent()
        testDispatcher.scheduler.advanceTimeBy(150)
        testDispatcher.scheduler.runCurrent()

        assertEquals(2, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])
        assertEquals(listOf(1, 2), harness.matchRepository.scoreSetCalls.map { call -> call.points })

        testDispatcher.scheduler.advanceTimeBy(550)
        advance()

        assertEquals(2, harness.component.matchWithTeams.value.match.segments.first().scores["team-a"])
        assertEquals(listOf(2), harness.component.matchWithTeams.value.match.team1Points)
    }

    @Test
    fun given_failed_direct_score_update_when_confirming_segment_then_current_local_score_is_synced() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 2,
                segmentLabel = "Half",
            ),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            updateFailure = IllegalStateException("offline"),
        )

        advance()

        harness.component.updateScore(isTeam1 = true, increment = true)
        testDispatcher.scheduler.runCurrent()
        testDispatcher.scheduler.advanceTimeBy(500)
        advance()
        harness.matchRepository.updateFailure = null

        harness.component.requestSetConfirmation()
        harness.component.confirmSet()
        advance()

        val confirmationSync = harness.matchRepository.updatedMatches.last()
        assertEquals(1, harness.matchRepository.scoreSetCalls.size)
        assertEquals(1, harness.matchRepository.updatedMatches.size)
        assertEquals(listOf(1, 0), confirmationSync.team1Points)
        assertEquals("COMPLETE", confirmationSync.segments.first().status)
        assertEquals(1, confirmationSync.segments.first().scores["team-a"])
    }

    @Test
    fun given_segment_confirmation_patch_failure_then_local_segment_status_is_not_completed() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 2,
                segmentLabel = "Half",
            ),
            team1Points = listOf(2, 0),
            team2Points = listOf(1, 0),
            setResults = listOf(0, 0),
            segments = listOf(
                createSegment(sequence = 1, team1Score = 2, team2Score = 1),
                createSegment(sequence = 2, team1Score = 0, team2Score = 0),
            ),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            updateFailure = IllegalStateException("offline"),
        )

        advance()

        harness.component.requestSetConfirmation()
        harness.component.confirmSet()
        advance()

        assertEquals("COMPLETE", harness.matchRepository.updatedMatches.single().segments.first().status)
        assertTrue(harness.matchRepository.savedMatches.isEmpty())
        assertEquals("IN_PROGRESS", harness.component.matchWithTeams.value.match.segments.first().status)
        assertEquals(0, harness.component.currentSet.value)
        assertTrue(harness.component.errorState.value?.startsWith("Failed to sync match:") == true)
    }

    @Test
    fun given_segment_confirmation_operation_failure_then_local_segment_status_is_not_completed() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c"))
        val pendingIncident = MatchIncidentMVP(
            id = "client:match-incident:match-1:segment-1:1",
            eventId = event.id,
            matchId = "match-1",
            segmentId = "segment-1",
            eventTeamId = "team-a",
            participantUserId = "player-a",
            officialUserId = user.id,
            incidentType = "GOAL",
            sequence = 1,
            linkedPointDelta = 1,
            minute = 5,
            uploadStatus = "FAILED",
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "PERIODS",
                segmentCount = 2,
                segmentLabel = "Half",
                autoCreatePointIncidentType = "GOAL",
            ),
            team1Points = listOf(2, 0),
            team2Points = listOf(1, 0),
            setResults = listOf(0, 0),
            segments = listOf(
                createSegment(sequence = 1, team1Score = 2, team2Score = 1),
                createSegment(sequence = 2, team1Score = 0, team2Score = 0),
            ),
            incidents = listOf(pendingIncident),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            operationFailure = IllegalStateException("offline"),
        )

        advance()

        harness.component.requestSetConfirmation()
        harness.component.confirmSet()
        advance()

        val incidentCall = harness.matchRepository.incidentCalls.first()
        assertEquals("client:match-incident:match-1:segment-1:1", incidentCall.operation.id)
        assertTrue(harness.matchRepository.incidentCalls.size > 1)
        assertTrue(harness.matchRepository.operationCalls.isEmpty())
        assertTrue(harness.matchRepository.savedMatches.isNotEmpty())
        assertEquals("IN_PROGRESS", harness.component.matchWithTeams.value.match.segments.first().status)
        assertEquals(0, harness.component.currentSet.value)
        assertEquals(
            "Incident updates are still waiting to sync. Please retry once the queue starts moving.",
            harness.component.errorState.value,
        )
    }

    @Test
    fun given_auto_point_incidents_when_recording_score_then_repository_uses_incident_operations() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            usesSets = false,
            autoCreatePointMatchIncidents = true,
        )
        val teamA = createTeam(
            id = "team-a",
            captainId = "captain-a",
            playerIds = listOf("player-a"),
        ).copy(
            playerRegistrations = listOf(
                com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration(
                    id = "reg-a",
                    teamId = "team-a",
                    userId = "player-a",
                    status = "ACTIVE",
                    jerseyNumber = "9",
                )
            )
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = createMatch(
                eventId = event.id,
                team1Id = "team-a",
                team2Id = "team-b",
                teamOfficialId = "team-c",
                officialCheckedIn = true,
            ).copy(
                resolvedMatchRules = ResolvedMatchRulesMVP(
                    scoringModel = "POINTS_ONLY",
                    segmentCount = 1,
                    segmentLabel = "Total",
                    pointIncidentRequiresParticipant = true,
                )
            ),
            currentUser = user,
            teams = listOf(
                teamA,
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.recordPointIncident(
            isTeam1 = true,
            eventRegistrationId = "reg-a",
            participantUserId = "player-a",
            minute = 12,
            note = "Header",
        )
        advance()

        val incident = harness.matchRepository.incidentCalls.single().operation
        assertEquals("CREATE", incident.action)
        assertTrue(incident.id?.startsWith("client:match-incident:") == true)
        assertEquals("team-a", incident.eventTeamId)
        assertEquals("reg-a", incident.eventRegistrationId)
        assertEquals("player-a", incident.participantUserId)
        assertEquals(1, incident.linkedPointDelta)
        assertEquals(12, incident.minute)
        assertEquals("Header", incident.note)
        assertEquals(1, harness.component.matchWithTeams.value.match.incidents.size)
    }

    @Test
    fun given_incident_update_failure_when_recording_score_then_optimistic_score_is_kept() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            usesSets = false,
            autoCreatePointMatchIncidents = true,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = createMatch(
                eventId = event.id,
                team1Id = "team-a",
                team2Id = "team-b",
                teamOfficialId = "team-c",
                officialCheckedIn = true,
            ).copy(
                resolvedMatchRules = ResolvedMatchRulesMVP(
                    scoringModel = "POINTS_ONLY",
                    segmentCount = 1,
                    segmentLabel = "Total",
                    pointIncidentRequiresParticipant = true,
                )
            ),
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            operationFailure = IllegalStateException("incident write failed"),
        )

        advance()

        harness.component.recordPointIncident(
            isTeam1 = true,
            eventRegistrationId = "reg-a",
            participantUserId = "player-a",
            minute = 12,
            note = "Header",
        )
        testDispatcher.scheduler.runCurrent()

        assertEquals(listOf(1), harness.component.matchWithTeams.value.match.team1Points)
        assertEquals(1, harness.component.matchWithTeams.value.match.segments.single().scores["team-a"])
        val pendingIncident = harness.component.matchWithTeams.value.match.incidents.single()
        assertEquals("FAILED", pendingIncident.uploadStatus)
        assertEquals(null, harness.component.errorState.value)

        harness.matchRepository.operationFailure = null
        testDispatcher.scheduler.advanceTimeBy(3_000)
        testDispatcher.scheduler.runCurrent()
    }

    @Test
    fun given_queued_incident_when_sync_fails_then_it_backs_off_retries_and_resets_after_success() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            usesSets = false,
            autoCreatePointMatchIncidents = true,
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = createMatch(
                eventId = event.id,
                team1Id = "team-a",
                team2Id = "team-b",
                teamOfficialId = "team-c",
                officialCheckedIn = true,
            ).copy(
                resolvedMatchRules = ResolvedMatchRulesMVP(
                    scoringModel = "POINTS_ONLY",
                    segmentCount = 1,
                    segmentLabel = "Total",
                    pointIncidentRequiresParticipant = true,
                )
            ),
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
            operationFailure = IllegalStateException("incident write failed"),
        )

        advance()

        harness.component.recordPointIncident(
            isTeam1 = true,
            eventRegistrationId = "reg-a",
            participantUserId = "player-a",
            minute = 12,
            note = "Header",
        )
        testDispatcher.scheduler.runCurrent()

        assertEquals(1, harness.matchRepository.incidentCalls.size)
        assertEquals("FAILED", harness.component.matchWithTeams.value.match.incidents.single().uploadStatus)

        testDispatcher.scheduler.advanceTimeBy(2_999)
        testDispatcher.scheduler.runCurrent()
        assertEquals(1, harness.matchRepository.incidentCalls.size)

        testDispatcher.scheduler.advanceTimeBy(1)
        testDispatcher.scheduler.runCurrent()

        assertEquals(2, harness.matchRepository.incidentCalls.size)
        assertEquals("FAILED", harness.component.matchWithTeams.value.match.incidents.single().uploadStatus)

        harness.matchRepository.operationFailure = null
        testDispatcher.scheduler.advanceTimeBy(14_999)
        testDispatcher.scheduler.runCurrent()
        assertEquals(2, harness.matchRepository.incidentCalls.size)

        testDispatcher.scheduler.advanceTimeBy(1)
        testDispatcher.scheduler.runCurrent()

        assertEquals(3, harness.matchRepository.incidentCalls.size)
        assertEquals(null, harness.component.matchWithTeams.value.match.incidents.single().uploadStatus)

        harness.matchRepository.operationFailure = IllegalStateException("incident write failed again")
        harness.component.recordPointIncident(
            isTeam1 = true,
            eventRegistrationId = "reg-a",
            participantUserId = "player-a",
            minute = 13,
            note = "Volley",
        )
        testDispatcher.scheduler.runCurrent()

        assertEquals(4, harness.matchRepository.incidentCalls.size)
        assertEquals(1, harness.component.matchWithTeams.value.match.incidents.count { it.uploadStatus == "FAILED" })

        harness.matchRepository.operationFailure = null
        testDispatcher.scheduler.advanceTimeBy(2_999)
        testDispatcher.scheduler.runCurrent()
        assertEquals(4, harness.matchRepository.incidentCalls.size)

        testDispatcher.scheduler.advanceTimeBy(1)
        testDispatcher.scheduler.runCurrent()

        assertEquals(5, harness.matchRepository.incidentCalls.size)
        assertTrue(harness.component.matchWithTeams.value.match.incidents.all { it.uploadStatus == null })
    }

    @Test
    fun given_existing_scoring_incident_when_removing_then_delete_operation_and_score_reversal_are_sent() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(usesSets = false)
        val incident = MatchIncidentMVP(
            id = "incident-1",
            eventId = event.id,
            matchId = "match-1",
            segmentId = "segment-1",
            eventTeamId = "team-a",
            participantUserId = "player-a",
            incidentType = "GOAL",
            sequence = 1,
            linkedPointDelta = 1,
            minute = 5,
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "POINTS_ONLY",
                segmentCount = 1,
                segmentLabel = "Total",
                autoCreatePointIncidentType = "GOAL",
            ),
            team1Points = listOf(1),
            team2Points = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 1, team2Score = 0)),
            incidents = listOf(incident),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.removeMatchIncident("incident-1")
        advance()

        val operationCall = harness.matchRepository.operationCalls.single()
        assertEquals("DELETE", operationCall.incidentOperations.single().action)
        assertEquals("incident-1", operationCall.incidentOperations.single().id)
        assertEquals(emptyList(), harness.component.matchWithTeams.value.match.incidents)
        assertEquals(listOf(0), harness.component.matchWithTeams.value.match.team1Points)
        assertEquals(0, harness.component.matchWithTeams.value.match.segments.single().scores["team-a"])
    }

    @Test
    fun given_persisted_client_id_scoring_incident_when_removing_then_delete_operation_is_sent() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(usesSets = false)
        val incident = MatchIncidentMVP(
            id = "client:match-incident:match-1:segment-1:1",
            eventId = event.id,
            matchId = "match-1",
            segmentId = "segment-1",
            eventTeamId = "team-a",
            participantUserId = "player-a",
            incidentType = "GOAL",
            sequence = 1,
            linkedPointDelta = 1,
            minute = 5,
            uploadStatus = null,
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "POINTS_ONLY",
                segmentCount = 1,
                segmentLabel = "Total",
                autoCreatePointIncidentType = "GOAL",
            ),
            team1Points = listOf(1),
            team2Points = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 1, team2Score = 0)),
            incidents = listOf(incident),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.removeMatchIncident(incident.id)
        advance()

        val operationCall = harness.matchRepository.operationCalls.single()
        assertEquals("DELETE", operationCall.incidentOperations.single().action)
        assertEquals(incident.id, operationCall.incidentOperations.single().id)
        assertEquals(emptyList(), harness.component.matchWithTeams.value.match.incidents)
        assertEquals(listOf(0), harness.component.matchWithTeams.value.match.team1Points)
        assertEquals(0, harness.component.matchWithTeams.value.match.segments.single().scores["team-a"])
    }

    @Test
    fun given_existing_goal_incident_without_linked_delta_when_removing_then_score_is_not_inferred_from_type() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(usesSets = false)
        val incident = MatchIncidentMVP(
            id = "incident-1",
            eventId = event.id,
            matchId = "match-1",
            segmentId = "segment-1",
            eventTeamId = "team-a",
            participantUserId = "player-a",
            incidentType = "GOAL",
            sequence = 1,
            minute = 5,
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "POINTS_ONLY",
                segmentCount = 1,
                segmentLabel = "Total",
                autoCreatePointIncidentType = "GOAL",
            ),
            team1Points = listOf(1),
            team2Points = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 1, team2Score = 0)),
            incidents = listOf(incident),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.removeMatchIncident("incident-1")
        advance()

        assertEquals(emptyList(), harness.component.matchWithTeams.value.match.incidents)
        assertEquals(listOf(1), harness.component.matchWithTeams.value.match.team1Points)
        assertEquals(1, harness.component.matchWithTeams.value.match.segments.single().scores["team-a"])
    }

    @Test
    fun given_generic_incident_when_recording_then_score_is_not_changed() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(usesSets = false)
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = createMatch(
                eventId = event.id,
                team1Id = "team-a",
                team2Id = "team-b",
                teamOfficialId = "team-c",
                officialCheckedIn = true,
            ).copy(
                resolvedMatchRules = ResolvedMatchRulesMVP(
                    scoringModel = "POINTS_ONLY",
                    segmentCount = 1,
                    segmentLabel = "Total",
                    supportedIncidentTypes = listOf("DISCIPLINE", "NOTE"),
                )
            ),
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.recordMatchIncident(
            eventTeamId = "team-a",
            incidentType = "DISCIPLINE",
            eventRegistrationId = null,
            participantUserId = null,
            minute = 8,
            note = "Yellow card",
        )
        advance()

        val incidentOperation = harness.matchRepository.incidentCalls.single().operation
        assertEquals("CREATE", incidentOperation.action)
        assertEquals("DISCIPLINE", incidentOperation.incidentType)
        assertEquals(null, incidentOperation.linkedPointDelta)
        assertEquals(listOf(0), harness.component.matchWithTeams.value.match.team1Points)
    }

    @Test
    fun given_pending_local_incident_when_confirming_segment_then_incident_is_resent_with_segment() = runTest(testDispatcher) {
        val user = createUser(id = "user-1", teamIds = listOf("team-c"))
        val event = createEvent(teamIds = listOf("team-a", "team-b", "team-c")).copy(
            usesSets = false,
            autoCreatePointMatchIncidents = true,
        )
        val pendingIncident = MatchIncidentMVP(
            id = "client:match-incident:match-1:segment-1:1",
            eventId = event.id,
            matchId = "match-1",
            segmentId = "segment-1",
            eventTeamId = "team-a",
            participantUserId = "player-a",
            officialUserId = user.id,
            incidentType = "GOAL",
            sequence = 1,
            linkedPointDelta = 1,
            minute = 5,
            uploadStatus = "FAILED",
        )
        val match = createMatch(
            eventId = event.id,
            team1Id = "team-a",
            team2Id = "team-b",
            teamOfficialId = "team-c",
            officialCheckedIn = true,
        ).copy(
            resolvedMatchRules = ResolvedMatchRulesMVP(
                scoringModel = "POINTS_ONLY",
                segmentCount = 1,
                segmentLabel = "Total",
                autoCreatePointIncidentType = "GOAL",
                pointIncidentRequiresParticipant = true,
            ),
            team1Points = listOf(1),
            team2Points = listOf(0),
            segments = listOf(createSegment(sequence = 1, team1Score = 1, team2Score = 0)),
            incidents = listOf(pendingIncident),
        )
        val harness = MatchDetailHarness(
            event = event,
            initialMatch = match,
            currentUser = user,
            teams = listOf(
                createTeam(id = "team-a", captainId = "captain-a"),
                createTeam(id = "team-b", captainId = "captain-b"),
                createTeam(id = "team-c", captainId = user.id, playerIds = listOf(user.id)),
            ),
        )

        advance()

        harness.component.requestSetConfirmation()
        harness.component.confirmSet()
        advance()

        val incidentCall = harness.matchRepository.incidentCalls.single()
        assertEquals("client:match-incident:match-1:segment-1:1", incidentCall.operation.id)
        val operationCall = harness.matchRepository.operationCalls.single()
        assertTrue(operationCall.finalize)
        assertTrue(operationCall.incidentOperations.isEmpty())
        assertEquals("COMPLETE", operationCall.segmentOperations.single().status)
    }
}

private class MatchDetailHarness(
    event: Event,
    initialMatch: MatchMVP,
    repositoryMatch: MatchMVP = initialMatch,
    currentUser: UserData,
    teams: List<Team>,
    currentUserTeamIdsInRepository: List<String>? = null,
    updateDelayMillis: Long = 0,
    scoreSetDelayMillis: Long = 0,
    scoreSetDelaySequence: List<Long> = emptyList(),
    operationFailure: Throwable? = null,
    updateFailure: Throwable? = null,
) {
    val matchRepository = MatchDetailFakeMatchRepository(
        initialMatch = repositoryMatch,
        updateDelayMillis = updateDelayMillis,
        scoreSetDelayMillis = scoreSetDelayMillis,
        scoreSetDelaySequence = scoreSetDelaySequence,
        operationFailure = operationFailure,
        updateFailure = updateFailure,
    )

    val component = DefaultMatchContentComponent(
        componentContext = createTestComponentContext(),
        selectedMatch = initialMatch.toMatchWithRelations(),
        selectedEvent = event,
        eventRepository = MatchDetailFakeEventRepository(event),
        matchRepository = matchRepository,
        userRepository = MatchDetailFakeUserRepository(currentUser),
        teamRepository = MatchDetailFakeTeamRepository(
            currentUser = currentUser,
            teams = teams,
            currentUserTeamIdsInRepository = currentUserTeamIdsInRepository,
        ),
    )
}

private class MatchDetailFakeEventRepository(
    event: Event,
) : IEventRepository by CreateEvent_FakeEventRepository() {
    private val eventFlow = MutableStateFlow(Result.success(event.toEventWithRelations()))

    override fun getEventWithRelationsFlow(eventId: String): Flow<Result<EventWithRelations>> = eventFlow

    override suspend fun getEvent(eventId: String): Result<Event> =
        Result.success(eventFlow.value.getOrThrow().event)
}

private class MatchDetailFakeMatchRepository(
    initialMatch: MatchMVP,
    private val updateDelayMillis: Long = 0,
    private val scoreSetDelayMillis: Long = 0,
    scoreSetDelaySequence: List<Long> = emptyList(),
    operationFailure: Throwable? = null,
    updateFailure: Throwable? = null,
) : IMatchRepository by CreateEvent_FakeMatchRepository() {
    private val matchFlow = MutableStateFlow(Result.success(initialMatch.toMatchWithRelations()))
    private val scoreSetDelaySequence = scoreSetDelaySequence.toMutableList()
    var operationFailure: Throwable? = operationFailure
    var updateFailure: Throwable? = updateFailure
    val savedMatches = mutableListOf<MatchMVP>()
    val updatedMatches = mutableListOf<MatchMVP>()
    val operationCalls = mutableListOf<MatchOperationCall>()
    val scoreSetCalls = mutableListOf<MatchScoreSetCall>()
    val incidentCalls = mutableListOf<MatchIncidentCall>()

    override suspend fun getMatch(matchId: String): Result<MatchMVP> =
        Result.success(matchFlow.value.getOrThrow().match)

    override fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>> = matchFlow

    fun emitRemoteMatch(match: MatchMVP) {
        matchFlow.value = Result.success(match.toMatchWithRelations())
    }

    override suspend fun saveMatchLocally(match: MatchMVP): Result<Unit> {
        savedMatches += match
        matchFlow.value = Result.success(match.toMatchWithRelations())
        return Result.success(Unit)
    }

    override suspend fun updateMatch(match: MatchMVP): Result<Unit> {
        if (updateDelayMillis > 0) {
            delay(updateDelayMillis)
        }
        updatedMatches += match
        updateFailure?.let { return Result.failure(it) }
        matchFlow.value = Result.success(match.toMatchWithRelations())
        return Result.success(Unit)
    }

    override suspend fun updateMatchOperations(
        match: MatchMVP,
        lifecycle: MatchLifecycleOperationDto?,
        segmentOperations: List<MatchSegmentOperationDto>?,
        incidentOperations: List<MatchIncidentOperationDto>?,
        officialCheckIn: MatchOfficialCheckInOperationDto?,
        finalize: Boolean,
        time: Instant?,
    ): Result<MatchMVP> {
        operationCalls += MatchOperationCall(
            match = match,
            lifecycle = lifecycle,
            segmentOperations = segmentOperations.orEmpty(),
            incidentOperations = incidentOperations.orEmpty(),
            officialCheckIn = officialCheckIn,
            finalize = finalize,
            time = time,
        )
        operationFailure?.let { return Result.failure(it) }
        matchFlow.value = Result.success(match.toMatchWithRelations())
        return Result.success(match)
    }

    override suspend fun setMatchScore(
        match: MatchMVP,
        segmentId: String?,
        sequence: Int,
        eventTeamId: String,
        points: Int,
    ): Result<MatchMVP> {
        scoreSetCalls += MatchScoreSetCall(
            match = match,
            segmentId = segmentId,
            sequence = sequence,
            eventTeamId = eventTeamId,
            points = points,
        )
        val delayMillis = if (scoreSetDelaySequence.isNotEmpty()) {
            scoreSetDelaySequence.removeAt(0)
        } else {
            scoreSetDelayMillis
        }
        if (delayMillis > 0) {
            delay(delayMillis)
        }
        updateFailure?.let { return Result.failure(it) }
        matchFlow.value = Result.success(match.toMatchWithRelations())
        return Result.success(match)
    }

    override suspend fun addMatchIncident(
        match: MatchMVP,
        operation: MatchIncidentOperationDto,
    ): Result<MatchMVP> {
        incidentCalls += MatchIncidentCall(match = match, operation = operation)
        operationFailure?.let { return Result.failure(it) }
        matchFlow.value = Result.success(match.toMatchWithRelations())
        return Result.success(match)
    }
}

private data class MatchOperationCall(
    val match: MatchMVP,
    val lifecycle: MatchLifecycleOperationDto?,
    val segmentOperations: List<MatchSegmentOperationDto>,
    val incidentOperations: List<MatchIncidentOperationDto>,
    val officialCheckIn: MatchOfficialCheckInOperationDto?,
    val finalize: Boolean,
    val time: Instant?,
)

private data class MatchScoreSetCall(
    val match: MatchMVP,
    val segmentId: String?,
    val sequence: Int,
    val eventTeamId: String,
    val points: Int,
)

private data class MatchIncidentCall(
    val match: MatchMVP,
    val operation: MatchIncidentOperationDto,
)

private class MatchDetailFakeUserRepository(
    currentUser: UserData,
) : IUserRepository by CreateEvent_FakeUserRepository() {
    override val currentUser = MutableStateFlow(Result.success(currentUser))
    override val currentAccount = MutableStateFlow(
        Result.success(
            AuthAccount(
                id = currentUser.id,
                email = "${currentUser.id}@example.test",
                name = currentUser.fullName,
            )
        )
    )
}

private class MatchDetailFakeTeamRepository(
    private val currentUser: UserData,
    teams: List<Team>,
    private val currentUserTeamIdsInRepository: List<String>? = null,
) : ITeamRepository {
    private val teamsById = teams.associateBy { team -> team.id }
    private val usersById = buildMap {
        put(currentUser.id, currentUser)
        teams.forEach { team ->
            if (!containsKey(team.captainId)) {
                put(team.captainId, createUser(id = team.captainId))
            }
            team.playerIds.forEach { playerId ->
                if (!containsKey(playerId)) {
                    put(playerId, createUser(id = playerId))
                }
            }
        }
    }

    override fun getTeamsFlow(ids: List<String>): Flow<Result<List<TeamWithPlayers>>> =
        flowOf(Result.success(ids.mapNotNull { id -> teamsById[id] }.map { team -> team.toTeamWithPlayers(usersById) }))

    override suspend fun getTeamWithPlayers(teamId: String): Result<TeamWithPlayers> =
        teamsById[teamId]
            ?.let { team -> Result.success(team.toTeamWithPlayers(usersById)) }
            ?: Result.failure(IllegalStateException("Team $teamId not found"))

    override suspend fun getTeams(ids: List<String>): Result<List<Team>> =
        Result.success(ids.mapNotNull { id -> teamsById[id] })

    override suspend fun getTeamsWithPlayers(ids: List<String>): Result<List<TeamWithPlayers>> =
        Result.success(ids.mapNotNull { id -> teamsById[id] }.map { team -> team.toTeamWithPlayers(usersById) })

    override suspend fun addPlayerToTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun removePlayerFromTeam(team: Team, player: UserData): Result<Unit> = Result.success(Unit)
    override suspend fun createTeam(newTeam: Team): Result<Team> = Result.success(newTeam)
    override suspend fun updateTeam(newTeam: Team): Result<Team> = Result.success(newTeam)
    override suspend fun requestTeamRegistration(teamId: String): Result<TeamRegistrationResult> =
        teamsById[teamId]?.let { team ->
            Result.success(TeamRegistrationResult(team = team, registrationStatus = "ACTIVE"))
        } ?: Result.failure(IllegalStateException("Team $teamId not found"))
    override suspend fun registerForTeam(teamId: String): Result<Team> =
        teamsById[teamId]?.let { team -> Result.success(team) }
            ?: Result.failure(IllegalStateException("Team $teamId not found"))
    override suspend fun leaveTeam(teamId: String): Result<Team> =
        teamsById[teamId]?.let { team -> Result.success(team) }
            ?: Result.failure(IllegalStateException("Team $teamId not found"))
    override suspend fun deleteTeam(team: TeamWithPlayers): Result<Unit> = Result.success(Unit)

    override fun getTeamsWithPlayersFlow(id: String): Flow<Result<List<TeamWithPlayers>>> {
        val teamIds = currentUserTeamIdsInRepository ?: currentUser.teamIds
        val currentUserTeams = teamIds
            .mapNotNull { teamId -> teamsById[teamId] }
            .map { team -> team.toTeamWithPlayers(usersById) }
        return flowOf(Result.success(currentUserTeams))
    }

    override fun getTeamWithPlayersFlow(id: String): Flow<Result<TeamWithRelations>> =
        teamsById[id]
            ?.let { team -> flowOf(Result.success(team.toTeamWithRelations(usersById))) }
            ?: flowOf(Result.failure(IllegalStateException("Team $id not found")))

    override suspend fun listTeamInvites(userId: String) = Result.success(emptyList<com.razumly.mvp.core.data.dataTypes.Invite>())

    override suspend fun createTeamInvite(
        teamId: String,
        userId: String,
        createdBy: String,
        inviteType: String,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun getInviteFreeAgents(teamId: String): Result<List<UserData>> =
        Result.success(emptyList())

    override suspend fun deleteInvite(inviteId: String): Result<Unit> = Result.success(Unit)
    override suspend fun acceptTeamInvite(inviteId: String, teamId: String): Result<Unit> = Result.success(Unit)
}

private fun createTestComponentContext(): DefaultComponentContext {
    val lifecycle = LifecycleRegistry()
    lifecycle.onCreate()
    lifecycle.onStart()
    lifecycle.onResume()
    return DefaultComponentContext(
        lifecycle = lifecycle,
        backHandler = BackDispatcher(),
    )
}

private fun createEvent(
    teamIds: List<String>,
): Event = Event(
    id = "event-1",
    doTeamsOfficiate = true,
    teamOfficialsMaySwap = true,
    teamIds = teamIds,
)

private fun createMatch(
    eventId: String,
    team1Id: String,
    team2Id: String,
    teamOfficialId: String,
    officialCheckedIn: Boolean,
): MatchMVP = MatchMVP(
    id = "match-1",
    matchId = 1,
    eventId = eventId,
    team1Id = team1Id,
    team2Id = team2Id,
    teamOfficialId = teamOfficialId,
    officialCheckedIn = officialCheckedIn,
    team1Points = listOf(0),
    team2Points = listOf(0),
    setResults = listOf(0),
    start = Instant.fromEpochMilliseconds(1_700_000_000_000),
)

private fun createSegment(
    sequence: Int,
    team1Score: Int,
    team2Score: Int,
): MatchSegmentMVP = MatchSegmentMVP(
    id = "segment-$sequence",
    eventId = "event-1",
    matchId = "match-1",
    sequence = sequence,
    status = if (team1Score > 0 || team2Score > 0) "IN_PROGRESS" else "NOT_STARTED",
    scores = mapOf(
        "team-a" to team1Score,
        "team-b" to team2Score,
    ),
)

private fun createTeam(
    id: String,
    captainId: String,
    playerIds: List<String> = listOf(captainId),
): Team = Team(
    id = id,
    division = "OPEN",
    name = id,
    captainId = captainId,
    playerIds = playerIds,
    teamSize = 2,
)

private fun createUser(
    id: String,
    teamIds: List<String> = emptyList(),
    firstName: String = "Test",
    lastName: String = "User",
    userName: String = id,
): UserData = UserData(
    firstName = firstName,
    lastName = lastName,
    teamIds = teamIds,
    friendIds = emptyList(),
    friendRequestIds = emptyList(),
    friendRequestSentIds = emptyList(),
    followingIds = emptyList(),
    userName = userName,
    hasStripeAccount = false,
    uploadedImages = emptyList(),
    profileImageId = null,
    id = id,
)

private fun Event.toEventWithRelations(): EventWithRelations = EventWithRelations(
    event = this,
    host = null,
    players = emptyList(),
    teams = emptyList(),
)

private fun MatchMVP.toMatchWithRelations(): MatchWithRelations = MatchWithRelations(
    match = this,
    field = null,
    team1 = null,
    team2 = null,
    teamOfficial = null,
    winnerNextMatch = null,
    loserNextMatch = null,
    previousLeftMatch = null,
    previousRightMatch = null,
)

private fun Team.toTeamWithPlayers(usersById: Map<String, UserData>): TeamWithPlayers {
    val captain = usersById[captainId] ?: createUser(id = captainId)
    val players = playerIds.map { playerId -> usersById[playerId] ?: createUser(id = playerId) }
    val pendingPlayers = pending.map { userId -> usersById[userId] ?: createUser(id = userId) }
    return TeamWithPlayers(
        team = this,
        captain = captain,
        players = players,
        pendingPlayers = pendingPlayers,
    )
}

private fun Team.toTeamWithRelations(usersById: Map<String, UserData>): TeamWithRelations {
    val players = playerIds.map { playerId -> usersById[playerId] ?: createUser(id = playerId) }
    return TeamWithRelations(
        team = this,
        players = players,
        matchAsTeam1 = emptyList(),
        matchAsTeam2 = emptyList(),
    )
}
