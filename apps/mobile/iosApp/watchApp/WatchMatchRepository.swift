import Foundation

final class WatchMatchRepository {
    private let api: WatchAPIClient
    private let tokenStore: WatchTokenStore

    init(api: WatchAPIClient, tokenStore: WatchTokenStore) {
        self.api = api
        self.tokenStore = tokenStore
    }

    func bootstrapSession() async throws -> WatchSession? {
        guard !tokenStore.token.isEmpty else {
            return nil
        }
        let response: WatchAuthResponseDTO = try await api.get("api/auth/me")
        guard let userId = response.resolvedUserId else {
            tokenStore.clear()
            return nil
        }
        let label = response.resolvedLabel ?? tokenStore.currentUserLabel ?? userId
        tokenStore.save(token: response.token.trimmedOrNil ?? tokenStore.token, userId: userId, label: label)
        return WatchSession(userId: userId, label: label)
    }

    func login(email: String, password: String) async throws -> WatchSession {
        let response: WatchAuthResponseDTO = try await api.post(
            "api/auth/login",
            body: WatchLoginRequest(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
        )
        if let error = response.error?.trimmedOrNil {
            throw WatchAPIError.server(status: 400, message: error)
        }
        guard let token = response.token.trimmedOrNil else {
            throw WatchAPIError.missingSessionToken
        }
        guard let userId = response.resolvedUserId else {
            throw WatchAPIError.missingUserId
        }
        let label = response.resolvedLabel ?? userId
        tokenStore.save(token: token, userId: userId, label: label)
        return WatchSession(userId: userId, label: label)
    }

    func logout() {
        tokenStore.clear()
    }

    func loadOfficialSchedule() async throws -> [WatchMatch] {
        let sessionUserId: String
        if let currentUserId = tokenStore.currentUserId {
            sessionUserId = currentUserId
        } else if let session = try await bootstrapSession() {
            sessionUserId = session.userId
        } else {
            throw WatchAPIError.server(status: 401, message: "Sign in again before loading matches.")
        }

        let schedule: WatchScheduleResponseDTO = try await api.get("api/profile/schedule")
        let detailMatches = await fetchOfficialEventDetailMatches(events: schedule.events, sessionUserId: sessionUserId)
        let allMatches = Dictionary(
            (schedule.matches + detailMatches).compactMap { match -> (String, WatchMatchDTO)? in
                guard let id = match.resolvedId else { return nil }
                return (id, match)
            },
            uniquingKeysWith: { _, newest in newest }
        ).values

        let playerIds = schedule.teams.flatMap { team -> [String] in
            let registered = (team.playerRegistrations ?? []).compactMap(\.participantUserId)
            if !registered.isEmpty {
                return registered
            }
            return team.playerIds ?? []
        }
        let usersById = try await fetchUsers(userIds: playerIds)
        let teamsById = Dictionary(
            schedule.teams.compactMap { team -> (String, WatchTeam)? in
                guard let id = team.resolvedId else { return nil }
                return (id, team.toWatchTeam(usersById: usersById))
            },
            uniquingKeysWith: { _, newest in newest }
        )
        let eventsById = Dictionary(
            schedule.events.compactMap { event -> (String, WatchEventDTO)? in
                guard let id = event.resolvedId else { return nil }
                return (id, event)
            },
            uniquingKeysWith: { _, newest in newest }
        )
        let fieldsById = Dictionary(
            schedule.fields.compactMap { field -> (String, WatchFieldDTO)? in
                guard let id = field.resolvedId else { return nil }
                return (id, field)
            },
            uniquingKeysWith: { _, newest in newest }
        )

        return allMatches
            .filter { $0.isAssignedOfficial(userId: sessionUserId) }
            .compactMap { match -> WatchMatch? in
                guard let id = match.resolvedId, let eventId = match.eventId.trimmedOrNil else {
                    return nil
                }
                let event = eventsById[eventId]
                let rules = match.matchRulesSnapshot
                    ?? match.resolvedMatchRules
                    ?? event?.rules()
                    ?? WatchResolvedMatchRulesDTO()
                return WatchMatch(
                    id: id,
                    number: match.matchId ?? 0,
                    eventId: eventId,
                    eventName: event?.name.trimmedOrNil ?? "Match",
                    startIso: match.start,
                    endIso: match.end,
                    fieldLabel: match.fieldId.trimmedOrNil.flatMap { fieldsById[$0]?.label },
                    division: match.division.trimmedOrNil,
                    status: match.status,
                    team1: match.team1Id.trimmedOrNil.flatMap { teamsById[$0] },
                    team2: match.team2Id.trimmedOrNil.flatMap { teamsById[$0] },
                    officialCheckedIn: match.isUserCheckedIn(userId: sessionUserId),
                    rules: rules,
                    raw: match
                )
            }
            .sorted { left, right in
                (left.startIso ?? "", left.number) < (right.startIso ?? "", right.number)
            }
    }

    func checkIn(match: WatchMatch) async throws -> WatchMatchDTO {
        var checkIn: [String: Any] = ["checkedIn": true]
        if let userId = tokenStore.currentUserId {
            checkIn["userId"] = userId
            if let assignment = match.raw.assignmentForUser(userId: userId) {
                if let positionId = assignment.positionId.trimmedOrNil {
                    checkIn["positionId"] = positionId
                }
                if let slotIndex = assignment.slotIndex {
                    checkIn["slotIndex"] = slotIndex
                }
            }
        }
        return try await patchMatch(match: match, body: ["officialCheckIn": checkIn])
    }

    func startCurrentSegment(match: WatchMatch) async throws -> WatchMatchDTO {
        let now = ISO8601DateFormatter.api.string(from: Date())
        let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules)
        let sequence = segment?.sequence ?? match.raw.nextPlayableSequence(rules: match.rules) ?? 1
        return try await patchMatch(match: match, body: [
            "lifecycle": [
                "status": "IN_PROGRESS",
                "actualStart": match.raw.actualStart.trimmedOrNil == nil ? now : NSNull()
            ].filterNullValues(),
            "segmentOperations": [
                segmentOperation(
                    segment: segment,
                    match: match,
                    sequence: sequence,
                    status: "IN_PROGRESS",
                    startedAt: now,
                    clearEndedAt: true
                )
            ]
        ])
    }

    func resetCurrentSegment(match: WatchMatch) async throws -> WatchMatchDTO {
        guard let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules) else {
            return match.raw
        }
        var body: [String: Any] = [
            "segmentOperations": [
                segmentOperation(
                    segment: segment,
                    match: match,
                    sequence: segment.sequence,
                    status: "NOT_STARTED",
                    clearStartedAt: true,
                    clearEndedAt: true,
                    clearWinner: true
                )
            ]
        ]
        if segment.sequence == 1 && !match.raw.segments.contains(where: { $0.sequence < segment.sequence && $0.status.uppercased() == "COMPLETE" }) {
            body["lifecycle"] = [
                "status": "SCHEDULED",
                "actualStart": NSNull(),
                "actualEnd": NSNull()
            ]
        }
        return try await patchMatch(match: match, body: body)
    }

    func endCurrentSegment(match: WatchMatch) async throws -> WatchMatchDTO {
        guard let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules) else {
            return match.raw
        }
        return try await patchMatch(match: match, body: [
            "segmentOperations": [
                segmentOperation(
                    segment: segment,
                    match: match,
                    sequence: segment.sequence,
                    status: "COMPLETE",
                    endedAt: ISO8601DateFormatter.api.string(from: Date())
                )
            ]
        ])
    }

    func startNextSegmentOrOvertime(match: WatchMatch) async throws -> WatchMatchDTO {
        if match.raw.activeSegment != nil {
            throw WatchAPIError.server(status: 400, message: "End the active segment before starting the next one.")
        }
        let segment = match.raw.nextPlayableSegment(rules: match.rules)
        let sequence = segment?.sequence
            ?? match.raw.nextPlayableSequence(rules: match.rules)
            ?? ((match.rules.supportsOvertime || match.rules.canUseOvertime) ? ((match.raw.segments.map(\.sequence).max() ?? 0) + 1) : nil)
        guard let sequence else {
            throw WatchAPIError.server(status: 400, message: "No remaining segment is available.")
        }
        let now = ISO8601DateFormatter.api.string(from: Date())
        return try await patchMatch(match: match, body: [
            "lifecycle": [
                "status": "IN_PROGRESS",
                "actualStart": match.raw.actualStart.trimmedOrNil == nil ? now : NSNull()
            ].filterNullValues(),
            "segmentOperations": [
                segmentOperation(
                    segment: segment,
                    match: match,
                    sequence: sequence,
                    status: "IN_PROGRESS",
                    startedAt: now,
                    clearEndedAt: true
                )
            ]
        ])
    }

    func endMatch(match: WatchMatch) async throws -> WatchMatchDTO {
        let now = ISO8601DateFormatter.api.string(from: Date())
        var body: [String: Any] = [
            "finalize": true,
            "time": now,
            "lifecycle": ["actualEnd": now]
        ]
        if let active = match.raw.activeSegment {
            body["segmentOperations"] = [
                segmentOperation(
                    segment: active,
                    match: match,
                    sequence: active.sequence,
                    status: "COMPLETE",
                    endedAt: now
                )
            ]
        }
        return try await patchMatch(match: match, body: body)
    }

    func recordIncident(
        match: WatchMatch,
        teamId: String,
        incidentType: WatchIncidentTypeDefinitionDTO,
        player: WatchPlayer?,
        minute: Int
    ) async throws -> WatchMatchDTO {
        let linkedPointDelta = (incidentType.linkedPointDelta ?? 0) == 0 ? nil : incidentType.linkedPointDelta
        if incidentType.isScoring, let linkedPointDelta, !match.rules.pointIncidentRequiresParticipant {
            return try await incrementScore(match: match, teamId: teamId, delta: linkedPointDelta)
        }

        guard let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules) else {
            throw WatchAPIError.server(status: 400, message: "Start a segment before recording an incident.")
        }
        let clockDetails = incidentClockDetails(forMinute: minute, segment: segment, rules: match.rules)
        var operation: [String: Any] = [
            "action": "CREATE",
            "id": "watch_\(UUID().uuidString)",
            "segmentId": segment.resolvedId,
            "eventTeamId": teamId,
            "incidentType": incidentType.code,
            "minute": clockDetails.minute,
            "clock": clockDetails.clock,
            "clockSeconds": clockDetails.clockSeconds
        ]
        if let eventRegistrationId = player?.eventRegistrationId.trimmedOrNil {
            operation["eventRegistrationId"] = eventRegistrationId
        }
        if let participantUserId = player?.participantUserId.trimmedOrNil {
            operation["participantUserId"] = participantUserId
        }
        if let officialUserId = tokenStore.currentUserId {
            operation["officialUserId"] = officialUserId
        }
        if let linkedPointDelta {
            operation["linkedPointDelta"] = linkedPointDelta
        }
        return try await patchMatch(match: match, body: ["incidentOperations": [operation]])
    }

    func defaultIncidentMinute(match: WatchMatch) -> Int {
        guard let segment = match.raw.activeSegment,
              let startedAt = segment.startedAt.flatMap(Date.apiDate(from:)) else {
            return 0
        }
        let endedAt = segment.endedAt.flatMap(Date.apiDate(from:)) ?? Date()
        let elapsedSeconds = max(0, Int(endedAt.timeIntervalSince(startedAt)))
        let configuredDuration = match.rules.timekeeping.segmentDurationMinutesBySequence[safe: segment.sequence - 1]
            ?? match.rules.timekeeping.segmentDurationMinutes
        let regulationOffsetSeconds = regulationOffsetSeconds(for: segment, rules: match.rules)
        let boundedSeconds: Int
        if match.rules.timekeeping.stopAtRegulationEnd, let configuredDuration, configuredDuration > 0 {
            boundedSeconds = min(elapsedSeconds, configuredDuration * 60)
        } else {
            boundedSeconds = elapsedSeconds
        }
        let clockSeconds = match.rules.timekeeping.addedTimeEnabled
            ? regulationOffsetSeconds + boundedSeconds
            : boundedSeconds
        return Int(ceil(Double(clockSeconds) / 60.0))
    }

    private func incrementScore(match: WatchMatch, teamId: String, delta: Int) async throws -> WatchMatchDTO {
        var rawMatch = match.raw
        var segment = rawMatch.activeSegment ?? rawMatch.nextPlayableSegment(rules: match.rules)
        if segment == nil {
            rawMatch = try await startCurrentSegment(match: match)
            segment = rawMatch.activeSegment ?? rawMatch.nextPlayableSegment(rules: match.rules)
        }
        let sequence = segment?.sequence ?? rawMatch.nextPlayableSequence(rules: match.rules) ?? 1
        let currentPoints = segment?.scores[teamId] ?? 0
        let response: WatchMatchResponseDTO = try await api.post(
            "api/events/\(match.eventId)/matches/\(match.id)/score",
            body: WatchScoreSetDTO(
                segmentId: segment?.resolvedId,
                sequence: sequence,
                eventTeamId: teamId,
                points: max(0, currentPoints + delta)
            )
        )
        guard let updated = response.match else {
            throw WatchAPIError.missingUpdatedMatch
        }
        return updated
    }

    private func patchMatch(match: WatchMatch, body: [String: Any]) async throws -> WatchMatchDTO {
        let response: WatchMatchResponseDTO = try await api.patchJSON(
            "api/events/\(match.eventId)/matches/\(match.id)",
            object: body
        )
        guard let updated = response.match else {
            throw WatchAPIError.missingUpdatedMatch
        }
        return updated
    }

    private func fetchUsers(userIds: [String]) async throws -> [String: WatchUserProfileDTO] {
        let uniqueIds = Array(Set(userIds.compactMap(\.trimmedOrNil))).sorted()
        guard !uniqueIds.isEmpty else {
            return [:]
        }
        var users: [WatchUserProfileDTO] = []
        for chunk in uniqueIds.chunked(size: 50) {
            let encoded = chunk
                .map { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0 }
                .joined(separator: ",")
            let response: WatchUsersResponseDTO = try await api.get("api/users?ids=\(encoded)")
            users.append(contentsOf: response.users)
        }
        return Dictionary(
            users.compactMap { user -> (String, WatchUserProfileDTO)? in
                guard let id = user.resolvedId else { return nil }
                return (id, user)
            },
            uniquingKeysWith: { _, newest in newest }
        )
    }

    private func fetchOfficialEventDetailMatches(events: [WatchEventDTO], sessionUserId: String) async -> [WatchMatchDTO] {
        let eventIds = events
            .filter { $0.isOfficialOrHostEvent(for: sessionUserId) }
            .compactMap(\.resolvedId)
        guard !eventIds.isEmpty else {
            return []
        }
        var matches: [WatchMatchDTO] = []
        for eventId in Array(Set(eventIds)).sorted() {
            if let response: WatchEventDetailResponseDTO = try? await api.get("api/events/\(eventId)/detail") {
                matches.append(contentsOf: response.matches)
            }
        }
        return matches
    }
}

struct WatchSession {
    let userId: String
    let label: String
}

private extension WatchTeamDTO {
    func toWatchTeam(usersById: [String: WatchUserProfileDTO]) -> WatchTeam {
        let registeredPlayers = (playerRegistrations ?? []).compactMap { registration -> WatchPlayer? in
            guard let userId = registration.participantUserId else {
                return nil
            }
            return WatchPlayer(
                participantUserId: userId,
                eventRegistrationId: registration.id.trimmedOrNil,
                label: usersById[userId]?.label ?? userId,
                jerseyNumber: registration.jerseyNumber.trimmedOrNil
            )
        }
        let fallbackPlayers = (playerIds ?? []).compactMap { rawUserId -> WatchPlayer? in
            guard let userId = rawUserId.trimmedOrNil else {
                return nil
            }
            return WatchPlayer(
                participantUserId: userId,
                eventRegistrationId: nil,
                label: usersById[userId]?.label ?? userId,
                jerseyNumber: nil
            )
        }
        let players = registeredPlayers.isEmpty ? fallbackPlayers : registeredPlayers
        return WatchTeam(
            id: resolvedId ?? "",
            label: label,
            players: Array(Dictionary(grouping: players, by: \.participantUserId).compactMap { $0.value.first })
        )
    }
}

extension WatchMatchDTO {
    var orderedSegments: [WatchMatchSegmentDTO] {
        segments.sorted { $0.sequence < $1.sequence }
    }

    var activeSegment: WatchMatchSegmentDTO? {
        orderedSegments.first { $0.status.uppercased() == "IN_PROGRESS" }
    }

    func nextPlayableSegment(rules: WatchResolvedMatchRulesDTO) -> WatchMatchSegmentDTO? {
        orderedSegments.first { $0.status.uppercased() != "COMPLETE" }
    }

    func nextPlayableSequence(rules: WatchResolvedMatchRulesDTO) -> Int? {
        let ordered = orderedSegments
        if ordered.isEmpty {
            return 1
        }
        if let next = ordered.first(where: { $0.status.uppercased() != "COMPLETE" }) {
            return next.sequence
        }
        let maxSequence = ordered.map(\.sequence).max() ?? 0
        return maxSequence < max(1, rules.segmentCount) ? maxSequence + 1 : nil
    }

    func isAssignedOfficial(userId: String) -> Bool {
        let normalized = userId.trimmedOrNil
        guard let normalized else {
            return false
        }
        if officialId.trimmedOrNil == normalized {
            return true
        }
        return officialIds.contains { $0.userId.trimmedOrNil == normalized }
    }

    func isUserCheckedIn(userId: String) -> Bool {
        let normalized = userId.trimmedOrNil
        guard let normalized else {
            return false
        }
        if let assignment = officialIds.first(where: { $0.userId.trimmedOrNil == normalized }) {
            return assignment.checkedIn == true
        }
        return officialId.trimmedOrNil == normalized && officialCheckedIn == true
    }

    func assignmentForUser(userId: String?) -> WatchOfficialAssignmentDTO? {
        guard let userId = userId.trimmedOrNil else {
            return nil
        }
        return officialIds.first { $0.userId.trimmedOrNil == userId }
    }
}

private extension WatchEventDTO {
    func isOfficialOrHostEvent(for userId: String) -> Bool {
        guard let normalizedUserId = userId.trimmedOrNil else {
            return false
        }
        return hostId.trimmedOrNil == normalizedUserId
            || (assistantHostIds ?? []).contains { $0.trimmedOrNil == normalizedUserId }
            || (officialIds ?? []).contains { $0.trimmedOrNil == normalizedUserId }
    }
}

private extension Dictionary where Key == String, Value == Any {
    func filterNullValues() -> [String: Any] {
        filter { !($0.value is NSNull) }
    }
}

private func segmentOperation(
    segment: WatchMatchSegmentDTO?,
    match: WatchMatch,
    sequence: Int,
    status: String,
    startedAt: String? = nil,
    endedAt: String? = nil,
    clearStartedAt: Bool = false,
    clearEndedAt: Bool = false,
    clearWinner: Bool = false
) -> [String: Any] {
    var operation: [String: Any] = [
        "sequence": sequence,
        "status": status
    ]
    if let segment {
        operation["id"] = segment.resolvedId
    }
    var scores = segment?.scores ?? [:]
    if let team1Id = match.team1?.id, scores[team1Id] == nil {
        scores[team1Id] = 0
    }
    if let team2Id = match.team2?.id, scores[team2Id] == nil {
        scores[team2Id] = 0
    }
    operation["scores"] = scores

    if let startedAt {
        operation["startedAt"] = startedAt
    } else if clearStartedAt {
        operation["startedAt"] = NSNull()
    }
    if let endedAt {
        operation["endedAt"] = endedAt
    } else if clearEndedAt {
        operation["endedAt"] = NSNull()
    }
    if clearWinner {
        operation["winnerEventTeamId"] = NSNull()
    } else if let winner = segment?.winnerEventTeamId.trimmedOrNil {
        operation["winnerEventTeamId"] = winner
    }
    return operation
}

private func formatClock(seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    let hours = safeSeconds / 3600
    let minutes = (safeSeconds % 3600) / 60
    let remainder = safeSeconds % 60
    if hours > 0 {
        return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", remainder))"
    }
    return "\(String(format: "%02d", minutes)):\(String(format: "%02d", remainder))"
}

private func formatClockAsMinutes(seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    let minutes = safeSeconds / 60
    let remainder = safeSeconds % 60
    return "\(minutes):\(String(format: "%02d", remainder))"
}

private func durationSeconds(forSequence sequence: Int, rules: WatchResolvedMatchRulesDTO) -> Int? {
    let durationMinutes = rules.timekeeping.segmentDurationMinutesBySequence[safe: sequence - 1]
        ?? rules.timekeeping.segmentDurationMinutes
    guard let durationMinutes, durationMinutes > 0 else {
        return nil
    }
    return durationMinutes * 60
}

private func regulationOffsetSeconds(for segment: WatchMatchSegmentDTO, rules: WatchResolvedMatchRulesDTO) -> Int {
    guard rules.timekeeping.addedTimeEnabled else {
        return 0
    }
    let sequence = max(1, segment.sequence)
    guard sequence > 1 else {
        return 0
    }
    return (1..<sequence).reduce(0) { total, index in
        total + (durationSeconds(forSequence: index, rules: rules) ?? 0)
    }
}

private func formatAddedTimeIncidentClock(regulationEndSeconds: Int, addedSeconds: Int) -> String {
    let regulationMinute = max(0, regulationEndSeconds / 60)
    let addedMinute = max(1, (max(1, addedSeconds) + 59) / 60)
    return "\(regulationMinute)+\(addedMinute)"
}

private func incidentClockDetails(
    forMinute minute: Int,
    segment: WatchMatchSegmentDTO,
    rules: WatchResolvedMatchRulesDTO
) -> (minute: Int, clock: String, clockSeconds: Int) {
    let safeMinute = max(0, minute)
    let clockSeconds = safeMinute * 60
    guard rules.timekeeping.addedTimeEnabled,
          let durationSeconds = durationSeconds(forSequence: segment.sequence, rules: rules) else {
        return (safeMinute, formatClock(seconds: clockSeconds), clockSeconds)
    }
    let regulationOffsetSeconds = regulationOffsetSeconds(for: segment, rules: rules)
    let regulationEndSeconds = regulationOffsetSeconds + durationSeconds
    if clockSeconds > regulationEndSeconds {
        return (
            safeMinute,
            formatAddedTimeIncidentClock(regulationEndSeconds: regulationEndSeconds, addedSeconds: clockSeconds - regulationEndSeconds),
            clockSeconds
        )
    }
    return (safeMinute, formatClockAsMinutes(seconds: clockSeconds), clockSeconds)
}

private extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }

    func chunked(size: Int) -> [[Element]] {
        guard size > 0 else { return [self] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}

extension ISO8601DateFormatter {
    static let api: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let apiNoFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

extension Date {
    static func apiDate(from raw: String) -> Date? {
        ISO8601DateFormatter.api.date(from: raw) ?? ISO8601DateFormatter.apiNoFractionalSeconds.date(from: raw)
    }
}
