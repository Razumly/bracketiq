import Foundation

#if DEBUG
extension WatchOfficialViewModel {
    static func demo(routeName: String, repository: WatchMatchRepository) -> WatchOfficialViewModel {
        let viewModel = WatchOfficialViewModel(repository: repository, bootstrapOnInit: false)
        let match = demoMatch()
        viewModel.isAuthenticated = true
        viewModel.isDemo = true
        viewModel.currentUserId = "official_1"
        viewModel.currentUserLabel = "Alex Rivera"
        viewModel.matches = [match]
        viewModel.selectedMatchId = match.id
        viewModel.selectedTeamId = match.team1?.id
        viewModel.selectedIncidentCode = "GOAL"
        viewModel.incidentMinute = 74
        viewModel.incidentClockSeconds = 4395
        viewModel.incidentMode = .create

        switch routeName.lowercased() {
        case "matches":
            viewModel.route = .matches
        case "detail":
            viewModel.route = .detail
        case "timer":
            viewModel.route = .timer
        case "score", "teampick":
            viewModel.route = .teamPick
        case "action":
            viewModel.route = .actionMenu
        case "incidents":
            viewModel.route = .incidentList
        case "editor":
            viewModel.selectedIncidentId = match.raw.incidents.first?.resolvedId
            viewModel.selectedIncidentCode = match.raw.incidents.first?.incidentType
            viewModel.selectedPlayerUserId = match.raw.incidents.first?.participantUserId
            viewModel.incidentMode = .edit
            viewModel.route = .incidentEditor
        case "type":
            viewModel.selectedIncidentCode = nil
            viewModel.route = .incidentTypes
        case "team":
            viewModel.route = .incidentTeams
        case "players":
            viewModel.route = .players
        case "time":
            viewModel.route = .minuteConfirm
        default:
            viewModel.route = .detail
        }

        return viewModel
    }

    private static func demoMatch() -> WatchMatch {
        let homePlayers = [
            WatchPlayer(
                participantUserId: "p_home_9",
                eventRegistrationId: "reg_home_9",
                label: "Maya Brooks",
                jerseyNumber: "9"
            ),
            WatchPlayer(
                participantUserId: "p_home_14",
                eventRegistrationId: "reg_home_14",
                label: "Sofia Alvarez",
                jerseyNumber: "14"
            )
        ]
        let awayPlayers = [
            WatchPlayer(
                participantUserId: "p_away_10",
                eventRegistrationId: "reg_away_10",
                label: "Nora Chen",
                jerseyNumber: "10"
            ),
            WatchPlayer(
                participantUserId: "p_away_22",
                eventRegistrationId: "reg_away_22",
                label: "Ivy Parker",
                jerseyNumber: "22"
            )
        ]
        let home = WatchTeam(id: "team_home", label: "Harbor FC", players: homePlayers)
        let away = WatchTeam(id: "team_away", label: "Summit", players: awayPlayers)
        let startedAt = ISO8601DateFormatter.api.string(from: Date().addingTimeInterval(-1695))
        let scheduledStart = "2026-06-13T23:00:00Z"
        let rules = WatchResolvedMatchRulesDTO(
            scoringModel: "POINTS_ONLY",
            segmentCount: 2,
            segmentLabel: "Half",
            supportsDraw: false,
            supportsOvertime: true,
            supportsShootout: true,
            canUseOvertime: true,
            canUseShootout: true,
            supportedIncidentTypes: ["GOAL", "YELLOW_CARD", "PENALTY"],
            incidentTypeDefinitions: [
                WatchIncidentTypeDefinitionDTO(
                    code: "GOAL",
                    label: "Goal",
                    kind: "SCORING",
                    cardColor: nil,
                    requiresTeam: true,
                    requiresParticipant: true,
                    defaultEnabled: true,
                    linkedPointDelta: 1,
                    metadata: nil
                ),
                WatchIncidentTypeDefinitionDTO(
                    code: "YELLOW_CARD",
                    label: "Yellow card",
                    kind: "DISCIPLINE",
                    cardColor: "YELLOW",
                    requiresTeam: true,
                    requiresParticipant: true,
                    defaultEnabled: true,
                    linkedPointDelta: nil,
                    metadata: nil
                ),
                WatchIncidentTypeDefinitionDTO(
                    code: "PENALTY",
                    label: "Penalty",
                    kind: "DISCIPLINE",
                    cardColor: nil,
                    requiresTeam: true,
                    requiresParticipant: true,
                    defaultEnabled: true,
                    linkedPointDelta: nil,
                    metadata: nil
                )
            ],
            autoCreatePointIncidentType: "GOAL",
            pointIncidentRequiresParticipant: true,
            timekeeping: WatchTimekeepingDTO(
                timerMode: "COUNT_UP",
                segmentDurationMinutes: 45,
                segmentDurationMinutesBySequence: [45, 45],
                canUseAddedTime: true,
                addedTimeEnabled: true,
                stopAtRegulationEnd: false
            )
        )
        let activeSegment = WatchMatchSegmentDTO(
            id: "segment_2",
            legacyId: nil,
            eventId: "event_1",
            matchId: "match_showcase",
            sequence: 2,
            status: "IN_PROGRESS",
            scores: ["team_home": 3, "team_away": 2],
            winnerEventTeamId: nil,
            startedAt: startedAt,
            endedAt: nil,
            resultType: nil,
            statusReason: nil
        )
        let incidents = [
            WatchMatchIncidentDTO(
                id: "incident_goal_1",
                legacyId: nil,
                eventId: "event_1",
                matchId: "match_showcase",
                segmentId: "segment_2",
                eventTeamId: "team_home",
                eventRegistrationId: "reg_home_9",
                participantUserId: "p_home_9",
                officialUserId: "official_1",
                incidentType: "GOAL",
                sequence: 1,
                minute: 58,
                clock: "58:00",
                clockSeconds: 3420,
                linkedPointDelta: 1,
                note: nil
            ),
            WatchMatchIncidentDTO(
                id: "incident_goal_2",
                legacyId: nil,
                eventId: "event_1",
                matchId: "match_showcase",
                segmentId: "segment_2",
                eventTeamId: "team_away",
                eventRegistrationId: "reg_away_10",
                participantUserId: "p_away_10",
                officialUserId: "official_1",
                incidentType: "GOAL",
                sequence: 2,
                minute: 66,
                clock: "66:00",
                clockSeconds: 3900,
                linkedPointDelta: 1,
                note: nil
            ),
            WatchMatchIncidentDTO(
                id: "incident_card_1",
                legacyId: nil,
                eventId: "event_1",
                matchId: "match_showcase",
                segmentId: "segment_2",
                eventTeamId: "team_home",
                eventRegistrationId: "reg_home_14",
                participantUserId: "p_home_14",
                officialUserId: "official_1",
                incidentType: "YELLOW_CARD",
                sequence: 3,
                minute: 71,
                clock: "71:00",
                clockSeconds: 4200,
                linkedPointDelta: nil,
                note: nil
            )
        ]
        let raw = WatchMatchDTO(
            id: "match_showcase",
            legacyId: nil,
            matchId: 12,
            team1Id: home.id,
            team2Id: away.id,
            eventId: "event_1",
            officialId: "official_1",
            fieldId: "field_2",
            status: "IN_PROGRESS",
            resultStatus: nil,
            resultType: nil,
            actualStart: startedAt,
            actualEnd: nil,
            winnerEventTeamId: nil,
            matchRulesSnapshot: rules,
            resolvedMatchRules: rules,
            segments: [activeSegment],
            incidents: incidents,
            start: scheduledStart,
            end: nil,
            division: "Premier",
            team1Points: [],
            team2Points: [],
            setResults: [],
            officialCheckedIn: true,
            officialIds: [
                WatchOfficialAssignmentDTO(
                    positionId: "ref",
                    slotIndex: 0,
                    holderType: "USER",
                    userId: "official_1",
                    checkedIn: true
                )
            ],
            teamOfficialId: nil,
            locked: false
        )

        return WatchMatch(
            id: "match_showcase",
            number: 12,
            eventId: "event_1",
            eventName: "Spring Invitational",
            startIso: raw.start,
            endIso: nil,
            fieldLabel: "Field 2",
            division: "Premier",
            status: "IN_PROGRESS",
            team1: home,
            team2: away,
            officialCheckedIn: true,
            rules: rules,
            raw: raw
        )
    }
}
#endif
