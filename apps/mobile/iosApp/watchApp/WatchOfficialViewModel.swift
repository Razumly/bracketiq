import Foundation

@MainActor
final class WatchOfficialViewModel: ObservableObject {
    enum Route {
        case login
        case matches
        case detail
        case timer
        case teamPick
        case actionMenu
        case incidentList
        case incidentEditor
        case incidentTypes
        case incidentTeams
        case players
        case minuteConfirm
    }

    enum IncidentMode {
        case create
        case edit
    }

    enum IncidentField {
        case type
        case team
        case player
        case time
    }

    @Published var route: Route = .login
    @Published var isLoading = false
    @Published var isAuthenticated = false
    @Published var email = ""
    @Published var password = ""
    @Published var currentUserId: String?
    @Published var currentUserLabel: String?
    @Published var matches: [WatchMatch] = []
    @Published var selectedMatchId: String?
    @Published var selectedTeamId: String?
    @Published var selectedIncidentCode: String?
    @Published var selectedPlayerUserId: String?
    @Published var selectedIncidentId: String?
    @Published var incidentMinute = 1
    @Published var incidentClockSeconds = 0
    @Published var incidentMode: IncidentMode?
    @Published var message: String?
    @Published var error: String?
    @Published var isDemo = false

    private let repository: WatchMatchRepository

    init(repository: WatchMatchRepository, bootstrapOnInit: Bool = true) {
        self.repository = repository
        if bootstrapOnInit {
            Task {
                await bootstrap()
            }
        }
    }

    var selectedMatch: WatchMatch? {
        matches.first { $0.id == selectedMatchId }
    }

    var selectedTeam: WatchTeam? {
        guard let selectedMatch else { return nil }
        return [selectedMatch.team1, selectedMatch.team2].compactMap { $0 }.first { $0.id == selectedTeamId }
    }

    var selectedIncidentType: WatchIncidentTypeDefinitionDTO? {
        guard let selectedMatch else { return nil }
        return selectedMatch.rules.incidentTypes.first { $0.code == selectedIncidentCode }
    }

    var selectedIncident: WatchMatchIncidentDTO? {
        guard let selectedIncidentId, let selectedMatch else { return nil }
        return selectedMatch.raw.incidents.first { $0.resolvedId == selectedIncidentId }
    }

    var selectedPlayer: WatchPlayer? {
        selectedTeam?.players.first { $0.participantUserId == selectedPlayerUserId }
    }

    func signIn() {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty, !password.isEmpty else {
            error = "Enter email and password."
            return
        }
        Task {
            await self.runBusy {
                let session = try await self.repository.login(email: normalizedEmail, password: self.password)
                let loadedMatches = try await self.repository.loadOfficialSchedule()
                self.isAuthenticated = true
                self.currentUserId = session.userId
                self.currentUserLabel = session.label
                self.password = ""
                self.matches = loadedMatches
                self.selectedMatchId = loadedMatches.first?.id
                self.route = .matches
            }
        }
    }

    func acceptSyncedSetupToken(_ setupToken: String) {
        let token = setupToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { return }
        Task {
            await self.runBusy {
                let session = try await self.repository.exchangeWatchSetupToken(token)
                let loadedMatches = try await self.repository.loadOfficialSchedule()
                self.isAuthenticated = true
                self.currentUserId = session.userId
                self.currentUserLabel = session.label
                self.password = ""
                self.matches = loadedMatches
                self.selectedMatchId = loadedMatches.first?.id
                self.route = .matches
                self.message = "Signed in from iPhone."
            }
        }
    }

    func logout() {
        repository.logout()
        route = .login
        isAuthenticated = false
        currentUserId = nil
        currentUserLabel = nil
        matches = []
        selectedMatchId = nil
        selectedTeamId = nil
        selectedIncidentCode = nil
        selectedPlayerUserId = nil
        message = nil
        error = nil
    }

    func refresh() {
        guard isAuthenticated else { return }
        Task {
            await self.runBusy {
                try await self.reloadMatches(preserveSelection: true)
            }
        }
    }

    func selectMatch(_ matchId: String) {
        selectedMatchId = matchId
        selectedTeamId = nil
        selectedIncidentCode = nil
        selectedPlayerUserId = nil
        selectedIncidentId = nil
        incidentMode = nil
        route = .detail
        clearStatus()
    }

    func back() {
        switch route {
        case .login, .matches:
            break
        case .detail:
            route = .matches
        case .timer:
            route = .detail
        case .teamPick:
            route = .timer
        case .actionMenu:
            route = .teamPick
        case .incidentList:
            route = .actionMenu
        case .incidentEditor:
            let nextRoute: Route = incidentMode == .edit ? .incidentList : .teamPick
            clearIncidentDraft()
            route = nextRoute
        case .incidentTypes:
            route = incidentMode == .create ? .teamPick : .incidentEditor
        case .players:
            selectedPlayerUserId = nil
            route = incidentMode == .create ? .incidentTypes : .incidentEditor
        case .minuteConfirm:
            if incidentMode == .edit {
                route = .incidentEditor
            } else if let type = selectedIncidentType,
                      let match = selectedMatch,
                      let team = selectedTeam,
                      type.requiresPlayer(rules: match.rules),
                      !team.players.isEmpty {
                route = .players
            } else {
                route = .incidentTypes
            }
        case .incidentTeams:
            route = incidentMode == .create ? .incidentTypes : .incidentEditor
        }
        clearStatus()
    }

    func checkIn() {
        runMatchAction(success: "Checked in.") { try await self.repository.checkIn(match: $0) }
    }

    func startTimer() {
        runMatchAction(success: nil, route: .timer) { try await self.repository.startCurrentSegment(match: $0) }
    }

    func openTimer() {
        guard selectedMatch != nil else { return }
        route = .timer
        clearStatus()
    }

    func returnToTimerIfTeamPicker() {
        if route == .teamPick {
            route = .timer
        }
    }

    func resetTimer() {
        runMatchAction(success: "Timer reset.") { try await self.repository.resetCurrentSegment(match: $0) }
    }

    func endSegment() {
        runMatchAction(success: "Segment ended.") { try await self.repository.endCurrentSegment(match: $0) }
    }

    func startNextSegment() {
        runMatchAction(success: nil, route: .timer) { try await self.repository.startNextSegmentOrOvertime(match: $0) }
    }

    func endMatch() {
        runMatchAction(success: "Match ended.") { try await self.repository.endMatch(match: $0) }
    }

    func showTeamPicker() {
        guard selectedMatch != nil else { return }
        selectedTeamId = nil
        selectedIncidentId = nil
        incidentMode = nil
        route = .teamPick
        clearStatus()
    }

    func showActionMenu() {
        guard selectedMatch != nil else { return }
        selectedTeamId = nil
        selectedIncidentId = nil
        incidentMode = nil
        route = .actionMenu
        clearStatus()
    }

    func showIncidentList() {
        guard selectedMatch != nil else { return }
        selectedIncidentId = nil
        incidentMode = nil
        route = .incidentList
        clearStatus()
    }

    func selectTeam(_ teamId: String) {
        switch route {
        case .incidentTeams:
            selectIncidentTeam(teamId)
        default:
            beginIncidentCreate(teamId: teamId)
        }
    }

    func openIncidentEditor(_ incidentId: String) {
        guard let match = selectedMatch,
              let incident = match.raw.incidents.first(where: { $0.resolvedId == incidentId }) else {
            return
        }
        let clockSeconds = incident.clockSeconds ?? secondsForMinute(incident.minute ?? 1)
        selectedIncidentId = incident.resolvedId
        selectedTeamId = incident.eventTeamId.trimmedOrNil
        selectedIncidentCode = incident.incidentType
        selectedPlayerUserId = incident.participantUserId.trimmedOrNil
        incidentMinute = minuteForClockSeconds(clockSeconds)
        incidentClockSeconds = clockSeconds
        incidentMode = .edit
        route = .incidentEditor
        clearStatus()
    }

    func editIncidentField(_ field: IncidentField) {
        guard let match = selectedMatch else { return }
        switch field {
        case .type:
            route = .incidentTypes
        case .team:
            route = .incidentTeams
        case .player:
            if selectedIncidentType == nil {
                route = .incidentTypes
            } else if selectedTeam == nil {
                route = .incidentTeams
            } else if selectedIncidentType?.isScoring == true,
                      selectedIncidentType?.requiresPlayer(rules: match.rules) == false {
                route = .minuteConfirm
            } else {
                route = .players
            }
        case .time:
            route = .minuteConfirm
        }
        clearStatus()
    }

    func selectIncident(_ code: String) {
        guard let match = selectedMatch,
              let type = match.rules.incidentTypes.first(where: { $0.code == code }) else {
            return
        }
        selectedIncidentCode = type.code
        selectedPlayerUserId = nil
        let nextRoute: Route
        if incidentMode == .create, let team = selectedTeam {
            if type.isScoring && !type.requiresPlayer(rules: match.rules) {
                nextRoute = .minuteConfirm
            } else if type.requiresPlayer(rules: match.rules), team.players.isEmpty {
                error = "Selected team has no roster players."
                return
            } else if team.players.isEmpty {
                nextRoute = .minuteConfirm
            } else {
                nextRoute = .players
            }
        } else {
            nextRoute = .incidentTeams
        }
        route = nextRoute
        clearStatus()
    }

    func selectPlayer(_ playerUserId: String?) {
        selectedPlayerUserId = playerUserId
        route = .minuteConfirm
        clearStatus()
    }

    func adjustMinute(_ delta: Int) {
        let nextMinute = max(1, incidentMinute + delta)
        incidentMinute = nextMinute
        incidentClockSeconds = secondsForMinute(nextMinute)
        clearStatus()
    }

    func returnToIncidentEditor() {
        route = .incidentEditor
        clearStatus()
    }

    func finishIncident() {
        guard let match = selectedMatch,
              let team = selectedTeam,
              let incidentType = selectedIncidentType else {
            return
        }
        let player = selectedPlayer
        if incidentType.requiresPlayer(rules: match.rules), player == nil {
            error = "Select a player."
            return
        }
        Task {
            await self.runBusy {
                if self.incidentMode == .edit {
                    guard let incident = self.selectedIncident else {
                        throw WatchAPIError.server(status: 400, message: "Select an incident to edit.")
                    }
                    _ = try await self.repository.updateIncident(
                        match: match,
                        incident: incident,
                        teamId: team.id,
                        incidentType: incidentType,
                        player: player,
                        minute: self.incidentMinute,
                        clockSeconds: self.incidentClockSeconds
                    )
                } else {
                    _ = try await self.repository.recordIncident(
                        match: match,
                        teamId: team.id,
                        incidentType: incidentType,
                        player: player,
                        minute: self.incidentMinute,
                        clockSeconds: self.incidentClockSeconds
                    )
                }
                let wasEditing = self.incidentMode == .edit
                try await self.reloadMatches(preserveSelection: true)
                self.route = wasEditing ? .incidentList : .teamPick
                self.selectedTeamId = nil
                self.selectedIncidentCode = nil
                self.selectedPlayerUserId = nil
                self.selectedIncidentId = nil
                self.incidentMode = nil
                self.message = incidentType.isScoring ? "Score updated." : "Incident saved."
            }
        }
    }

    func cancelIncident() {
        let nextRoute: Route = incidentMode == .edit ? .incidentList : .teamPick
        clearIncidentDraft()
        route = nextRoute
        clearStatus()
    }

    private func bootstrap() async {
        await self.runBusy {
            guard let session = try await self.repository.bootstrapSession() else {
                self.route = .login
                self.isAuthenticated = false
                return
            }
            let loadedMatches = try await self.repository.loadOfficialSchedule()
            self.isAuthenticated = true
            self.currentUserId = session.userId
            self.currentUserLabel = session.label
            self.matches = loadedMatches
            self.selectedMatchId = loadedMatches.first?.id
            self.route = .matches
        }
    }

    private func runMatchAction(
        success: String?,
        route successRoute: Route = .detail,
        action: @escaping (WatchMatch) async throws -> WatchMatchDTO
    ) {
        guard let match = selectedMatch else { return }
        Task {
            await self.runBusy {
                let updated = try await action(match)
                self.replaceSelectedMatch(with: updated)
                self.route = successRoute
                self.message = success
            }
        }
    }

    private func replaceSelectedMatch(with raw: WatchMatchDTO) {
        guard let matchId = raw.resolvedId ?? selectedMatchId else {
            return
        }
        matches = matches.map { match in
            guard match.id == matchId else { return match }
            return match.updating(raw: raw, currentUserId: currentUserId)
        }
        selectedMatchId = matchId
    }

    private func beginIncidentCreate(teamId: String) {
        guard let match = selectedMatch else { return }
        let clockSeconds = repository.defaultIncidentClockSeconds(match: match)
        selectedTeamId = teamId
        selectedIncidentId = nil
        selectedIncidentCode = nil
        selectedPlayerUserId = nil
        incidentMinute = minuteForClockSeconds(clockSeconds)
        incidentClockSeconds = clockSeconds
        incidentMode = .create
        route = .incidentTypes
        clearStatus()
    }

    private func selectIncidentTeam(_ teamId: String) {
        guard let match = selectedMatch,
              [match.team1, match.team2].compactMap({ $0 }).contains(where: { $0.id == teamId }) else {
            error = "Select a match team."
            return
        }
        selectedTeamId = teamId
        selectedPlayerUserId = nil
        guard let type = selectedIncidentType else {
            route = incidentMode == .create ? .incidentTypes : .incidentEditor
            clearStatus()
            return
        }
        if type.isScoring && !type.requiresPlayer(rules: match.rules) {
            route = .minuteConfirm
        } else if type.requiresPlayer(rules: match.rules), selectedTeam?.players.isEmpty != false {
            error = "Selected team has no roster players."
            return
        } else if selectedTeam?.players.isEmpty == false {
            route = .players
        } else {
            route = .minuteConfirm
        }
        clearStatus()
    }

    private func reloadMatches(preserveSelection: Bool) async throws {
        let currentSelection = selectedMatchId
        let loadedMatches = try await repository.loadOfficialSchedule()
        matches = loadedMatches
        if preserveSelection, let currentSelection, loadedMatches.contains(where: { $0.id == currentSelection }) {
            selectedMatchId = currentSelection
        } else {
            selectedMatchId = loadedMatches.first?.id
        }
    }

    private func runBusy(_ operation: @escaping () async throws -> Void) async {
        isLoading = true
        error = nil
        do {
            try await operation()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func clearStatus() {
        error = nil
        message = nil
    }

    private func clearIncidentDraft() {
        selectedTeamId = nil
        selectedIncidentCode = nil
        selectedPlayerUserId = nil
        selectedIncidentId = nil
        incidentMinute = 1
        incidentClockSeconds = 0
        incidentMode = nil
    }
}

private func secondsForMinute(_ minute: Int) -> Int {
    (max(1, minute) - 1) * 60
}

private func minuteForClockSeconds(_ seconds: Int) -> Int {
    (max(0, seconds) / 60) + 1
}
