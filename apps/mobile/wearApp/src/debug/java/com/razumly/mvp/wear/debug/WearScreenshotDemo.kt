package com.razumly.mvp.wear.debug

import com.razumly.mvp.wear.MvpWearUiState
import com.razumly.mvp.wear.MvpWearViewModel
import com.razumly.mvp.wear.WearIncidentMode
import com.razumly.mvp.wear.WearRoute
import com.razumly.mvp.wear.data.WearIncidentTypeDefinitionDto
import com.razumly.mvp.wear.data.WearMatch
import com.razumly.mvp.wear.data.WearMatchDto
import com.razumly.mvp.wear.data.WearMatchIncidentDto
import com.razumly.mvp.wear.data.WearMatchSegmentDto
import com.razumly.mvp.wear.data.WearOfficialAssignmentDto
import com.razumly.mvp.wear.data.WearPlayer
import com.razumly.mvp.wear.data.WearResolvedMatchRulesDto
import com.razumly.mvp.wear.data.WearTeam
import com.razumly.mvp.wear.data.WearTimekeepingDto
import com.razumly.mvp.wear.data.resolvedId
import java.time.Instant

object WearScreenshotDemo {
    @JvmStatic
    fun apply(viewModel: MvpWearViewModel, routeName: String) {
        val normalizedRoute = routeName.lowercase()
        val match = demoMatch(
            longNames = normalizedRoute.contains("long"),
            fallbackTeams = normalizedRoute.contains("fallback"),
            setScoring = normalizedRoute == "score-sets",
        )
        val selectedIncident = match.raw.incidents.firstOrNull()
        val route = when (normalizedRoute) {
            "matches" -> WearRoute.MATCHES
            "detail" -> WearRoute.MATCH_DETAIL
            "timer" -> WearRoute.TIMER
            "score", "teampick", "score-long", "teampick-long", "score-fallback", "score-sets" -> WearRoute.TEAM_PICK
            "action" -> WearRoute.ACTION_MENU
            "incidents" -> WearRoute.INCIDENT_LIST
            "editor" -> WearRoute.INCIDENT_EDITOR
            "type" -> WearRoute.INCIDENT_TYPES
            "team" -> WearRoute.INCIDENT_TEAMS
            "players" -> WearRoute.PLAYERS
            "time" -> WearRoute.TIME_PICK
            else -> WearRoute.TEAM_PICK
        }
        viewModel.applyDebugDemoState(
            MvpWearUiState(
                route = route,
                isDemo = true,
                isAuthenticated = true,
                currentUserId = "official_1",
                currentUserLabel = "Alex Rivera",
                matches = listOf(match),
                selectedMatchId = match.id,
                selectedTeamId = match.team1?.id,
                selectedIncidentCode = if (route == WearRoute.INCIDENT_TYPES) null else "GOAL",
                selectedPlayerUserId = selectedIncident?.participantUserId,
                selectedIncidentId = if (route == WearRoute.INCIDENT_EDITOR) {
                    selectedIncident?.resolvedId()
                } else {
                    null
                },
                incidentMinute = 74,
                incidentClockSeconds = 73 * 60 + 15,
                incidentMode = if (route == WearRoute.INCIDENT_EDITOR) {
                    WearIncidentMode.EDIT
                } else {
                    WearIncidentMode.CREATE
                },
            ),
        )
    }

    private fun demoMatch(
        longNames: Boolean,
        fallbackTeams: Boolean,
        setScoring: Boolean,
    ): WearMatch {
        val homePlayers = listOf(
            WearPlayer(
                participantUserId = "p_home_9",
                eventRegistrationId = "reg_home_9",
                label = "Maya Brooks",
                jerseyNumber = "9",
            ),
            WearPlayer(
                participantUserId = "p_home_14",
                eventRegistrationId = "reg_home_14",
                label = "Sofia Alvarez",
                jerseyNumber = "14",
            ),
        )
        val awayPlayers = listOf(
            WearPlayer(
                participantUserId = "p_away_10",
                eventRegistrationId = "reg_away_10",
                label = "Nora Chen",
                jerseyNumber = "10",
            ),
            WearPlayer(
                participantUserId = "p_away_22",
                eventRegistrationId = "reg_away_22",
                label = "Ivy Parker",
                jerseyNumber = "22",
            ),
        )
        val homeLabel = if (longNames) "Harbor City Athletic Football Club" else "Harbor FC"
        val awayLabel = if (longNames) "Summit Valley United Academy" else "Summit"
        val home = WearTeam(id = "team_home", label = homeLabel, players = homePlayers)
            .takeUnless { fallbackTeams }
        val away = WearTeam(id = "team_away", label = awayLabel, players = awayPlayers)
            .takeUnless { fallbackTeams }
        val startedAt = Instant.now().minusSeconds(28 * 60L + 15).toString()
        val scheduledStart = Instant.parse("2026-06-13T23:00:00Z").toString()
        val rules = WearResolvedMatchRulesDto(
            scoringModel = if (setScoring) "SETS" else "POINTS_ONLY",
            segmentCount = if (setScoring) 3 else 2,
            segmentLabel = if (setScoring) "Set" else "Half",
            supportsDraw = false,
            supportsOvertime = true,
            supportsShootout = true,
            canUseOvertime = true,
            canUseShootout = true,
            supportedIncidentTypes = listOf("GOAL", "YELLOW_CARD", "PENALTY"),
            incidentTypeDefinitions = listOf(
                WearIncidentTypeDefinitionDto(
                    code = "GOAL",
                    label = "Goal",
                    kind = "SCORING",
                    requiresTeam = true,
                    requiresParticipant = true,
                    defaultEnabled = true,
                    linkedPointDelta = 1,
                ),
                WearIncidentTypeDefinitionDto(
                    code = "YELLOW_CARD",
                    label = "Yellow card",
                    kind = "DISCIPLINE",
                    cardColor = "YELLOW",
                    requiresTeam = true,
                    requiresParticipant = true,
                    defaultEnabled = true,
                ),
                WearIncidentTypeDefinitionDto(
                    code = "PENALTY",
                    label = "Penalty",
                    kind = "DISCIPLINE",
                    requiresTeam = true,
                    requiresParticipant = true,
                    defaultEnabled = true,
                ),
            ),
            autoCreatePointIncidentType = "GOAL",
            pointIncidentRequiresParticipant = true,
            timekeeping = WearTimekeepingDto(
                timerMode = "COUNT_UP",
                segmentDurationMinutes = 45,
                segmentDurationMinutesBySequence = listOf(45, 45),
                canUseAddedTime = true,
                addedTimeEnabled = true,
                stopAtRegulationEnd = false,
            ),
        )
        val activeSegment = WearMatchSegmentDto(
            id = "segment_2",
            eventId = "event_showcase",
            matchId = "match_showcase",
            sequence = 2,
            status = "IN_PROGRESS",
            scores = if (fallbackTeams) {
                emptyMap()
            } else if (setScoring) {
                mapOf(home!!.id to 1, away!!.id to 0)
            } else {
                mapOf(home!!.id to 3, away!!.id to 2)
            },
            startedAt = startedAt,
        )
        val incidents = listOf(
            WearMatchIncidentDto(
                id = "incident_goal_1",
                eventId = "event_showcase",
                matchId = "match_showcase",
                segmentId = activeSegment.id,
                eventTeamId = home?.id,
                eventRegistrationId = "reg_home_9",
                participantUserId = "p_home_9",
                officialUserId = "official_1",
                incidentType = "GOAL",
                sequence = 1,
                minute = 58,
                clock = "58:00",
                clockSeconds = 57 * 60,
                linkedPointDelta = 1,
            ),
            WearMatchIncidentDto(
                id = "incident_goal_2",
                eventId = "event_showcase",
                matchId = "match_showcase",
                segmentId = activeSegment.id,
                eventTeamId = away?.id,
                eventRegistrationId = "reg_away_10",
                participantUserId = "p_away_10",
                officialUserId = "official_1",
                incidentType = "GOAL",
                sequence = 2,
                minute = 66,
                clock = "66:00",
                clockSeconds = 65 * 60,
                linkedPointDelta = 1,
            ),
            WearMatchIncidentDto(
                id = "incident_card_1",
                eventId = "event_showcase",
                matchId = "match_showcase",
                segmentId = activeSegment.id,
                eventTeamId = home?.id,
                eventRegistrationId = "reg_home_14",
                participantUserId = "p_home_14",
                officialUserId = "official_1",
                incidentType = "YELLOW_CARD",
                sequence = 3,
                minute = 71,
                clock = "71:00",
                clockSeconds = 70 * 60,
            ),
        )
        val raw = WearMatchDto(
            id = "match_showcase",
            matchId = 12,
            team1Id = home?.id,
            team2Id = away?.id,
            eventId = "event_showcase",
            officialId = "official_1",
            fieldId = "field_2",
            status = "IN_PROGRESS",
            actualStart = startedAt,
            matchRulesSnapshot = rules,
            resolvedMatchRules = rules,
            segments = if (setScoring) {
                listOf(
                    WearMatchSegmentDto(
                        id = "segment_1",
                        eventId = "event_showcase",
                        matchId = "match_showcase",
                        sequence = 1,
                        status = "COMPLETE",
                        scores = mapOf(home!!.id to 25, away!!.id to 20),
                        winnerEventTeamId = home.id,
                    ),
                    activeSegment,
                )
            } else {
                listOf(activeSegment)
            },
            incidents = incidents,
            start = scheduledStart,
            division = "Premier",
            officialCheckedIn = true,
            officialIds = listOf(
                WearOfficialAssignmentDto(
                    positionId = "center_ref",
                    slotIndex = 0,
                    holderType = "USER",
                    userId = "official_1",
                    checkedIn = true,
                ),
            ),
            locked = false,
        )

        return WearMatch(
            id = "match_showcase",
            number = 12,
            eventId = "event_showcase",
            eventName = "Spring Invitational",
            startIso = scheduledStart,
            endIso = null,
            fieldLabel = "Field 2",
            division = "Premier",
            status = "IN_PROGRESS",
            team1 = home,
            team2 = away,
            officialCheckedIn = true,
            rules = rules,
            raw = raw,
        )
    }
}
