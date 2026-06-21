import Foundation

struct WatchLoginRequest: Encodable {
    let email: String
    let password: String
}

struct WatchExchangeRequest: Encodable {
    let setupToken: String
}

struct WatchAuthUserDTO: Decodable {
    let id: String?
    let email: String?
    let name: String?
}

struct WatchAuthSessionDTO: Decodable {
    let userId: String?
    let isAdmin: Bool?
}

struct WatchUserProfileDTO: Decodable {
    let id: String?
    let legacyId: String?
    let firstName: String?
    let lastName: String?
    let userName: String?
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case legacyId = "$id"
        case firstName
        case lastName
        case userName
        case displayName
    }

    var resolvedId: String? {
        id.trimmedOrNil ?? legacyId.trimmedOrNil
    }

    var label: String {
        if let displayName = displayName.trimmedOrNil {
            return displayName
        }
        let fullName = [firstName.trimmedOrNil, lastName.trimmedOrNil]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !fullName.isEmpty {
            return fullName
        }
        return userName.trimmedOrNil ?? resolvedId ?? "Player"
    }
}

struct WatchAuthResponseDTO: Decodable {
    let error: String?
    let code: String?
    let user: WatchAuthUserDTO?
    let session: WatchAuthSessionDTO?
    let token: String?
    let profile: WatchUserProfileDTO?

    var resolvedUserId: String? {
        profile?.resolvedId ?? user?.id.trimmedOrNil ?? session?.userId.trimmedOrNil
    }

    var resolvedLabel: String? {
        profile?.label ?? user?.name.trimmedOrNil ?? user?.email.trimmedOrNil ?? resolvedUserId
    }
}

struct WatchUsersResponseDTO: Decodable {
    let users: [WatchUserProfileDTO]
}

struct WatchScheduleResponseDTO: Decodable {
    let events: [WatchEventDTO]
    let matches: [WatchMatchDTO]
    let teams: [WatchTeamDTO]
    let fields: [WatchFieldDTO]
}

struct WatchEventDetailResponseDTO: Decodable {
    let event: WatchEventDTO?
    let matches: [WatchMatchDTO]
    let fields: [WatchFieldDTO]
}

struct WatchEventDTO: Decodable {
    let id: String?
    let legacyId: String?
    let name: String?
    let start: String?
    let end: String?
    let timeZone: String?
    let location: String?
    let hostId: String?
    let assistantHostIds: [String]?
    let officialIds: [String]?
    let eventType: String?
    let autoCreatePointMatchIncidents: Bool?
    let resolvedMatchRules: WatchResolvedMatchRulesDTO?

    enum CodingKeys: String, CodingKey {
        case id
        case legacyId = "$id"
        case name
        case start
        case end
        case timeZone
        case location
        case hostId
        case assistantHostIds
        case officialIds
        case eventType
        case autoCreatePointMatchIncidents
        case resolvedMatchRules
    }

    var resolvedId: String? {
        id.trimmedOrNil ?? legacyId.trimmedOrNil
    }

    func rules() -> WatchResolvedMatchRulesDTO? {
        guard var rules = resolvedMatchRules else {
            return nil
        }
        if let requiresPlayer = autoCreatePointMatchIncidents {
            rules.pointIncidentRequiresParticipant = requiresPlayer
        }
        return rules
    }
}

struct WatchFieldDTO: Decodable {
    let id: String?
    let legacyId: String?
    let fieldNumber: Int?
    let name: String?
    let location: String?

    enum CodingKeys: String, CodingKey {
        case id
        case legacyId = "$id"
        case fieldNumber
        case name
        case location
    }

    var resolvedId: String? {
        id.trimmedOrNil ?? legacyId.trimmedOrNil
    }

    var label: String {
        name.trimmedOrNil ?? fieldNumber.map { "Field \($0)" } ?? location.trimmedOrNil ?? "Field"
    }
}

struct WatchTeamRegistrationDTO: Decodable {
    let id: String?
    let teamId: String?
    let userId: String?
    let registrantId: String?
    let status: String?
    let jerseyNumber: String?
    let rosterRole: String?

    var participantUserId: String? {
        userId.trimmedOrNil ?? registrantId.trimmedOrNil
    }
}

struct WatchTeamDTO: Decodable {
    let id: String?
    let legacyId: String?
    let name: String
    let playerIds: [String]?
    let playerRegistrations: [WatchTeamRegistrationDTO]?

    enum CodingKeys: String, CodingKey {
        case id
        case legacyId = "$id"
        case name
        case playerIds
        case playerRegistrations
    }

    var resolvedId: String? {
        id.trimmedOrNil ?? legacyId.trimmedOrNil
    }

    var label: String {
        name.trimmedOrNil ?? "Team"
    }
}

struct WatchOfficialAssignmentDTO: Decodable {
    let positionId: String?
    let slotIndex: Int?
    let holderType: String?
    let userId: String?
    let checkedIn: Bool?
}

struct WatchIncidentTypeDefinitionDTO: Decodable, Identifiable {
    var id: String { code }

    let code: String
    let label: String
    let kind: String?
    let cardColor: String?
    let requiresTeam: Bool?
    let requiresParticipant: Bool?
    let defaultEnabled: Bool?
    let linkedPointDelta: Int?
    let metadata: [String: String]?

    var displayLabel: String {
        label.trimmedOrNil ?? code.readableCodeLabel
    }

    var isScoring: Bool {
        let normalizedKind = kind?.uppercased()
        return (linkedPointDelta ?? 0) != 0
            || normalizedKind == "SCORING"
            || code.uppercased() == "POINT"
            || code.uppercased() == "GOAL"
            || code.uppercased() == "RUN"
    }

    func requiresPlayer(rules: WatchResolvedMatchRulesDTO) -> Bool {
        requiresParticipant == true || (isScoring && rules.pointIncidentRequiresParticipant)
    }
}

struct WatchTimekeepingDTO: Decodable {
    let timerMode: String
    let segmentDurationMinutes: Int?
    let segmentDurationMinutesBySequence: [Int]
    let canUseAddedTime: Bool
    let addedTimeEnabled: Bool
    let stopAtRegulationEnd: Bool

    enum CodingKeys: String, CodingKey {
        case timerMode
        case segmentDurationMinutes
        case segmentDurationMinutesBySequence
        case canUseAddedTime
        case addedTimeEnabled
        case stopAtRegulationEnd
    }

    init(
        timerMode: String = "NONE",
        segmentDurationMinutes: Int? = nil,
        segmentDurationMinutesBySequence: [Int] = [],
        canUseAddedTime: Bool = false,
        addedTimeEnabled: Bool = false,
        stopAtRegulationEnd: Bool = true
    ) {
        self.timerMode = timerMode
        self.segmentDurationMinutes = segmentDurationMinutes
        self.segmentDurationMinutesBySequence = segmentDurationMinutesBySequence
        self.canUseAddedTime = canUseAddedTime
        self.addedTimeEnabled = addedTimeEnabled
        self.stopAtRegulationEnd = stopAtRegulationEnd
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.timerMode = try container.decodeIfPresent(String.self, forKey: .timerMode) ?? "NONE"
        self.segmentDurationMinutes = try container.decodeIfPresent(Int.self, forKey: .segmentDurationMinutes)
        self.segmentDurationMinutesBySequence = try container.decodeIfPresent([Int].self, forKey: .segmentDurationMinutesBySequence) ?? []
        self.canUseAddedTime = try container.decodeIfPresent(Bool.self, forKey: .canUseAddedTime) ?? false
        self.addedTimeEnabled = try container.decodeIfPresent(Bool.self, forKey: .addedTimeEnabled) ?? false
        self.stopAtRegulationEnd = try container.decodeIfPresent(Bool.self, forKey: .stopAtRegulationEnd) ?? true
    }
}

struct WatchResolvedMatchRulesDTO: Decodable {
    let scoringModel: String
    let segmentCount: Int
    let segmentLabel: String
    let supportsDraw: Bool
    let supportsOvertime: Bool
    let supportsShootout: Bool
    let canUseOvertime: Bool
    let canUseShootout: Bool
    let supportedIncidentTypes: [String]
    let incidentTypeDefinitions: [WatchIncidentTypeDefinitionDTO]
    let autoCreatePointIncidentType: String?
    var pointIncidentRequiresParticipant: Bool
    let timekeeping: WatchTimekeepingDTO

    enum CodingKeys: String, CodingKey {
        case scoringModel
        case segmentCount
        case segmentLabel
        case supportsDraw
        case supportsOvertime
        case supportsShootout
        case canUseOvertime
        case canUseShootout
        case supportedIncidentTypes
        case incidentTypeDefinitions
        case autoCreatePointIncidentType
        case pointIncidentRequiresParticipant
        case timekeeping
    }

    init(
        scoringModel: String = "POINTS_ONLY",
        segmentCount: Int = 1,
        segmentLabel: String = "Total",
        supportsDraw: Bool = false,
        supportsOvertime: Bool = false,
        supportsShootout: Bool = false,
        canUseOvertime: Bool = false,
        canUseShootout: Bool = false,
        supportedIncidentTypes: [String] = ["POINT", "DISCIPLINE", "NOTE", "ADMIN"],
        incidentTypeDefinitions: [WatchIncidentTypeDefinitionDTO] = [],
        autoCreatePointIncidentType: String? = "POINT",
        pointIncidentRequiresParticipant: Bool = false,
        timekeeping: WatchTimekeepingDTO = WatchTimekeepingDTO()
    ) {
        self.scoringModel = scoringModel
        self.segmentCount = segmentCount
        self.segmentLabel = segmentLabel
        self.supportsDraw = supportsDraw
        self.supportsOvertime = supportsOvertime
        self.supportsShootout = supportsShootout
        self.canUseOvertime = canUseOvertime
        self.canUseShootout = canUseShootout
        self.supportedIncidentTypes = supportedIncidentTypes
        self.incidentTypeDefinitions = incidentTypeDefinitions
        self.autoCreatePointIncidentType = autoCreatePointIncidentType
        self.pointIncidentRequiresParticipant = pointIncidentRequiresParticipant
        self.timekeeping = timekeeping
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.scoringModel = try container.decodeIfPresent(String.self, forKey: .scoringModel) ?? "POINTS_ONLY"
        self.segmentCount = try container.decodeIfPresent(Int.self, forKey: .segmentCount) ?? 1
        self.segmentLabel = try container.decodeIfPresent(String.self, forKey: .segmentLabel) ?? "Total"
        self.supportsDraw = try container.decodeIfPresent(Bool.self, forKey: .supportsDraw) ?? false
        self.supportsOvertime = try container.decodeIfPresent(Bool.self, forKey: .supportsOvertime) ?? false
        self.supportsShootout = try container.decodeIfPresent(Bool.self, forKey: .supportsShootout) ?? false
        self.canUseOvertime = try container.decodeIfPresent(Bool.self, forKey: .canUseOvertime) ?? false
        self.canUseShootout = try container.decodeIfPresent(Bool.self, forKey: .canUseShootout) ?? false
        self.supportedIncidentTypes = try container.decodeIfPresent([String].self, forKey: .supportedIncidentTypes) ?? ["POINT", "DISCIPLINE", "NOTE", "ADMIN"]
        self.incidentTypeDefinitions = try container.decodeIfPresent([WatchIncidentTypeDefinitionDTO].self, forKey: .incidentTypeDefinitions) ?? []
        self.autoCreatePointIncidentType = try container.decodeIfPresent(String.self, forKey: .autoCreatePointIncidentType)
        self.pointIncidentRequiresParticipant = try container.decodeIfPresent(Bool.self, forKey: .pointIncidentRequiresParticipant) ?? false
        self.timekeeping = try container.decodeIfPresent(WatchTimekeepingDTO.self, forKey: .timekeeping) ?? WatchTimekeepingDTO()
    }

    var incidentTypes: [WatchIncidentTypeDefinitionDTO] {
        let enabled = incidentTypeDefinitions.filter { !$0.code.isEmpty && $0.defaultEnabled != false }
        if !enabled.isEmpty {
            return enabled
        }
        let scoringCode = autoCreatePointIncidentType.trimmedOrNil ?? supportedIncidentTypes.first ?? "POINT"
        return [
            WatchIncidentTypeDefinitionDTO(
                code: scoringCode,
                label: scoringCode.readableCodeLabel,
                kind: "SCORING",
                cardColor: nil,
                requiresTeam: true,
                requiresParticipant: false,
                defaultEnabled: true,
                linkedPointDelta: 1,
                metadata: nil
            ),
            WatchIncidentTypeDefinitionDTO(
                code: "DISCIPLINE",
                label: "Penalty",
                kind: "DISCIPLINE",
                cardColor: nil,
                requiresTeam: true,
                requiresParticipant: false,
                defaultEnabled: true,
                linkedPointDelta: nil,
                metadata: nil
            ),
            WatchIncidentTypeDefinitionDTO(
                code: "NOTE",
                label: "Note",
                kind: "NOTE",
                cardColor: nil,
                requiresTeam: false,
                requiresParticipant: false,
                defaultEnabled: true,
                linkedPointDelta: nil,
                metadata: nil
            ),
            WatchIncidentTypeDefinitionDTO(
                code: "ADMIN",
                label: "Admin",
                kind: "ADMIN",
                cardColor: nil,
                requiresTeam: false,
                requiresParticipant: false,
                defaultEnabled: true,
                linkedPointDelta: nil,
                metadata: nil
            )
        ]
    }
}

struct WatchMatchSegmentDTO: Decodable, Identifiable {
    let id: String
    let legacyId: String?
    let eventId: String?
    let matchId: String
    let sequence: Int
    let status: String
    let scores: [String: Int]
    let winnerEventTeamId: String?
    let startedAt: String?
    let endedAt: String?
    let resultType: String?
    let statusReason: String?

    enum CodingKeys: String, CodingKey {
        case id
        case legacyId = "$id"
        case eventId
        case matchId
        case sequence
        case status
        case scores
        case winnerEventTeamId
        case startedAt
        case endedAt
        case resultType
        case statusReason
    }

    var resolvedId: String {
        id.trimmedOrNil ?? legacyId.trimmedOrNil ?? id
    }
}

struct WatchMatchIncidentDTO: Decodable, Identifiable {
    let id: String
    let legacyId: String?
    let eventId: String?
    let matchId: String
    let segmentId: String?
    let eventTeamId: String?
    let eventRegistrationId: String?
    let participantUserId: String?
    let officialUserId: String?
    let incidentType: String
    let sequence: Int
    let minute: Int?
    let clock: String?
    let clockSeconds: Int?
    let linkedPointDelta: Int?
    let note: String?

    enum CodingKeys: String, CodingKey {
        case id
        case legacyId = "$id"
        case eventId
        case matchId
        case segmentId
        case eventTeamId
        case eventRegistrationId
        case participantUserId
        case officialUserId
        case incidentType
        case sequence
        case minute
        case clock
        case clockSeconds
        case linkedPointDelta
        case note
    }

    var resolvedId: String {
        id.trimmedOrNil ?? legacyId.trimmedOrNil ?? id
    }
}

struct WatchMatchDTO: Decodable, Identifiable {
    let id: String?
    let legacyId: String?
    let matchId: Int?
    let team1Id: String?
    let team2Id: String?
    let eventId: String?
    let officialId: String?
    let fieldId: String?
    let status: String?
    let resultStatus: String?
    let resultType: String?
    let actualStart: String?
    let actualEnd: String?
    let winnerEventTeamId: String?
    let matchRulesSnapshot: WatchResolvedMatchRulesDTO?
    let resolvedMatchRules: WatchResolvedMatchRulesDTO?
    let segments: [WatchMatchSegmentDTO]
    let incidents: [WatchMatchIncidentDTO]
    let start: String?
    let end: String?
    let division: String?
    let team1Points: [Int]
    let team2Points: [Int]
    let setResults: [Int]
    let officialCheckedIn: Bool?
    let officialIds: [WatchOfficialAssignmentDTO]
    let teamOfficialId: String?
    let locked: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case legacyId = "$id"
        case matchId
        case team1Id
        case team2Id
        case eventId
        case officialId
        case fieldId
        case status
        case resultStatus
        case resultType
        case actualStart
        case actualEnd
        case winnerEventTeamId
        case matchRulesSnapshot
        case resolvedMatchRules
        case segments
        case incidents
        case start
        case end
        case division
        case team1Points
        case team2Points
        case setResults
        case officialCheckedIn
        case officialIds
        case teamOfficialId
        case locked
    }

    var resolvedId: String? {
        id.trimmedOrNil ?? legacyId.trimmedOrNil
    }
}

struct WatchMatchResponseDTO: Decodable {
    let match: WatchMatchDTO?
}

struct WatchScoreSetDTO: Encodable {
    let segmentId: String?
    let sequence: Int
    let eventTeamId: String
    let points: Int
}

struct WatchPlayer: Identifiable, Hashable {
    var id: String { participantUserId }

    let participantUserId: String
    let eventRegistrationId: String?
    let label: String
    let jerseyNumber: String?
}

struct WatchTeam: Identifiable, Hashable {
    let id: String
    let label: String
    let players: [WatchPlayer]
}

struct WatchMatch: Identifiable, Hashable {
    let id: String
    let number: Int
    let eventId: String
    let eventName: String
    let startIso: String?
    let endIso: String?
    let fieldLabel: String?
    let division: String?
    let status: String?
    let team1: WatchTeam?
    let team2: WatchTeam?
    let officialCheckedIn: Bool
    let rules: WatchResolvedMatchRulesDTO
    let raw: WatchMatchDTO

    static func == (lhs: WatchMatch, rhs: WatchMatch) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    func updating(raw: WatchMatchDTO, currentUserId: String?) -> WatchMatch {
        WatchMatch(
            id: raw.resolvedId ?? id,
            number: raw.matchId ?? number,
            eventId: raw.eventId.trimmedOrNil ?? eventId,
            eventName: eventName,
            startIso: raw.start ?? startIso,
            endIso: raw.end ?? endIso,
            fieldLabel: fieldLabel,
            division: raw.division ?? division,
            status: raw.status ?? status,
            team1: team1,
            team2: team2,
            officialCheckedIn: currentUserId.map { raw.isUserCheckedIn(userId: $0) } ?? officialCheckedIn,
            rules: raw.matchRulesSnapshot ?? raw.resolvedMatchRules ?? rules,
            raw: raw
        )
    }
}

extension WatchResolvedMatchRulesDTO: Hashable {
    static func == (lhs: WatchResolvedMatchRulesDTO, rhs: WatchResolvedMatchRulesDTO) -> Bool {
        lhs.scoringModel == rhs.scoringModel &&
            lhs.segmentCount == rhs.segmentCount &&
            lhs.segmentLabel == rhs.segmentLabel &&
            lhs.pointIncidentRequiresParticipant == rhs.pointIncidentRequiresParticipant
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(scoringModel)
        hasher.combine(segmentCount)
        hasher.combine(segmentLabel)
        hasher.combine(pointIncidentRequiresParticipant)
    }
}

extension WatchMatchDTO: Hashable {
    static func == (lhs: WatchMatchDTO, rhs: WatchMatchDTO) -> Bool {
        lhs.resolvedId == rhs.resolvedId
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(resolvedId)
    }
}

extension Optional where Wrapped == String {
    var trimmedOrNil: String? {
        guard let value = self?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return value
    }
}

extension String {
    var trimmedOrNil: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    var readableCodeLabel: String {
        lowercased()
            .split { $0 == "_" || $0 == "-" || $0 == " " }
            .map { token in
                token.prefix(1).uppercased() + token.dropFirst()
            }
            .joined(separator: " ")
    }
}
