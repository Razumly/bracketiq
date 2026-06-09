import Foundation

@MainActor
final class WatchOfficialViewModel: ObservableObject {
    enum Route {
        case login
        case matches
        case detail
        case incidentTypes
        case players
        case minuteConfirm
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
    @Published var incidentMinute = 0
    @Published var message: String?
    @Published var error: String?

    private let repository: WatchMatchRepository

    init(repository: WatchMatchRepository) {
        self.repository = repository
        Task {
            await bootstrap()
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
        route = .detail
        clearStatus()
    }

    func back() {
        switch route {
        case .login, .matches:
            break
        case .detail:
            route = .matches
        case .incidentTypes:
            selectedTeamId = nil
            route = .detail
        case .players:
            selectedPlayerUserId = nil
            route = .incidentTypes
        case .minuteConfirm:
            if selectedTeam?.players.isEmpty == false {
                route = .players
            } else {
                route = .incidentTypes
            }
        }
    }

    func checkIn() {
        runMatchAction(success: "Checked in.") { try await self.repository.checkIn(match: $0) }
    }

    func startTimer() {
        runMatchAction(success: "Timer started.") { try await self.repository.startCurrentSegment(match: $0) }
    }

    func resetTimer() {
        runMatchAction(success: "Timer reset.") { try await self.repository.resetCurrentSegment(match: $0) }
    }

    func endSegment() {
        runMatchAction(success: "Segment ended.") { try await self.repository.endCurrentSegment(match: $0) }
    }

    func startNextSegment() {
        runMatchAction(success: "Next segment started.") { try await self.repository.startNextSegmentOrOvertime(match: $0) }
    }

    func endMatch() {
        runMatchAction(success: "Match ended.") { try await self.repository.endMatch(match: $0) }
    }

    func selectTeam(_ teamId: String) {
        selectedTeamId = teamId
        selectedIncidentCode = nil
        selectedPlayerUserId = nil
        route = .incidentTypes
        clearStatus()
    }

    func selectIncident(_ code: String) {
        guard let match = selectedMatch,
              let team = selectedTeam,
              let type = match.rules.incidentTypes.first(where: { $0.code == code }) else {
            return
        }
        if type.isScoring && !type.requiresPlayer(rules: match.rules) {
            confirmIncident(typeOverride: type, playerOverride: nil, skipMinute: true)
            return
        }
        let requiresPlayer = type.requiresPlayer(rules: match.rules)
        if requiresPlayer && team.players.isEmpty {
            error = "Selected team has no roster players."
            return
        }
        selectedIncidentCode = type.code
        selectedPlayerUserId = nil
        incidentMinute = repository.defaultIncidentMinute(match: match)
        route = team.players.isEmpty ? .minuteConfirm : .players
        clearStatus()
    }

    func selectPlayer(_ playerUserId: String?) {
        selectedPlayerUserId = playerUserId
        route = .minuteConfirm
        clearStatus()
    }

    func adjustMinute(_ delta: Int) {
        incidentMinute = max(0, incidentMinute + delta)
    }

    func confirmIncident(
        typeOverride: WatchIncidentTypeDefinitionDTO? = nil,
        playerOverride: WatchPlayer? = nil,
        skipMinute: Bool = false
    ) {
        guard let match = selectedMatch,
              let team = selectedTeam,
              let incidentType = typeOverride ?? selectedIncidentType else {
            return
        }
        let player = playerOverride ?? selectedPlayer
        if incidentType.requiresPlayer(rules: match.rules), player == nil {
            error = "Select a player."
            return
        }
        Task {
            await self.runBusy {
                _ = try await self.repository.recordIncident(
                    match: match,
                    teamId: team.id,
                    incidentType: incidentType,
                    player: player,
                    minute: skipMinute ? self.repository.defaultIncidentMinute(match: match) : self.incidentMinute
                )
                try await self.reloadMatches(preserveSelection: true)
                self.route = .detail
                self.selectedTeamId = nil
                self.selectedIncidentCode = nil
                self.selectedPlayerUserId = nil
                self.message = incidentType.isScoring ? "Score updated." : "Incident saved."
            }
        }
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

    private func runMatchAction(success: String, action: @escaping (WatchMatch) async throws -> WatchMatchDTO) {
        guard let match = selectedMatch else { return }
        Task {
            await self.runBusy {
                _ = try await action(match)
                try await self.reloadMatches(preserveSelection: true)
                self.route = .detail
                self.message = success
            }
        }
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
}
