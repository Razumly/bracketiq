import Foundation
import Network

final class WatchMatchRepository {
    private let api: WatchAPIClient
    private let tokenStore: WatchTokenStore
    private let operationStore: WatchMatchOperationStore
    private let syncStateLock = NSLock()
    private var isSyncingPendingOperations = false
    private var pendingSyncRequested = false
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "com.razumly.mvp.watch.match-operation-network")

    init(
        api: WatchAPIClient,
        tokenStore: WatchTokenStore,
        operationStore: WatchMatchOperationStore = WatchMatchOperationStore()
    ) {
        self.api = api
        self.tokenStore = tokenStore
        self.operationStore = operationStore
    }

    func startNetworkRetryMonitor() {
        guard networkMonitor == nil else {
            return
        }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else {
                return
            }
            self?.schedulePendingSync()
        }
        networkMonitor = monitor
        monitor.start(queue: networkMonitorQueue)
        schedulePendingSync()
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
        schedulePendingSync()
        return WatchSession(userId: userId, label: label)
    }

    func login(email: String, password: String) async throws -> WatchSession {
        let response: WatchAuthResponseDTO = try await api.post(
            "api/auth/login",
            body: WatchLoginRequest(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
        )
        return try saveAuthResponse(response, fallbackLabel: nil)
    }

    func exchangeWatchSetupToken(_ setupToken: String) async throws -> WatchSession {
        let response: WatchAuthResponseDTO = try await api.post(
            "api/auth/watch/exchange",
            body: WatchExchangeRequest(setupToken: setupToken)
        )
        return try saveAuthResponse(response, fallbackLabel: tokenStore.currentUserLabel)
    }

    private func saveAuthResponse(_ response: WatchAuthResponseDTO, fallbackLabel: String?) throws -> WatchSession {
        if let error = response.error?.trimmedOrNil {
            throw WatchAPIError.server(status: 400, message: error)
        }
        guard let token = response.token.trimmedOrNil else {
            throw WatchAPIError.missingSessionToken
        }
        guard let userId = response.resolvedUserId else {
            throw WatchAPIError.missingUserId
        }
        let label = response.resolvedLabel ?? fallbackLabel ?? userId
        tokenStore.save(token: token, userId: userId, label: label)
        schedulePendingSync()
        return WatchSession(userId: userId, label: label)
    }

    func logout() {
        tokenStore.clear()
        operationStore.clear()
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

        let matches = allMatches
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
        return try matches.map { match in
            try applyPendingOperations(to: match, currentUserId: sessionUserId)
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
        return try patchMatchLocalFirst(match: match, body: ["officialCheckIn": checkIn])
    }

    func startCurrentSegment(match: WatchMatch) async throws -> WatchMatchDTO {
        let now = ISO8601DateFormatter.api.string(from: Date())
        let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules)
        let sequence = segment?.sequence ?? match.raw.nextPlayableSequence(rules: match.rules) ?? 1
        return try patchMatchLocalFirst(match: match, body: [
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
        return try patchMatchLocalFirst(match: match, body: body)
    }

    func endCurrentSegment(match: WatchMatch) async throws -> WatchMatchDTO {
        guard let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules) else {
            return match.raw
        }
        return try patchMatchLocalFirst(match: match, body: [
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
        return try patchMatchLocalFirst(match: match, body: [
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
        return try patchMatchLocalFirst(match: match, body: body)
    }

    func recordIncident(
        match: WatchMatch,
        teamId: String,
        incidentType: WatchIncidentTypeDefinitionDTO,
        player: WatchPlayer?,
        minute: Int,
        clockSeconds: Int? = nil
    ) async throws -> WatchMatchDTO {
        let linkedPointDelta = (incidentType.linkedPointDelta ?? 0) == 0 ? nil : incidentType.linkedPointDelta
        if incidentType.isScoring, let linkedPointDelta, !match.rules.pointIncidentRequiresParticipant {
            return try await incrementScore(match: match, teamId: teamId, delta: linkedPointDelta)
        }

        guard let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules) else {
            throw WatchAPIError.server(status: 400, message: "Start a segment before recording an incident.")
        }
        let clockDetails = incidentClockDetails(
            clockSeconds: clockSeconds ?? secondsForMinute(minute),
            segment: segment,
            rules: match.rules
        )
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
        return try patchMatchLocalFirst(match: match, body: ["incidentOperations": [operation]])
    }

    func updateIncident(
        match: WatchMatch,
        incident: WatchMatchIncidentDTO,
        teamId: String,
        incidentType: WatchIncidentTypeDefinitionDTO,
        player: WatchPlayer?,
        minute: Int,
        clockSeconds: Int
    ) async throws -> WatchMatchDTO {
        guard let segment = incident.segmentId.trimmedOrNil.flatMap({ segmentId in
            match.raw.segments.first { $0.resolvedId == segmentId }
        }) ?? match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules) else {
            throw WatchAPIError.server(status: 400, message: "Start a segment before editing an incident.")
        }
        let linkedPointDelta = incidentType.isScoring && incidentType.requiresPlayer(rules: match.rules)
            ? ((incidentType.linkedPointDelta ?? 0) == 0 ? nil : incidentType.linkedPointDelta)
            : nil
        let clockDetails = incidentClockDetails(clockSeconds: clockSeconds, segment: segment, rules: match.rules)
        var operation: [String: Any] = [
            "action": "UPDATE",
            "id": incident.resolvedId,
            "segmentId": segment.resolvedId,
            "eventTeamId": teamId,
            "incidentType": incidentType.code,
            "minute": clockDetails.minute,
            "clock": clockDetails.clock,
            "clockSeconds": clockDetails.clockSeconds,
            "eventRegistrationId": NSNull(),
            "participantUserId": NSNull(),
            "linkedPointDelta": NSNull()
        ]
        if let linkedPointDelta {
            operation["linkedPointDelta"] = linkedPointDelta
        }
        if let eventRegistrationId = player?.eventRegistrationId.trimmedOrNil {
            operation["eventRegistrationId"] = eventRegistrationId
        }
        if let participantUserId = player?.participantUserId.trimmedOrNil {
            operation["participantUserId"] = participantUserId
        }
        if let officialUserId = tokenStore.currentUserId {
            operation["officialUserId"] = officialUserId
        }
        return try patchMatchLocalFirst(match: match, body: ["incidentOperations": [operation]])
    }

    func defaultIncidentMinute(match: WatchMatch) -> Int {
        minuteForClockSeconds(defaultIncidentClockSeconds(match: match))
    }

    func defaultIncidentClockSeconds(match: WatchMatch) -> Int {
        guard let segment = match.raw.activeSegment,
              let startedAt = segment.startedAt.flatMap(Date.apiDate(from:)) else {
            return 0
        }
        let endedAt = segment.endedAt.flatMap(Date.apiDate(from:)) ?? Date()
        let elapsedSeconds = max(0, Int(endedAt.timeIntervalSince(startedAt)))
        let durationSeconds = durationSeconds(forSequence: segment.sequence, rules: match.rules)
        let boundedSeconds: Int
        if match.rules.timekeeping.stopAtRegulationEnd,
           !match.rules.timekeeping.addedTimeEnabled,
           let durationSeconds {
            boundedSeconds = min(elapsedSeconds, durationSeconds)
        } else {
            boundedSeconds = elapsedSeconds
        }
        let regulationOffset = match.rules.timekeeping.addedTimeEnabled
            ? regulationOffsetSeconds(for: segment, rules: match.rules)
            : 0
        return max(0, regulationOffset + boundedSeconds)
    }

    private func incrementScore(match: WatchMatch, teamId: String, delta: Int) async throws -> WatchMatchDTO {
        let segment = match.raw.activeSegment ?? match.raw.nextPlayableSegment(rules: match.rules)
        let sequence = segment?.sequence ?? match.raw.nextPlayableSequence(rules: match.rules) ?? 1
        let currentPoints = segment?.scores[teamId] ?? 0
        var scores = segment?.scores ?? [:]
        scores[teamId] = max(0, currentPoints + delta)
        let now = ISO8601DateFormatter.api.string(from: Date())
        var body: [String: Any] = [
            "segmentOperations": [
                segmentOperation(
                    segment: segment,
                    match: match,
                    sequence: sequence,
                    status: "IN_PROGRESS",
                    startedAt: segment?.startedAt.trimmedOrNil == nil ? now : nil,
                    clearEndedAt: true,
                    scoresOverride: scores
                )
            ]
        ]
        if match.raw.actualStart.trimmedOrNil == nil {
            body["lifecycle"] = [
                "status": "IN_PROGRESS",
                "actualStart": now
            ]
        }
        return try patchMatchLocalFirst(match: match, body: body)
    }

    private func patchMatch(match: WatchMatch, body: [String: Any]) async throws -> WatchMatchDTO {
        try await patchMatch(eventId: match.eventId, matchId: match.id, body: body)
    }

    private func patchMatch(eventId: String, matchId: String, body: [String: Any]) async throws -> WatchMatchDTO {
        let response: WatchMatchResponseDTO = try await api.patchJSON(
            "api/events/\(eventId)/matches/\(matchId)",
            object: body
        )
        guard let updated = response.match else {
            throw WatchAPIError.missingUpdatedMatch
        }
        return updated
    }

    private func patchMatchLocalFirst(match: WatchMatch, body: [String: Any]) throws -> WatchMatchDTO {
        let provisional = try operationStore.newOperation(eventId: match.eventId, matchId: match.id)
        let payload = body.withClientOperation(provisional)
        guard let payloadJson = payload.jsonString() else {
            let local = applyLocalPatch(match: match, body: body)
            Task { _ = try? await patchMatch(match: match, body: body) }
            return local
        }
        let operation = provisional.withPayload(payloadJson)
        let local = applyLocalPatch(match: match, body: payload)
        try operationStore.upsertOperation(operation)
        schedulePendingSync(matchId: match.id)
        return local
    }

    @discardableResult
    func syncPendingOperations(matchId: String? = nil) async throws -> Int {
        guard beginPendingSync() else {
            return 0
        }
        defer { endPendingSync() }

        var syncedCount = 0
        for operation in try operationStore.pendingOperations(matchId: matchId) {
            try operationStore.markAttempting(operation.id)
            guard let body = operation.payloadBody else {
                try operationStore.markFailed(operation.id, error: "Pending match operation payload is invalid.")
                break
            }
            do {
                _ = try await patchMatch(eventId: operation.eventId, matchId: operation.matchId, body: body)
                try operationStore.markAcked(operation.id)
                syncedCount += 1
            } catch {
                try operationStore.markFailed(operation.id, error: error.localizedDescription)
                break
            }
        }
        return syncedCount
    }

    private func schedulePendingSync(matchId: String? = nil) {
        let hasPendingOperations: Bool
        do {
            hasPendingOperations = try !operationStore.pendingOperations(matchId: matchId).isEmpty
        } catch {
            NSLog("Watch score update queue is unreadable: %@", error.localizedDescription)
            return
        }
        guard hasPendingOperations else {
            return
        }
        Task { [weak self] in
            do {
                _ = try await self?.syncPendingOperations(matchId: matchId)
            } catch {
                NSLog("Watch score update queue sync failed: %@", error.localizedDescription)
            }
        }
    }

    private func beginPendingSync() -> Bool {
        syncStateLock.lock()
        defer { syncStateLock.unlock() }
        guard !isSyncingPendingOperations else {
            pendingSyncRequested = true
            return false
        }
        isSyncingPendingOperations = true
        return true
    }

    private func endPendingSync() {
        syncStateLock.lock()
        let shouldScheduleAgain = pendingSyncRequested
        pendingSyncRequested = false
        isSyncingPendingOperations = false
        syncStateLock.unlock()
        if shouldScheduleAgain {
            schedulePendingSync()
        }
    }

    private func applyPendingOperations(to match: WatchMatch, currentUserId: String?) throws -> WatchMatch {
        let operations = try operationStore.pendingOperations(matchId: match.id)
        guard !operations.isEmpty else {
            return match
        }
        let raw = operations.reduce(match.raw) { currentRaw, operation in
            guard let body = operation.payloadBody else {
                return currentRaw
            }
            return applyLocalPatch(
                match: match.updating(raw: currentRaw, currentUserId: currentUserId),
                body: body
            )
        }
        return match.updating(raw: raw, currentUserId: currentUserId)
    }

    private func combinePatchBodies(_ bodies: [[String: Any]]) -> [String: Any] {
        var combined: [String: Any] = [:]
        var lifecycle: [String: Any] = [:]
        var segmentOperations: [[String: Any]] = []
        var incidentOperations: [[String: Any]] = []

        bodies.forEach { body in
            if let nextLifecycle = body["lifecycle"] as? [String: Any] {
                nextLifecycle.forEach { lifecycle[$0.key] = $0.value }
            }
            if let operations = body["segmentOperations"] as? [[String: Any]] {
                segmentOperations.append(contentsOf: operations)
            }
            if let operations = body["incidentOperations"] as? [[String: Any]] {
                incidentOperations.append(contentsOf: operations)
            }
            ["officialCheckIn", "finalize", "time"].forEach { key in
                if let value = body[key] {
                    combined[key] = value
                }
            }
        }

        if !lifecycle.isEmpty {
            combined["lifecycle"] = lifecycle
        }
        if !segmentOperations.isEmpty {
            combined["segmentOperations"] = segmentOperations
        }
        if !incidentOperations.isEmpty {
            combined["incidentOperations"] = incidentOperations
        }
        return combined
    }

    private func applyLocalPatch(match: WatchMatch, body: [String: Any]) -> WatchMatchDTO {
        var raw = match.raw
        if let lifecycle = body["lifecycle"] as? [String: Any] {
            raw = applyLocalLifecycle(raw, lifecycle: lifecycle)
        }
        if let checkIn = body["officialCheckIn"] as? [String: Any] {
            raw = applyLocalOfficialCheckIn(raw, checkIn: checkIn)
        }
        if let operations = body["segmentOperations"] as? [[String: Any]], !operations.isEmpty {
            raw = applyLocalSegmentOperations(raw, operations: operations)
        }
        if let operations = body["incidentOperations"] as? [[String: Any]], !operations.isEmpty {
            raw = applyLocalIncidentOperations(raw, operations: operations)
        }
        if (body["finalize"] as? Bool) == true {
            raw = raw.copy(
                status: "COMPLETE",
                resultStatus: raw.resultStatus ?? "FINAL",
                resultType: raw.resultType,
                actualStart: raw.actualStart,
                actualEnd: stringValue(body["time"]) ?? raw.actualEnd,
                winnerEventTeamId: raw.winnerEventTeamId
            )
        }
        return raw
    }

    private func applyLocalLifecycle(_ raw: WatchMatchDTO, lifecycle: [String: Any]) -> WatchMatchDTO {
        raw.copy(
            status: stringValue(lifecycle["status"]) ?? raw.status,
            resultStatus: stringValue(lifecycle["resultStatus"]) ?? raw.resultStatus,
            resultType: nullableStringValue(lifecycle, key: "resultType", current: raw.resultType),
            actualStart: nullableStringValue(lifecycle, key: "actualStart", current: raw.actualStart),
            actualEnd: nullableStringValue(lifecycle, key: "actualEnd", current: raw.actualEnd),
            winnerEventTeamId: nullableStringValue(lifecycle, key: "winnerEventTeamId", current: raw.winnerEventTeamId)
        )
    }

    private func applyLocalOfficialCheckIn(_ raw: WatchMatchDTO, checkIn: [String: Any]) -> WatchMatchDTO {
        let checkedIn = checkIn["checkedIn"] as? Bool ?? raw.officialCheckedIn ?? false
        guard let userId = stringValue(checkIn["userId"]), !raw.officialIds.isEmpty else {
            return raw.copy(
                resultType: raw.resultType,
                actualStart: raw.actualStart,
                actualEnd: raw.actualEnd,
                winnerEventTeamId: raw.winnerEventTeamId,
                officialCheckedIn: checkedIn
            )
        }
        let positionId = stringValue(checkIn["positionId"])
        let slotIndex = intValue(checkIn["slotIndex"])
        let assignments = raw.officialIds.map { assignment in
            let userMatches = assignment.userId.trimmedOrNil == userId
            let positionMatches = positionId == nil || assignment.positionId.trimmedOrNil == positionId
            let slotMatches = slotIndex == nil || assignment.slotIndex == slotIndex
            guard userMatches && positionMatches && slotMatches else {
                return assignment
            }
            return assignment.copy(checkedIn: checkedIn)
        }
        return raw.copy(
            resultType: raw.resultType,
            actualStart: raw.actualStart,
            actualEnd: raw.actualEnd,
            winnerEventTeamId: raw.winnerEventTeamId,
            officialCheckedIn: assignments.first?.checkedIn == true,
            officialIds: assignments
        )
    }

    private func applyLocalSegmentOperations(_ raw: WatchMatchDTO, operations: [[String: Any]]) -> WatchMatchDTO {
        var segments = raw.segments
        let matchId = raw.resolvedId ?? raw.id ?? ""
        operations.forEach { operation in
            let operationId = stringValue(operation["id"])
            let sequence = intValue(operation["sequence"])
                ?? operationId.flatMap { id in segments.first { $0.resolvedId == id }?.sequence }
                ?? ((segments.map(\.sequence).max() ?? 0) + 1)
            let index = segments.firstIndex { segment in
                (operationId != nil && segment.id == operationId) ||
                    segment.sequence == sequence
            }
            let existing = index.flatMap { segments[$0] } ?? WatchMatchSegmentDTO(
                id: operationId ?? "\(matchId)_segment_\(sequence)",
                eventId: raw.eventId,
                matchId: matchId,
                sequence: sequence,
                status: "NOT_STARTED",
                scores: [:],
                winnerEventTeamId: nil,
                startedAt: nil,
                endedAt: nil,
                resultType: nil,
                statusReason: nil
            )
            let updated = existing.copy(
                id: operationId ?? existing.id,
                sequence: sequence,
                status: stringValue(operation["status"]) ?? existing.status,
                scores: scoresValue(operation["scores"]) ?? existing.scores,
                winnerEventTeamId: nullableStringValue(operation, key: "winnerEventTeamId", current: existing.winnerEventTeamId),
                startedAt: nullableStringValue(operation, key: "startedAt", current: existing.startedAt),
                endedAt: nullableStringValue(operation, key: "endedAt", current: existing.endedAt),
                resultType: nullableStringValue(operation, key: "resultType", current: existing.resultType),
                statusReason: nullableStringValue(operation, key: "statusReason", current: existing.statusReason)
            )
            if let index {
                segments[index] = updated
            } else {
                segments.append(updated)
            }
        }
        return raw.copy(
            resultType: raw.resultType,
            actualStart: raw.actualStart,
            actualEnd: raw.actualEnd,
            winnerEventTeamId: raw.winnerEventTeamId,
            segments: segments.sorted { $0.sequence < $1.sequence }
        )
    }

    private func applyLocalIncidentOperations(_ raw: WatchMatchDTO, operations: [[String: Any]]) -> WatchMatchDTO {
        var next = raw
        var incidents = raw.incidents
        operations.forEach { operation in
            let action = stringValue(operation["action"])?.uppercased() ?? "CREATE"
            let operationId = stringValue(operation["id"])
            switch action {
            case "DELETE":
                guard let operationId,
                      let index = incidents.firstIndex(where: { $0.resolvedId == operationId }) else {
                    return
                }
                next = applyLocalIncidentScoreDelta(next, incident: incidents[index], multiplier: -1)
                incidents.remove(at: index)
            case "UPDATE":
                guard let operationId,
                      let index = incidents.firstIndex(where: { $0.resolvedId == operationId }) else {
                    return
                }
                next = applyLocalIncidentScoreDelta(next, incident: incidents[index], multiplier: -1)
                let previous = incidents[index]
                let updated = previous.copy(
                    segmentId: nullableStringValue(operation, key: "segmentId", current: previous.segmentId),
                    eventTeamId: nullableStringValue(operation, key: "eventTeamId", current: previous.eventTeamId),
                    eventRegistrationId: nullableStringValue(operation, key: "eventRegistrationId", current: previous.eventRegistrationId),
                    participantUserId: nullableStringValue(operation, key: "participantUserId", current: previous.participantUserId),
                    officialUserId: nullableStringValue(operation, key: "officialUserId", current: previous.officialUserId),
                    incidentType: stringValue(operation["incidentType"]) ?? previous.incidentType,
                    sequence: intValue(operation["sequence"]) ?? previous.sequence,
                    minute: nullableIntValue(operation, key: "minute", current: previous.minute),
                    clock: nullableStringValue(operation, key: "clock", current: previous.clock),
                    clockSeconds: nullableIntValue(operation, key: "clockSeconds", current: previous.clockSeconds),
                    linkedPointDelta: nullableIntValue(operation, key: "linkedPointDelta", current: previous.linkedPointDelta),
                    note: nullableStringValue(operation, key: "note", current: previous.note)
                )
                incidents[index] = updated
                next = applyLocalIncidentScoreDelta(next, incident: updated, multiplier: 1)
            default:
                let existingIndex = operationId.flatMap { id in
                    incidents.firstIndex { $0.resolvedId == id }
                }
                if let existingIndex {
                    next = applyLocalIncidentScoreDelta(next, incident: incidents[existingIndex], multiplier: -1)
                }
                let incident = WatchMatchIncidentDTO(
                    id: operationId ?? "watch_\(UUID().uuidString)",
                    eventId: raw.eventId,
                    matchId: raw.resolvedId ?? raw.id ?? "",
                    segmentId: stringValue(operation["segmentId"]),
                    eventTeamId: stringValue(operation["eventTeamId"]),
                    eventRegistrationId: stringValue(operation["eventRegistrationId"]),
                    participantUserId: stringValue(operation["participantUserId"]),
                    officialUserId: stringValue(operation["officialUserId"]),
                    incidentType: stringValue(operation["incidentType"]) ?? "NOTE",
                    sequence: intValue(operation["sequence"]) ?? existingIndex.map { incidents[$0].sequence } ?? incidents.count + 1,
                    minute: intValue(operation["minute"]),
                    clock: stringValue(operation["clock"]),
                    clockSeconds: intValue(operation["clockSeconds"]),
                    linkedPointDelta: intValue(operation["linkedPointDelta"]),
                    note: stringValue(operation["note"])
                )
                if let existingIndex {
                    incidents[existingIndex] = incident
                } else {
                    incidents.append(incident)
                }
                next = applyLocalIncidentScoreDelta(next, incident: incident, multiplier: 1)
            }
        }
        return next.copy(
            resultType: next.resultType,
            actualStart: next.actualStart,
            actualEnd: next.actualEnd,
            winnerEventTeamId: next.winnerEventTeamId,
            incidents: incidents.sorted { left, right in
                if left.sequence == right.sequence {
                    return left.resolvedId < right.resolvedId
                }
                return left.sequence < right.sequence
            }
        )
    }

    private func applyLocalIncidentScoreDelta(
        _ raw: WatchMatchDTO,
        incident: WatchMatchIncidentDTO,
        multiplier: Int
    ) -> WatchMatchDTO {
        guard let delta = incident.linkedPointDelta, delta != 0,
              let eventTeamId = incident.eventTeamId.trimmedOrNil,
              let segmentId = incident.segmentId.trimmedOrNil else {
            return raw
        }
        var segments = raw.segments
        guard let index = segments.firstIndex(where: { $0.resolvedId == segmentId }) else {
            return raw
        }
        var scores = segments[index].scores
        scores[eventTeamId] = max(0, (scores[eventTeamId] ?? 0) + (delta * multiplier))
        segments[index] = segments[index].copy(
            status: segments[index].status.uppercased() == "NOT_STARTED" && scores.values.contains { $0 > 0 }
                ? "IN_PROGRESS"
                : segments[index].status,
            scores: scores,
            winnerEventTeamId: segments[index].winnerEventTeamId,
            startedAt: segments[index].startedAt,
            endedAt: segments[index].endedAt,
            resultType: segments[index].resultType,
            statusReason: segments[index].statusReason
        )
        return raw.copy(
            resultType: raw.resultType,
            actualStart: raw.actualStart,
            actualEnd: raw.actualEnd,
            winnerEventTeamId: raw.winnerEventTeamId,
            segments: segments
        )
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

    func withClientOperation(_ operation: WatchPendingMatchOperation) -> [String: Any] {
        var next = self
        if let segmentOperations = next["segmentOperations"] as? [[String: Any]] {
            next["segmentOperations"] = segmentOperations.map { item in
                item.withClientOperationFields(operation)
            }
        }
        if let incidentOperations = next["incidentOperations"] as? [[String: Any]] {
            next["incidentOperations"] = incidentOperations.map { item in
                item.withClientOperationFields(operation)
            }
        }
        next["clientOperationId"] = operation.id
        next["clientDeviceId"] = operation.clientDeviceId
        next["clientCreatedAt"] = operation.clientCreatedAt
        next["clientSequence"] = operation.clientSequence
        next["sourceDevice"] = operation.sourceDevice
        return next
    }

    private func withClientOperationFields(_ operation: WatchPendingMatchOperation) -> [String: Any] {
        var next = self
        next["clientOperationId"] = operation.id
        next["clientDeviceId"] = operation.clientDeviceId
        next["clientCreatedAt"] = operation.clientCreatedAt
        next["clientSequence"] = operation.clientSequence
        next["sourceDevice"] = operation.sourceDevice
        return next
    }

    func jsonString() -> String? {
        guard JSONSerialization.isValidJSONObject(self),
              let data = try? JSONSerialization.data(withJSONObject: self, options: []),
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }
        return string
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
    clearWinner: Bool = false,
    scoresOverride: [String: Int]? = nil
) -> [String: Any] {
    var operation: [String: Any] = [
        "sequence": sequence,
        "status": status
    ]
    if let segment {
        operation["id"] = segment.resolvedId
    }
    var scores = scoresOverride ?? segment?.scores ?? [:]
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
    clockSeconds: Int,
    segment: WatchMatchSegmentDTO,
    rules: WatchResolvedMatchRulesDTO
) -> (minute: Int, clock: String, clockSeconds: Int) {
    let safeClockSeconds = max(0, clockSeconds)
    guard rules.timekeeping.addedTimeEnabled else {
        return (minuteForClockSeconds(safeClockSeconds), formatClock(seconds: safeClockSeconds), safeClockSeconds)
    }
    let durationSeconds = durationSeconds(forSequence: segment.sequence, rules: rules)
    let regulationOffsetSeconds = regulationOffsetSeconds(for: segment, rules: rules)
    let regulationEndSeconds = regulationOffsetSeconds + (durationSeconds ?? 0)
    if durationSeconds != nil, safeClockSeconds >= regulationEndSeconds {
        return (
            minuteForClockSeconds(safeClockSeconds),
            formatAddedTimeIncidentClock(regulationEndSeconds: regulationEndSeconds, addedSeconds: safeClockSeconds - regulationEndSeconds),
            safeClockSeconds
        )
    }
    return (minuteForClockSeconds(safeClockSeconds), formatClockAsMinutes(seconds: safeClockSeconds), safeClockSeconds)
}

private func secondsForMinute(_ minute: Int) -> Int {
    (max(1, minute) - 1) * 60
}

private func minuteForClockSeconds(_ seconds: Int) -> Int {
    (max(0, seconds) / 60) + 1
}

private func stringValue(_ value: Any?) -> String? {
    guard let value, !(value is NSNull) else {
        return nil
    }
    return (value as? String)?.trimmedOrNil
}

private func intValue(_ value: Any?) -> Int? {
    guard let value, !(value is NSNull) else {
        return nil
    }
    if let int = value as? Int {
        return int
    }
    if let number = value as? NSNumber {
        return number.intValue
    }
    if let string = value as? String {
        return Int(string)
    }
    return nil
}

private func scoresValue(_ value: Any?) -> [String: Int]? {
    guard let value, !(value is NSNull) else {
        return nil
    }
    if let scores = value as? [String: Int] {
        return scores
    }
    if let scores = value as? [String: NSNumber] {
        return scores.mapValues(\.intValue)
    }
    return nil
}

private func nullableStringValue(_ dictionary: [String: Any], key: String, current: String?) -> String? {
    guard let value = dictionary[key] else {
        return current
    }
    if value is NSNull {
        return nil
    }
    return stringValue(value) ?? current
}

private func nullableIntValue(_ dictionary: [String: Any], key: String, current: Int?) -> Int? {
    guard let value = dictionary[key] else {
        return current
    }
    if value is NSNull {
        return nil
    }
    return intValue(value) ?? current
}

private extension WatchOfficialAssignmentDTO {
    func copy(checkedIn: Bool? = nil) -> WatchOfficialAssignmentDTO {
        WatchOfficialAssignmentDTO(
            positionId: positionId,
            slotIndex: slotIndex,
            holderType: holderType,
            userId: userId,
            checkedIn: checkedIn ?? self.checkedIn
        )
    }
}

private extension WatchMatchSegmentDTO {
    func copy(
        id: String? = nil,
        sequence: Int? = nil,
        status: String? = nil,
        scores: [String: Int]? = nil,
        winnerEventTeamId: String? = nil,
        startedAt: String? = nil,
        endedAt: String? = nil,
        resultType: String? = nil,
        statusReason: String? = nil
    ) -> WatchMatchSegmentDTO {
        WatchMatchSegmentDTO(
            id: id ?? self.id,
            eventId: eventId,
            matchId: matchId,
            sequence: sequence ?? self.sequence,
            status: status ?? self.status,
            scores: scores ?? self.scores,
            winnerEventTeamId: winnerEventTeamId,
            startedAt: startedAt,
            endedAt: endedAt,
            resultType: resultType,
            statusReason: statusReason
        )
    }
}

private extension WatchMatchIncidentDTO {
    func copy(
        segmentId: String? = nil,
        eventTeamId: String? = nil,
        eventRegistrationId: String? = nil,
        participantUserId: String? = nil,
        officialUserId: String? = nil,
        incidentType: String? = nil,
        sequence: Int? = nil,
        minute: Int? = nil,
        clock: String? = nil,
        clockSeconds: Int? = nil,
        linkedPointDelta: Int? = nil,
        note: String? = nil
    ) -> WatchMatchIncidentDTO {
        WatchMatchIncidentDTO(
            id: id,
            eventId: eventId,
            matchId: matchId,
            segmentId: segmentId,
            eventTeamId: eventTeamId,
            eventRegistrationId: eventRegistrationId,
            participantUserId: participantUserId,
            officialUserId: officialUserId,
            incidentType: incidentType ?? self.incidentType,
            sequence: sequence ?? self.sequence,
            minute: minute,
            clock: clock,
            clockSeconds: clockSeconds,
            linkedPointDelta: linkedPointDelta,
            note: note
        )
    }
}

private extension WatchMatchDTO {
    func copy(
        status: String? = nil,
        resultStatus: String? = nil,
        resultType: String? = nil,
        actualStart: String? = nil,
        actualEnd: String? = nil,
        winnerEventTeamId: String? = nil,
        segments: [WatchMatchSegmentDTO]? = nil,
        incidents: [WatchMatchIncidentDTO]? = nil,
        officialCheckedIn: Bool? = nil,
        officialIds: [WatchOfficialAssignmentDTO]? = nil
    ) -> WatchMatchDTO {
        WatchMatchDTO(
            id: id,
            matchId: matchId,
            team1Id: team1Id,
            team2Id: team2Id,
            eventId: eventId,
            officialId: officialId,
            fieldId: fieldId,
            status: status ?? self.status,
            resultStatus: resultStatus ?? self.resultStatus,
            resultType: resultType,
            actualStart: actualStart,
            actualEnd: actualEnd,
            winnerEventTeamId: winnerEventTeamId,
            matchRulesSnapshot: matchRulesSnapshot,
            resolvedMatchRules: resolvedMatchRules,
            segments: segments ?? self.segments,
            incidents: incidents ?? self.incidents,
            start: start,
            end: end,
            division: division,
            team1Points: team1Points,
            team2Points: team2Points,
            setResults: setResults,
            officialCheckedIn: officialCheckedIn ?? self.officialCheckedIn,
            officialIds: officialIds ?? self.officialIds,
            teamOfficialId: teamOfficialId,
            locked: locked
        )
    }
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
