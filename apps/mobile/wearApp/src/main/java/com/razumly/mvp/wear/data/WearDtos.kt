package com.razumly.mvp.wear.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class WearLoginRequestDto(
    val email: String,
    val password: String,
)

@Serializable
data class WearWatchSetupMessageDto(
    val setupToken: String,
    val issuedAt: String? = null,
)

@Serializable
data class WearWatchExchangeRequestDto(
    val setupToken: String,
)

@Serializable
data class WearAuthUserDto(
    val id: String? = null,
    val email: String? = null,
    val name: String? = null,
)

@Serializable
data class WearAuthSessionDto(
    val userId: String? = null,
    val isAdmin: Boolean? = null,
)

@Serializable
data class WearUserProfileDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val userName: String? = null,
    val displayName: String? = null,
) {
    fun resolvedId(): String? = (id ?: legacyId).normalizedId()

    fun label(): String {
        val explicit = displayName.normalizedText()
        if (explicit != null) return explicit
        val fullName = listOfNotNull(firstName.normalizedText(), lastName.normalizedText())
            .joinToString(" ")
            .trim()
        if (fullName.isNotBlank()) return fullName
        return userName.normalizedText() ?: resolvedId().orEmpty()
    }
}

@Serializable
data class WearAuthResponseDto(
    val error: String? = null,
    val code: String? = null,
    val user: WearAuthUserDto? = null,
    val session: WearAuthSessionDto? = null,
    val token: String? = null,
    val profile: WearUserProfileDto? = null,
)

fun WearAuthResponseDto.resolveUserId(): String? =
    profile?.resolvedId()
        ?: user?.id.normalizedId()
        ?: session?.userId.normalizedId()

@Serializable
data class WearUsersResponseDto(
    val users: List<WearUserProfileDto> = emptyList(),
)

@Serializable
data class WearScheduleResponseDto(
    val events: List<WearEventDto> = emptyList(),
    val matches: List<WearMatchDto> = emptyList(),
    val teams: List<WearTeamDto> = emptyList(),
    val fields: List<WearFieldDto> = emptyList(),
)

@Serializable
data class WearEventDetailResponseDto(
    val event: WearEventDto? = null,
    val matches: List<WearMatchDto> = emptyList(),
    val fields: List<WearFieldDto> = emptyList(),
)

@Serializable
data class WearEventDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String? = null,
    val start: String? = null,
    val end: String? = null,
    val timeZone: String? = null,
    val location: String? = null,
    val hostId: String? = null,
    val assistantHostIds: List<String>? = null,
    val officialIds: List<String>? = null,
    val eventType: String? = null,
    val autoCreatePointMatchIncidents: Boolean? = null,
    val resolvedMatchRules: WearResolvedMatchRulesDto? = null,
) {
    fun resolvedId(): String? = (id ?: legacyId).normalizedId()
}

@Serializable
data class WearFieldDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val fieldNumber: Int? = null,
    val name: String? = null,
    val location: String? = null,
) {
    fun resolvedId(): String? = (id ?: legacyId).normalizedId()

    fun label(): String {
        val explicitName = name.normalizedText()
        if (explicitName != null) return explicitName
        return fieldNumber?.takeIf { it > 0 }?.let { "Field $it" }
            ?: location.normalizedText()
            ?: "Field"
    }
}

@Serializable
data class WearTeamRegistrationDto(
    val id: String? = null,
    val teamId: String? = null,
    val userId: String? = null,
    val registrantId: String? = null,
    val status: String? = null,
    val jerseyNumber: String? = null,
    val rosterRole: String? = null,
) {
    fun participantUserId(): String? = (userId ?: registrantId).normalizedId()
}

@Serializable
data class WearTeamDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val name: String = "",
    val playerIds: List<String>? = null,
    val playerRegistrations: List<WearTeamRegistrationDto>? = null,
) {
    fun resolvedId(): String? = (id ?: legacyId).normalizedId()

    fun label(): String = name.normalizedText() ?: "Team"
}

@Serializable
data class WearOfficialAssignmentDto(
    val positionId: String? = null,
    val slotIndex: Int? = null,
    val holderType: String? = null,
    val userId: String? = null,
    val checkedIn: Boolean? = null,
)

@Serializable
data class WearIncidentTypeDefinitionDto(
    val code: String,
    val label: String,
    val kind: String = "DISCIPLINE",
    val cardColor: String? = null,
    val requiresTeam: Boolean? = null,
    val requiresParticipant: Boolean? = null,
    val defaultEnabled: Boolean? = null,
    val linkedPointDelta: Int? = null,
    val metadata: Map<String, String>? = null,
)

@Serializable
data class WearTimekeepingDto(
    val timerMode: String = "NONE",
    val segmentDurationMinutes: Int? = null,
    val segmentDurationMinutesBySequence: List<Int> = emptyList(),
    val canUseAddedTime: Boolean = false,
    val addedTimeEnabled: Boolean = false,
    val stopAtRegulationEnd: Boolean = true,
)

@Serializable
data class WearResolvedMatchRulesDto(
    val scoringModel: String = "POINTS_ONLY",
    val segmentCount: Int = 1,
    val segmentLabel: String = "Total",
    val supportsDraw: Boolean = false,
    val supportsOvertime: Boolean = false,
    val supportsShootout: Boolean = false,
    val canUseOvertime: Boolean = false,
    val canUseShootout: Boolean = false,
    val supportedIncidentTypes: List<String> = listOf("POINT", "DISCIPLINE", "NOTE", "ADMIN"),
    val incidentTypeDefinitions: List<WearIncidentTypeDefinitionDto> = emptyList(),
    val autoCreatePointIncidentType: String? = "POINT",
    val pointIncidentRequiresParticipant: Boolean = false,
    val timekeeping: WearTimekeepingDto = WearTimekeepingDto(),
) {
    fun incidentTypes(): List<WearIncidentTypeDefinitionDto> {
        val explicit = incidentTypeDefinitions.filter { it.code.isNotBlank() && it.defaultEnabled != false }
        if (explicit.isNotEmpty()) return explicit
        val scoringCode = autoCreatePointIncidentType?.normalizedText() ?: supportedIncidentTypes.firstOrNull().orEmpty()
        return listOf(
            WearIncidentTypeDefinitionDto(
                code = scoringCode.ifBlank { "POINT" },
                label = scoringCode.ifBlank { "POINT" }.readableCodeLabel(),
                kind = "SCORING",
                requiresTeam = true,
                linkedPointDelta = 1,
            ),
            WearIncidentTypeDefinitionDto(code = "DISCIPLINE", label = "Penalty", requiresTeam = true),
            WearIncidentTypeDefinitionDto(code = "NOTE", label = "Note", kind = "NOTE"),
            WearIncidentTypeDefinitionDto(code = "ADMIN", label = "Admin", kind = "ADMIN"),
        )
    }
}

@Serializable
data class WearMatchSegmentDto(
    val id: String,
    @SerialName("\$id") val legacyId: String? = null,
    val eventId: String? = null,
    val matchId: String,
    val sequence: Int,
    val status: String = "NOT_STARTED",
    val scores: Map<String, Int> = emptyMap(),
    val winnerEventTeamId: String? = null,
    val startedAt: String? = null,
    val endedAt: String? = null,
    val resultType: String? = null,
    val statusReason: String? = null,
) {
    fun resolvedId(): String = (id.normalizedId() ?: legacyId.normalizedId()).orEmpty()
}

@Serializable
data class WearMatchIncidentDto(
    val id: String,
    @SerialName("\$id") val legacyId: String? = null,
    val eventId: String? = null,
    val matchId: String,
    val segmentId: String? = null,
    val eventTeamId: String? = null,
    val eventRegistrationId: String? = null,
    val participantUserId: String? = null,
    val officialUserId: String? = null,
    val incidentType: String,
    val sequence: Int,
    val minute: Int? = null,
    val clock: String? = null,
    val clockSeconds: Int? = null,
    val linkedPointDelta: Int? = null,
    val note: String? = null,
)

fun WearMatchIncidentDto.resolvedId(): String =
    (id.normalizedId() ?: legacyId.normalizedId()).orEmpty()

@Serializable
data class WearMatchDto(
    val id: String? = null,
    @SerialName("\$id") val legacyId: String? = null,
    val matchId: Int? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val eventId: String? = null,
    val officialId: String? = null,
    val fieldId: String? = null,
    val status: String? = null,
    val resultStatus: String? = null,
    val resultType: String? = null,
    val actualStart: String? = null,
    val actualEnd: String? = null,
    val winnerEventTeamId: String? = null,
    val matchRulesSnapshot: WearResolvedMatchRulesDto? = null,
    val resolvedMatchRules: WearResolvedMatchRulesDto? = null,
    val segments: List<WearMatchSegmentDto> = emptyList(),
    val incidents: List<WearMatchIncidentDto> = emptyList(),
    val start: String? = null,
    val end: String? = null,
    val division: String? = null,
    val team1Points: List<Int> = emptyList(),
    val team2Points: List<Int> = emptyList(),
    val setResults: List<Int> = emptyList(),
    val officialCheckedIn: Boolean? = null,
    val officialIds: List<WearOfficialAssignmentDto> = emptyList(),
    val teamOfficialId: String? = null,
    val locked: Boolean? = null,
) {
    fun resolvedId(): String? = (id ?: legacyId).normalizedId()
}

@Serializable
data class WearMatchResponseDto(
    val match: WearMatchDto? = null,
)

@Serializable
data class WearScoreSetDto(
    val segmentId: String? = null,
    val sequence: Int,
    val eventTeamId: String,
    val points: Int,
    val clientOperationId: String? = null,
    val clientDeviceId: String? = null,
    val clientCreatedAt: String? = null,
    val clientSequence: Long? = null,
    val sourceDevice: String? = null,
)

data class WearPlayer(
    val participantUserId: String,
    val eventRegistrationId: String?,
    val label: String,
    val jerseyNumber: String? = null,
)

data class WearTeam(
    val id: String,
    val label: String,
    val players: List<WearPlayer>,
)

data class WearMatch(
    val id: String,
    val number: Int,
    val eventId: String,
    val eventName: String,
    val startIso: String?,
    val endIso: String?,
    val fieldLabel: String?,
    val division: String?,
    val status: String?,
    val team1: WearTeam?,
    val team2: WearTeam?,
    val officialCheckedIn: Boolean,
    val rules: WearResolvedMatchRulesDto,
    val raw: WearMatchDto,
)

fun String?.normalizedId(): String? = this?.trim()?.takeIf(String::isNotBlank)

fun String?.normalizedText(): String? = this?.trim()?.takeIf(String::isNotBlank)

fun String.readableCodeLabel(): String =
    lowercase()
        .split('_', '-', ' ')
        .filter(String::isNotBlank)
        .joinToString(" ") { token -> token.replaceFirstChar { it.uppercase() } }
