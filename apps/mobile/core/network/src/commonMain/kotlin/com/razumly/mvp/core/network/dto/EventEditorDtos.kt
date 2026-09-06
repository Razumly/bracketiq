package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchIncidentMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.MatchRulesConfigMVP
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.data.dataTypes.ResolvedMatchRulesMVP
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TimeSlotDTO
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Transient
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive

const val EVENT_EDITOR_CONTRACT_VERSION: Int = 5
const val EVENT_EDITOR_PREVIOUS_CONTRACT_VERSION: Int = 4
const val EVENT_EDITOR_LEGACY_CONTRACT_VERSION: Int = 3

fun isSupportedEventEditorContractVersion(version: Int): Boolean =
    version == EVENT_EDITOR_CONTRACT_VERSION || version == EVENT_EDITOR_PREVIOUS_CONTRACT_VERSION || version == EVENT_EDITOR_LEGACY_CONTRACT_VERSION

@Serializable
data class EventEditorBootstrapQueryDto(
    val organizationId: String? = null,
    val eventType: String? = null,
    val sportId: String? = null,
    val parentEventId: String? = null,
    val templateId: String? = null,
    val rentalBookingId: String? = null,
    val start: String? = null,
)

@Serializable
data class EventEditorCreateBootstrapDto(
    val contractVersion: Int,
    val createOperationId: String,
    val snapshot: EventEditorSnapshotDto,
)

@Serializable
data class EventEditorScheduleStateDto(
    val sourceType: String? = null,
    val matchCount: Int,
    val matchDemand: EventEditorMatchDemandDto? = null,
    val revision: String,
    val hasProtectedHistory: Boolean,
    val availableMaintenanceOperations: List<EventEditorMaintenanceOperation> = emptyList(),
)

@Serializable
data class EventEditorMatchDemandDto(
    val total: Int,
    val byDivision: Map<String, Int> = emptyMap(),
    val byPhase: Map<String, Int> = emptyMap(),
    val placed: Int,
    val unplaced: Int,
)

@Serializable
data class EventEditorSnapshotDto(
    val contractVersion: Int,
    val draft: EventEditorDraftDto,
    val mode: String,
    val eventId: String? = null,
    val editorRevision: String,
    val staffRevision: String? = null,
    val capabilities: EventEditorCapabilitiesDto,
    val provenance: EventProvenanceDto? = null,
    val catalogs: EventEditorCatalogsDto,
    val immutable: EventEditorImmutableDto,
    val scheduleState: EventEditorScheduleStateDto,
    val revisionBinding: EventEditorRevisionBindingDto? = null,
)

@Serializable
data class EventProvenanceDto(
    val sourceType: String? = null,
    val sourceId: String? = null,
    val sourceUrl: String? = null,
)

@Serializable
data class EventEditorCapabilitiesDto(
    val canUseOnlinePayments: Boolean,
    val canManageStaff: Boolean,
    val canEdit: Boolean,
    val supportsTeamStaffing: Boolean,
    val viewerUserId: String? = null,
    val canDelegateHost: Boolean = false,
    val readOnly: Boolean = !canEdit,
    val readOnlyReason: String? = null,
    val managementAuthority: com.razumly.mvp.core.data.dataTypes.EventManagementAuthority? = null,
    val eventHostId: String? = null,
    val viewerIsEventHost: Boolean = false,
    val organizationOwnershipStatus: String? = null,
) {
    fun toDomain() = com.razumly.mvp.core.data.dataTypes.EventAuthorityCapabilities(
        viewerUserId = viewerUserId,
        canEdit = canEdit,
        canManageStaff = canManageStaff,
        canDelegateHost = canDelegateHost,
        readOnly = readOnly,
        readOnlyReason = readOnlyReason,
        managementAuthority = managementAuthority,
        eventHostId = eventHostId,
        viewerIsEventHost = viewerIsEventHost,
        organizationOwnershipStatus = organizationOwnershipStatus,
    )
}

@Serializable
data class EventEditorCatalogsDto(
    val sports: List<JsonObject> = emptyList(),
    val organizations: List<JsonObject> = emptyList(),
    val fields: List<JsonObject> = emptyList(),
    val templates: List<JsonObject> = emptyList(),
)

@Serializable
data class EventEditorImmutableDto(
    val fieldNames: List<String> = emptyList(),
    val rental: Boolean = false,
    val template: Boolean = false,
)
@Serializable
data class EventEditorMatchProjectionDto(
    val id: String,
    val matchId: Int? = null,
    val eventId: String,
    val start: String? = null,
    val end: String? = null,
    val locked: Boolean = false,
    val placementState: String = "UNPLACED",
    val phase: String? = null,
    val sourceDivisionId: String? = null,
    val phaseDivisionId: String? = null,
    val division: String? = null,
    val fieldId: String? = null,
    val team1Id: String? = null,
    val team2Id: String? = null,
    val team1Seed: Int? = null,
    val team2Seed: Int? = null,
    val status: String? = null,
    val resultStatus: String? = null,
    val resultType: String? = null,
    val actualStart: String? = null,
    val actualEnd: String? = null,
    val statusReason: String? = null,
    val winnerEventTeamId: String? = null,
    val matchRulesSnapshot: JsonObject? = null,
    val resolvedMatchRules: JsonObject? = null,
    val segments: List<JsonObject> = emptyList(),
    val incidents: List<JsonObject> = emptyList(),
    val officialId: String? = null,
    val officialIds: List<JsonObject> = emptyList(),
    val teamOfficialId: String? = null,
    val team1Points: List<Double> = emptyList(),
    val team2Points: List<Double> = emptyList(),
    val losersBracket: Boolean = false,
    val winnerNextMatchId: String? = null,
    val loserNextMatchId: String? = null,
    val previousLeftId: String? = null,
    val previousRightId: String? = null,
    val side: String? = null,
    val officialCheckedIn: Boolean = false,
)

@Serializable
data class EventEditorScheduleWarningDto(
    val code: String,
    val message: String,
    val matchIds: List<String>? = null,
    val restrictingFactor: String? = null,
)

@Serializable
data class EventEditorScheduleDiagnosticIntervalDto(
    val start: String,
    val end: String,
)

@Serializable
data class EventEditorScheduleDiagnosticEvidenceDto(
    val kind: String,
    val message: String,
    val matchIds: List<String>? = null,
    val resourceIds: List<String>? = null,
    val divisionIds: List<String>? = null,
    val teamIds: List<String>? = null,
    val dependencyIds: List<String>? = null,
    val officialIds: List<String>? = null,
    val timeSlotIds: List<String>? = null,
    val intervals: List<EventEditorScheduleDiagnosticIntervalDto>? = null,
    val demand: Int? = null,
    val capacity: Int? = null,
    val deficit: Int? = null,
    val candidateCount: Int? = null,
)

@Serializable
data class EventEditorScheduleRestrictingFactorDto(
    val factor: String,
    val confidence: String,
    val message: String,
    val evidence: List<EventEditorScheduleDiagnosticEvidenceDto> = emptyList(),
)

@Serializable
data class EventEditorScheduleRemedyDto(
    val code: String,
    val factor: String,
    val message: String,
    val evidence: List<EventEditorScheduleDiagnosticEvidenceDto> = emptyList(),
)

@Serializable
data class EventEditorScheduleDiagnosticsDto(
    val message: String,
    val matchDemand: EventEditorMatchDemandDto,
    val estimatedCapacity: Int,
    val estimatedCapacityIsUpperBound: Boolean,
    val minimumDeficitMatches: Int,
    val searchComplete: Boolean,
    val restrictingFactors: List<EventEditorScheduleRestrictingFactorDto> = emptyList(),
    val remedies: List<EventEditorScheduleRemedyDto> = emptyList(),
)

@Serializable
enum class EventEditorCreateCompletionMode {
    CREATE_ONLY,
    CREATE_AND_BUILD_SCHEDULE,
}

@Serializable
enum class EventEditorScheduleTransitionMode {
    PRESERVE,
    RECONCILE,
}

@Serializable
enum class EventEditorScheduleOutcomeStatus {
    NOT_REQUESTED,
    BUILT,
    REBUILT,
    DELETED,
    PARTIAL,
}

@Serializable
enum class EventEditorProposalAcceptanceMode {
    PARTIAL,
}

@Serializable
data class EventEditorUnscheduledMatchDto(
    val id: String,
    val matchId: Int? = null,
    val phaseDivisionId: String,
    val phase: String,
    val sourceDivisionId: String? = null,
)

@Serializable
data class EventEditorAffectedCompetitionPhaseDto(
    val id: String,
    val name: String,
    val phase: String,
    val sourceDivisionId: String? = null,
)

@Serializable
data class EventEditorCreateCompletionDto(
    val mode: EventEditorCreateCompletionMode,
)

@Serializable
data class EventEditorSaveScheduleTransitionDto(
    val mode: EventEditorScheduleTransitionMode,
    val expectedScheduleRevision: String? = null,
) {
    init {
        if (mode == EventEditorScheduleTransitionMode.PRESERVE) {
            require(expectedScheduleRevision == null) {
                "PRESERVE schedule transitions cannot include a schedule revision."
            }
        } else {
            require(!expectedScheduleRevision.isNullOrBlank()) {
                "Schedule transitions that mutate matches require an expected schedule revision."
            }
        }
    }
}

@Serializable
data class EventEditorScheduleOutcomeDto(
    val status: EventEditorScheduleOutcomeStatus,
    val matchCount: Int,
    val matches: List<EventEditorMatchProjectionDto> = emptyList(),
    val unscheduledMatches: List<EventEditorUnscheduledMatchDto> = emptyList(),
    val affectedCompetitionPhases: List<EventEditorAffectedCompetitionPhaseDto> = emptyList(),
    val placedMatchCount: Int = 0,
    val unplacedMatchCount: Int = 0,
    val isComplete: Boolean = status != EventEditorScheduleOutcomeStatus.PARTIAL,
    val diagnostics: EventEditorScheduleDiagnosticsDto? = null,
    val warnings: List<EventEditorScheduleWarningDto> = emptyList(),
) {
    init {
        when (status) {
            EventEditorScheduleOutcomeStatus.NOT_REQUESTED -> {
                require(warnings.isEmpty())
                require(matches.isEmpty() || matches.size == matchCount) {
                    "NOT_REQUESTED schedule outcomes must include all graph matches when matches are present."
                }
            }
            EventEditorScheduleOutcomeStatus.BUILT,
            EventEditorScheduleOutcomeStatus.REBUILT -> {
                require(matchCount > 0 && matches.isNotEmpty())
            }
            EventEditorScheduleOutcomeStatus.DELETED -> {
                require(matchCount == 0 && matches.isEmpty() && warnings.isEmpty())
            }
            EventEditorScheduleOutcomeStatus.PARTIAL -> {
                require(!isComplete) { "PARTIAL schedule outcomes must be incomplete." }
                require(matchCount > 0 && matches.size == matchCount)
                val placedMatches = matches.filter {
                    it.placementState.trim().equals("PLACED", ignoreCase = true)
                }
                val unplacedMatches = matches.filter {
                    it.placementState.trim().equals("UNPLACED", ignoreCase = true)
                }
                require(placedMatchCount == placedMatches.size)
                require(unplacedMatchCount == unplacedMatches.size && unplacedMatchCount > 0)
                require(placedMatchCount + unplacedMatchCount == matchCount)
                require(unscheduledMatches.size == unplacedMatchCount)
                require(unscheduledMatches.map { it.id } == unplacedMatches.map { it.id })
                unscheduledMatches.zip(unplacedMatches).forEach { (unscheduled, match) ->
                    require(unscheduled.matchId == match.matchId)
                    require(unscheduled.phaseDivisionId == match.phaseDivisionId)
                    require(unscheduled.phase == match.phase)
                    require(unscheduled.sourceDivisionId == match.sourceDivisionId)
                    require(match.fieldId == null && match.start == null && match.end == null)
                    require(match.officialId == null && match.teamOfficialId == null)
                    require(match.officialIds.isEmpty())
                }
                val expectedPhaseIds = unplacedMatches.mapNotNull { it.phaseDivisionId }.distinct().sorted()
                require(affectedCompetitionPhases.map { it.id } == expectedPhaseIds)
            }
        }
    }
}

@Serializable
enum class EventEditorMaintenanceOperation {
    BUILD,
    COMPLETE,
    REBUILD,
}

@Serializable
enum class EventEditorMaintenanceScheduleOutcomeStatus {
    COMPLETE,
    INCOMPLETE,
}

@Serializable
enum class EventEditorMaintenanceResponseStatus {
    PROPOSED,
    ACCEPTED,
    REJECTED,
}

@Serializable
data class EventEditorMaintenanceRequestDto(
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val expectedRevisions: EventEditorRevisionBindingDto? = null,
    val participantCount: Int? = null,
    val includePlaceholderTeams: Boolean? = null,
)

@Serializable
data class EventEditorMaintenanceUnscheduledMatchDto(
    val id: String,
    val matchId: Int? = null,
    val phaseDivisionId: String,
    val phase: String,
    val sourceDivisionId: String? = null,
)

@Serializable
data class EventEditorMaintenanceAffectedCompetitionPhaseDto(
    val id: String,
    val name: String,
    val phase: String,
    val sourceDivisionId: String? = null,
)

@Serializable
data class EventEditorMaintenanceScheduleOutcomeDto(
    val status: EventEditorMaintenanceScheduleOutcomeStatus,
    val isComplete: Boolean,
    val matchCount: Int,
    val placedMatchCount: Int,
    val unplacedMatchCount: Int,
    val matches: List<EventEditorMatchProjectionDto>,
    val unscheduledMatches: List<EventEditorMaintenanceUnscheduledMatchDto>,
    val affectedCompetitionPhases: List<EventEditorMaintenanceAffectedCompetitionPhaseDto>,
    val diagnostics: EventEditorScheduleDiagnosticsDto? = null,
    val warnings: List<EventEditorScheduleWarningDto>,
) {
    init {
        require(matchCount > 0) {
            "Maintenance schedule outcomes must contain at least one match."
        }
        require(matches.size == matchCount) {
            "Maintenance schedule outcomes must include the complete Match Graph."
        }
        val placedMatches = matches.count {
            it.placementState.equals("PLACED", ignoreCase = true)
        }
        val unplacedMatches = matches.count {
            it.placementState.equals("UNPLACED", ignoreCase = true)
        }
        require(placedMatchCount == placedMatches) {
            "Maintenance schedule outcome placedMatchCount does not match the Match Graph."
        }
        require(unplacedMatchCount == unplacedMatches) {
            "Maintenance schedule outcome unplacedMatchCount does not match the Match Graph."
        }
        require(placedMatchCount + unplacedMatchCount == matchCount) {
            "Maintenance schedule outcome counts do not match the Match Graph."
        }
        when (status) {
            EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE -> {
                require(isComplete) {
                    "Complete maintenance schedule outcomes must be complete."
                }
                require(unplacedMatchCount == 0 && unscheduledMatches.isEmpty()) {
                    "Complete maintenance schedule outcomes cannot contain unplaced matches."
                }
                require(affectedCompetitionPhases.isEmpty()) {
                    "Complete maintenance schedule outcomes cannot contain affected phases."
                }
            }
            EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE -> {
                require(!isComplete) {
                    "Incomplete maintenance schedule outcomes must be incomplete."
                }
                require(unplacedMatchCount > 0) {
                    "Incomplete maintenance schedule outcomes must contain unplaced matches."
                }
                require(unscheduledMatches.size == unplacedMatchCount) {
                    "Incomplete maintenance schedule outcomes must describe all unplaced matches."
                }
                require(unscheduledMatches.map { it.id } ==
                    matches.filter {
                        it.placementState.equals("UNPLACED", ignoreCase = true)
                    }.map(EventEditorMatchProjectionDto::id)
                ) {
                    "Incomplete maintenance schedule outcomes must preserve Match Graph order."
                }
            }
        }
    }
}

@Serializable
data class EventEditorMaintenanceGraphUserDto(
    val id: String,
    val firstName: String,
    val lastName: String,
    val userName: String,
)

@Serializable
data class EventEditorMaintenanceGraphPlayerRegistrationDto(
    val id: String,
    val teamId: String?,
    val userId: String,
    val status: String,
    val jerseyNumber: String?,
    val position: String?,
    val isCaptain: Boolean,
)

@Serializable
data class EventEditorMaintenanceGraphTeamDto(
    val id: String,
    val captainId: String?,
    val division: String?,
    val kind: String?,
    val name: String,
    val playerIds: List<String>,
    val players: List<EventEditorMaintenanceGraphUserDto>,
    val playerRegistrations: List<EventEditorMaintenanceGraphPlayerRegistrationDto>,
)

@Serializable
data class EventEditorMaintenanceGraphFieldDto(
    val id: String,
    val organizationId: String?,
    val divisions: List<String>,
    val name: String,
)

@Serializable
data class EventEditorMaintenanceGraphTimeSlotDto(
    val id: String,
    val dayOfWeek: Int,
    val daysOfWeek: List<Int>,
    val startDate: String? = null,
    val endDate: String?,
    val repeating: Boolean,
    val startTimeMinutes: Int,
    val endTimeMinutes: Int,
    val price: Double?,
    val scheduledFieldId: String?,
    val scheduledFieldIds: List<String>,
    val divisions: List<String>,
)

@Serializable
data class EventEditorMaintenanceGraphEventOfficialDto(
    val id: String,
    val userId: String,
    val positionIds: List<String>,
    val fieldIds: List<String>,
    val isActive: Boolean,
)

@Serializable
data class EventEditorMaintenanceGraphPhaseSettingsDto(
    val matchRulesOverride: JsonElement? = null,
    val autoCreatePointMatchIncidents: Boolean? = null,
    val segmentLengthMinutes: Int? = null,
    val segmentBreakMinutes: Int? = null,
    val doTeamsOfficiate: Boolean? = null,
    val officialPositions: List<EventEditorOfficialPositionDto>? = null,
)

@Serializable
data class EventEditorMaintenanceGraphPlayoffConfigDto(
    val doubleElimination: Boolean,
    val winnerSetCount: Int,
    val loserSetCount: Int,
    val winnerBracketPointsToVictory: List<Double>,
    val loserBracketPointsToVictory: List<Double>,
    val prize: String,
    val fieldCount: Int,
    val restTimeMinutes: Int,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
)

@Serializable
data class EventEditorMaintenanceGraphLeagueConfigDto(
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean? = null,
    val playoffTeamCount: Int? = null,
    val usesSets: Boolean? = null,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val pointsToVictory: List<Double>? = null,
    val restTimeMinutes: Int? = null,
)

@Serializable
data class EventEditorMaintenanceGraphDivisionDto(
    val id: String,
    val name: String,
    val kind: String,
    val role: String,
    val phase: String?,
    val sourceDivisionId: String?,
    val isSystemGenerated: Boolean,
    val phaseSettings: Map<String, EventEditorMaintenanceGraphPhaseSettingsDto>,
    val teamIds: List<String>,
    val playoffTeamCount: Int?,
    val playoffPlacementDivisionIds: List<String>,
    val standingsOverrides: Map<String, Double>?,
    val standingsConfirmedAt: String?,
    val standingsConfirmedBy: String?,
    val playoffConfig: EventEditorMaintenanceGraphPlayoffConfigDto?,
    val leagueConfig: EventEditorMaintenanceGraphLeagueConfigDto?,
)

@Serializable
data class EventEditorMaintenanceGraphOfficialAssignmentDto(
    val positionId: String,
    val slotIndex: Int,
    val holderType: String,
    val userId: String?,
    val eventOfficialId: String?,
    val checkedIn: Boolean,
    val hasConflict: Boolean,
)

@Serializable
data class EventEditorMaintenanceGraphMatchDto(
    val id: String,
    val matchId: Int?,
    val eventId: String,
    val start: String?,
    val end: String?,
    val locked: Boolean,
    val placementState: String,
    val phase: String?,
    val sourceDivisionId: String?,
    val phaseDivisionId: String?,
    val division: String?,
    val fieldId: String?,
    val team1Id: String?,
    val team2Id: String?,
    val team1Seed: Int?,
    val team2Seed: Int?,
    val status: String?,
    val resultStatus: String?,
    val resultType: String?,
    val actualStart: String?,
    val actualEnd: String?,
    val statusReason: String?,
    val winnerEventTeamId: String?,
    val segments: List<JsonObject>,
    val incidents: List<JsonObject>,
    val officialIds: List<EventEditorMaintenanceGraphOfficialAssignmentDto>,
    val officialAssignments: List<EventEditorMaintenanceGraphOfficialAssignmentDto>,
    val teamOfficialId: String?,
    val teamOfficialSeed: JsonElement,
    val matchRulesSnapshot: JsonElement?,
    val resolvedMatchRules: JsonElement?,
    val team1Points: List<Double>,
    val team2Points: List<Double>,
    val losersBracket: Boolean,
    val winnerNextMatchId: String?,
    val loserNextMatchId: String?,
    val previousLeftId: String?,
    val previousRightId: String?,
    val side: String?,
    val officialCheckedIn: Boolean,
    val team1: EventEditorMaintenanceGraphTeamDto?,
    val team2: EventEditorMaintenanceGraphTeamDto?,
    val teamOfficial: EventEditorMaintenanceGraphTeamDto?,
    val official: EventEditorMaintenanceGraphUserDto?,
    val field: EventEditorMaintenanceGraphFieldDto?,
)

@Serializable
data class EventEditorMaintenanceGraphEventDto(
    val id: String,
    val name: String,
    val description: String,
    val start: String,
    val end: String,
    val location: String,
    val coordinates: List<Double>?,
    val price: Double?,
    val minAge: Int?,
    val maxAge: Int?,
    val rating: Double?,
    val imageId: String?,
    val hostId: String?,
    val noFixedEndDateTime: Boolean,
    val scheduleEndConstraint: String?,
    val generatedScheduleEnd: String?,
    val state: String,
    val maxParticipants: Int,
    val teamSizeLimit: Int?,
    val restTimeMinutes: Int?,
    val teamSignup: Boolean,
    val singleDivision: Boolean,
    val waitListIds: List<String>,
    val freeAgentIds: List<String>,
    val teamIds: List<String>,
    val userIds: List<String>,
    val fieldIds: List<String>,
    val timeSlotIds: List<String>,
    val officialIds: List<String>,
    val staffingPriority: String,
    val officialPositions: List<EventEditorOfficialPositionDto>,
    val eventOfficials: List<EventEditorMaintenanceGraphEventOfficialDto>,
    val matchRulesOverride: JsonElement?,
    val autoCreatePointMatchIncidents: Boolean,
    val resolvedMatchRules: JsonElement?,
    val cancellationRefundHours: Int?,
    val registrationCutoffHours: Int?,
    val seedColor: Int?,
    val eventType: String,
    val sportIds: List<String>,
    val leagueScoringConfigId: String?,
    val organizationId: String?,
    val requiredTemplateIds: List<String>,
    val allowPaymentPlans: Boolean,
    val installmentCount: Int,
    val installmentDueDates: List<String>,
    val installmentDueRelativeDays: List<Int>,
    val installmentAmounts: List<Double>,
    val allowTeamSplitDefault: Boolean,
    val splitLeaguePlayoffDivisions: Boolean,
    val divisions: List<String>,
    val divisionDetails: List<EventEditorMaintenanceGraphDivisionDto>,
    val playoffDivisionDetails: List<EventEditorMaintenanceGraphDivisionDto>,
    val fields: List<EventEditorMaintenanceGraphFieldDto>,
    val teams: List<EventEditorMaintenanceGraphTeamDto>,
    val timeSlots: List<EventEditorMaintenanceGraphTimeSlotDto>,
    val officials: List<EventEditorMaintenanceGraphUserDto>,
    val doubleElimination: Boolean? = null,
    val winnerSetCount: Int? = null,
    val loserSetCount: Int? = null,
    val winnerBracketPointsToVictory: List<Double>? = null,
    val loserBracketPointsToVictory: List<Double>? = null,
    val prize: String? = null,
    val fieldCount: Int? = null,
    val matches: List<EventEditorMaintenanceGraphMatchDto>? = null,
    val usesSets: Boolean? = null,
    val matchDurationMinutes: Int? = null,
    val setDurationMinutes: Int? = null,
    val setsPerMatch: Int? = null,
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean? = null,
    val teamCheckInMode: String? = null,
    val teamCheckInOpenMinutesBefore: Int? = null,
    val allowMatchRosterEdits: Boolean? = null,
    val allowTemporaryMatchPlayers: Boolean? = null,
    val gamesPerOpponent: Int? = null,
    val includePlayoffs: Boolean? = null,
    val playoffTeamCount: Int? = null,
    val pointsToVictory: List<Double>? = null,
)

private fun <T> JsonElement?.decodeLegacyOrNull(serializer: KSerializer<T>): T? =
    this?.let { element ->
        runCatching { jsonMVP.decodeFromJsonElement(serializer, element) }.getOrNull()
    }

private fun Double.toLegacyInt(): Int = toInt()

private fun Double?.toLegacyIntOrNull(): Int? = this?.toLegacyInt()

private fun EventEditorOfficialPositionDto.toLegacyOfficialPosition(): EventOfficialPosition =
    EventOfficialPosition(
        id = id,
        name = name,
        count = count,
        order = order,
    )

private fun EventEditorMaintenanceGraphPhaseSettingsDto.toLegacyPhaseSettings():
    DivisionPhaseSettingsMVP =
    DivisionPhaseSettingsMVP(
        matchRulesOverride = matchRulesOverride.decodeLegacyOrNull(MatchRulesConfigMVP.serializer()),
        autoCreatePointMatchIncidents = autoCreatePointMatchIncidents,
        segmentLengthMinutes = segmentLengthMinutes,
        segmentBreakMinutes = segmentBreakMinutes,
        doTeamsOfficiate = doTeamsOfficiate,
        officialPositions = officialPositions?.map(EventEditorOfficialPositionDto::toLegacyOfficialPosition),
    )

private fun EventEditorMaintenanceGraphPlayoffConfigDto.toLegacyTournamentConfig(): TournamentConfig =
    TournamentConfig(
        doubleElimination = doubleElimination,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory.map(Double::toLegacyInt),
        loserBracketPointsToVictory = loserBracketPointsToVictory.map(Double::toLegacyInt),
        prize = prize,
        fieldCount = fieldCount,
        restTimeMinutes = restTimeMinutes,
        usesSets = matchDurationMinutes == null,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
    )

private fun EventEditorMaintenanceGraphDivisionDto.toLegacyDivisionDetail(): DivisionDetail {
    val league = leagueConfig
    return DivisionDetail(
        id = id,
        sourceDivisionId = sourceDivisionId,
        kind = kind,
        isSystemGenerated = isSystemGenerated,
        name = name,
        playoffTeamCount = playoffTeamCount,
        playoffPlacementDivisionIds = playoffPlacementDivisionIds,
        playoffConfig = playoffConfig?.toLegacyTournamentConfig(),
        gamesPerOpponent = league?.gamesPerOpponent,
        restTimeMinutes = league?.restTimeMinutes,
        usesSets = league?.usesSets,
        matchDurationMinutes = league?.matchDurationMinutes,
        setDurationMinutes = league?.setDurationMinutes,
        setsPerMatch = league?.setsPerMatch,
        pointsToVictory = league?.pointsToVictory?.map(Double::toLegacyInt).orEmpty(),
        phaseSettings = phaseSettings.mapValues { (_, settings) ->
            settings.toLegacyPhaseSettings()
        },
        teamIds = teamIds,
    )
}

private fun EventEditorMaintenanceGraphUserDto.toLegacyGraphUser(): EventEditorProposalGraphUserDto =
    EventEditorProposalGraphUserDto(
        id = id,
        firstName = firstName,
        lastName = lastName,
        userName = userName,
    )

private fun EventEditorMaintenanceGraphPlayerRegistrationDto.toLegacyRegistration():
    TeamPlayerRegistrationApiDto =
    TeamPlayerRegistrationApiDto(
        id = id,
        teamId = teamId,
        userId = userId,
        status = status,
        jerseyNumber = jerseyNumber,
        position = position,
        isCaptain = isCaptain,
    )

private fun EventEditorMaintenanceGraphTeamDto.toLegacyTeam(): TeamApiDto =
    TeamApiDto(
        id = id,
        captainId = captainId,
        division = division,
        kind = kind,
        name = name,
        playerIds = playerIds,
        playerRegistrationIds = playerRegistrations.map { registration -> registration.id },
        players = players.map(EventEditorMaintenanceGraphUserDto::toLegacyGraphUser),
        playerRegistrations = playerRegistrations.map(
            EventEditorMaintenanceGraphPlayerRegistrationDto::toLegacyRegistration,
        ),
    )

private fun EventEditorMaintenanceGraphFieldDto.toLegacyField(): Field =
    Field(
        id = id,
        organizationId = organizationId,
        divisions = divisions,
        name = name,
    )

private fun EventEditorMaintenanceGraphTimeSlotDto.toLegacyTimeSlot(): TimeSlotDTO =
    TimeSlotDTO(
        id = id,
        dayOfWeek = dayOfWeek,
        daysOfWeek = daysOfWeek,
        startDate = startDate ?: endDate.orEmpty(),
        endDate = endDate,
        repeating = repeating,
        startTimeMinutes = startTimeMinutes,
        endTimeMinutes = endTimeMinutes,
        price = price.toLegacyIntOrNull(),
        scheduledFieldId = scheduledFieldId,
        scheduledFieldIds = scheduledFieldIds,
        divisions = divisions,
    )

private fun EventEditorMaintenanceGraphEventOfficialDto.toLegacyEventOfficial(): EventOfficial =
    EventOfficial(
        id = id,
        userId = userId,
        positionIds = positionIds,
        fieldIds = fieldIds,
        isActive = isActive,
    )

private fun EventEditorMaintenanceGraphOfficialAssignmentDto.toLegacyAssignment():
    MatchOfficialAssignment? {
    val resolvedHolderType = runCatching {
        OfficialAssignmentHolderType.valueOf(holderType)
    }.getOrNull() ?: return null
    return MatchOfficialAssignment(
        positionId = positionId,
        slotIndex = slotIndex,
        holderType = resolvedHolderType,
        userId = userId,
        eventOfficialId = eventOfficialId,
        checkedIn = checkedIn,
        hasConflict = hasConflict,
    )
}

private fun EventEditorMaintenanceGraphMatchDto.toLegacyMatch(): MatchApiDto =
    MatchApiDto(
        id = id,
        matchId = matchId,
        eventId = eventId,
        start = start,
        end = end,
        locked = locked,
        placementState = placementState,
        phase = phase,
        sourceDivisionId = sourceDivisionId,
        phaseDivisionId = phaseDivisionId,
        division = division,
        fieldId = fieldId,
        team1Id = team1Id,
        team2Id = team2Id,
        team1Seed = team1Seed,
        team2Seed = team2Seed,
        status = status,
        resultStatus = resultStatus,
        resultType = resultType,
        actualStart = actualStart,
        actualEnd = actualEnd,
        statusReason = statusReason,
        winnerEventTeamId = winnerEventTeamId,
        field = field?.let { graphField ->
            MatchEmbeddedFieldDto(
                id = graphField.id,
                divisions = graphField.divisions,
                name = graphField.name,
                organizationId = graphField.organizationId,
            )
        },
        matchRulesSnapshot = matchRulesSnapshot.decodeLegacyOrNull(ResolvedMatchRulesMVP.serializer()),
        resolvedMatchRules = resolvedMatchRules.decodeLegacyOrNull(ResolvedMatchRulesMVP.serializer()),
        segments = segments.mapNotNull { segment ->
            segment.decodeLegacyOrNull(MatchSegmentApiDto.serializer())
        },
        incidents = incidents.mapNotNull { incident ->
            incident.decodeLegacyOrNull(MatchIncidentMVP.serializer())
        },
        officialIds = officialIds.mapNotNull(
            EventEditorMaintenanceGraphOfficialAssignmentDto::toLegacyAssignment,
        ),
        officialAssignments = officialAssignments.mapNotNull(
            EventEditorMaintenanceGraphOfficialAssignmentDto::toLegacyAssignment,
        ),
        teamOfficialId = teamOfficialId,
        team1Points = team1Points.map(Double::toLegacyInt),
        team2Points = team2Points.map(Double::toLegacyInt),
        losersBracket = losersBracket,
        winnerNextMatchId = winnerNextMatchId,
        loserNextMatchId = loserNextMatchId,
        previousLeftId = previousLeftId,
        previousRightId = previousRightId,
        side = side,
        officialCheckedIn = officialCheckedIn,
    )

private fun EventEditorMaintenanceGraphEventDto.toLegacyEvent(base: EventApiDto): EventApiDto =
    base.copy(
        id = id,
        name = name,
        start = start,
        end = end,
        location = location,
        description = description,
        coordinates = coordinates,
        price = price.toLegacyIntOrNull(),
        minAge = minAge,
        maxAge = maxAge,
        rating = rating,
        imageId = imageId,
        hostId = hostId,
        noFixedEndDateTime = noFixedEndDateTime,
        scheduleEndConstraint = scheduleEndConstraint,
        generatedScheduleEnd = generatedScheduleEnd,
        state = state,
        maxParticipants = maxParticipants,
        teamSizeLimit = teamSizeLimit,
        restTimeMinutes = restTimeMinutes,
        teamSignup = teamSignup,
        singleDivision = singleDivision,
        waitListIds = waitListIds,
        freeAgentIds = freeAgentIds,
        teamIds = teamIds,
        userIds = userIds,
        fieldIds = fieldIds,
        timeSlotIds = timeSlotIds,
        officialIds = officialIds,
        staffingPriority = staffingPriority,
        officialPositions = officialPositions.map(
            EventEditorOfficialPositionDto::toLegacyOfficialPosition,
        ),
        eventOfficials = eventOfficials.map(
            EventEditorMaintenanceGraphEventOfficialDto::toLegacyEventOfficial,
        ),
        matchRulesOverride = matchRulesOverride.decodeLegacyOrNull(MatchRulesConfigMVP.serializer()),
        autoCreatePointMatchIncidents = autoCreatePointMatchIncidents,
        resolvedMatchRules = resolvedMatchRules.decodeLegacyOrNull(ResolvedMatchRulesMVP.serializer()),
        cancellationRefundHours = cancellationRefundHours,
        registrationCutoffHours = registrationCutoffHours,
        seedColor = seedColor,
        eventType = eventType,
        sportIds = sportIds,
        leagueScoringConfigId = leagueScoringConfigId,
        organizationId = organizationId,
        requiredTemplateIds = requiredTemplateIds,
        allowPaymentPlans = allowPaymentPlans,
        installmentCount = installmentCount,
        installmentDueDates = installmentDueDates,
        installmentDueRelativeDays = installmentDueRelativeDays,
        installmentAmounts = installmentAmounts.map(Double::toLegacyInt),
        allowTeamSplitDefault = allowTeamSplitDefault,
        splitLeaguePlayoffDivisions = splitLeaguePlayoffDivisions,
        divisions = divisions,
        divisionDetails = divisionDetails.map(
            EventEditorMaintenanceGraphDivisionDto::toLegacyDivisionDetail,
        ),
        playoffDivisionDetails = playoffDivisionDetails.map(
            EventEditorMaintenanceGraphDivisionDto::toLegacyDivisionDetail,
        ),
        fields = fields.map(EventEditorMaintenanceGraphFieldDto::toLegacyField),
        teams = teams.map(EventEditorMaintenanceGraphTeamDto::toLegacyTeam),
        timeSlots = timeSlots.map(EventEditorMaintenanceGraphTimeSlotDto::toLegacyTimeSlot),
        officials = officials.map(EventEditorMaintenanceGraphUserDto::toLegacyGraphUser),
        doubleElimination = doubleElimination,
        winnerSetCount = winnerSetCount,
        loserSetCount = loserSetCount,
        winnerBracketPointsToVictory = winnerBracketPointsToVictory?.map(Double::toLegacyInt),
        loserBracketPointsToVictory = loserBracketPointsToVictory?.map(Double::toLegacyInt),
        prize = prize,
        fieldCount = fieldCount,
        matches = matches?.map(EventEditorMaintenanceGraphMatchDto::toLegacyMatch) ?: base.matches,
        usesSets = usesSets,
        matchDurationMinutes = matchDurationMinutes,
        setDurationMinutes = setDurationMinutes,
        setsPerMatch = setsPerMatch,
        doTeamsOfficiate = doTeamsOfficiate,
        teamOfficialsMaySwap = teamOfficialsMaySwap,
        teamCheckInMode = teamCheckInMode?.let { mode ->
            runCatching { TeamCheckInMode.valueOf(mode) }.getOrNull()
        },
        teamCheckInOpenMinutesBefore = teamCheckInOpenMinutesBefore,
        allowMatchRosterEdits = allowMatchRosterEdits,
        allowTemporaryMatchPlayers = allowTemporaryMatchPlayers,
        gamesPerOpponent = gamesPerOpponent,
        includePlayoffs = includePlayoffs,
        playoffTeamCount = playoffTeamCount,
        pointsToVictory = pointsToVictory?.map(Double::toLegacyInt),
    )

@Serializable(with = EventEditorMaintenanceGraphDtoSerializer::class)
data class EventEditorMaintenanceGraphDto(
    val event: EventApiDto,
    val matches: List<EventEditorMatchProjectionDto>,
    val canonicalEvent: EventEditorMaintenanceGraphEventDto? = null,
    val canonicalMatches: List<EventEditorMaintenanceGraphMatchDto> = emptyList(),
    @Transient val rawEvent: JsonObject? = null,
    @Transient val rawMatches: List<JsonObject> = emptyList(),
)
object EventEditorMaintenanceGraphDtoSerializer :
    KSerializer<EventEditorMaintenanceGraphDto> {
    override val descriptor = JsonElement.serializer().descriptor

    override fun serialize(
        encoder: Encoder,
        value: EventEditorMaintenanceGraphDto,
    ) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw SerializationException("Maintenance graph can only be encoded as JSON.")
        val event = value.rawEvent
            ?: value.canonicalEvent?.let { canonical ->
                jsonMVP.encodeToJsonElement(
                    EventEditorMaintenanceGraphEventDto.serializer(),
                    canonical,
                )
            }
            ?: jsonMVP.encodeToJsonElement(EventApiDto.serializer(), value.event)
        val matches = when {
            value.rawMatches.isNotEmpty() -> JsonArray(value.rawMatches)
            value.canonicalMatches.isNotEmpty() -> JsonArray(
                value.canonicalMatches.map { match ->
                    jsonMVP.encodeToJsonElement(
                        EventEditorMaintenanceGraphMatchDto.serializer(),
                        match,
                    )
                },
            )
            else -> jsonMVP.encodeToJsonElement(
                ListSerializer(EventEditorMatchProjectionDto.serializer()),
                value.matches,
            )
        }
        jsonEncoder.encodeJsonElement(
            JsonObject(
                mapOf(
                    "event" to event,
                    "matches" to matches,
                ),
            ),
        )
    }

    override fun deserialize(decoder: Decoder): EventEditorMaintenanceGraphDto {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw SerializationException("Maintenance graph can only be decoded from JSON.")
        val graph = jsonDecoder.decodeJsonElement() as? JsonObject
            ?: throw SerializationException("Maintenance graph must be an object.")
        val eventElement = graph["event"] as? JsonObject
            ?: throw SerializationException("Maintenance graph is missing event.")
        val matchesElement = graph["matches"] as? JsonArray
            ?: throw SerializationException("Maintenance graph is missing matches.")
        val canonicalEvent = jsonMVP.decodeFromJsonElement(
            EventEditorMaintenanceGraphEventDto.serializer(),
            eventElement,
        )
        val canonicalMatches = matchesElement.map { matchElement ->
            jsonMVP.decodeFromJsonElement(
                EventEditorMaintenanceGraphMatchDto.serializer(),
                matchElement,
            )
        }
        val legacyMatches = canonicalMatches.map(EventEditorMaintenanceGraphMatchDto::toLegacyMatch)
        val legacyEvent = canonicalEvent.toLegacyEvent(
            base = runCatching {
                jsonMVP.decodeFromJsonElement(EventApiDto.serializer(), eventElement)
            }.getOrDefault(EventApiDto()),
        ).let { event ->
            if (legacyMatches.isNotEmpty()) {
                event.copy(matches = legacyMatches)
            } else {
                event
            }
        }
        return EventEditorMaintenanceGraphDto(
            event = legacyEvent,
            matches = canonicalMatches.map(EventEditorMaintenanceGraphMatchDto::toProjection),
            canonicalEvent = canonicalEvent,
            canonicalMatches = canonicalMatches,
            rawEvent = eventElement,
            rawMatches = matchesElement.map { match ->
                match as? JsonObject
                    ?: throw SerializationException("Maintenance graph match must be an object.")
            },
        )
    }
}

private fun EventEditorMaintenanceGraphMatchDto.toProjection(): EventEditorMatchProjectionDto =
    EventEditorMatchProjectionDto(
        id = id,
        matchId = matchId,
        eventId = eventId,
        start = start,
        end = end,
        locked = locked,
        placementState = placementState,
        phase = phase,
        sourceDivisionId = sourceDivisionId,
        phaseDivisionId = phaseDivisionId,
        division = division,
        fieldId = fieldId,
        team1Id = team1Id,
        team2Id = team2Id,
        team1Seed = team1Seed,
        team2Seed = team2Seed,
        status = status,
        resultStatus = resultStatus,
        resultType = resultType,
        actualStart = actualStart,
        actualEnd = actualEnd,
        statusReason = statusReason,
        winnerEventTeamId = winnerEventTeamId,
        matchRulesSnapshot = matchRulesSnapshot as? JsonObject,
        resolvedMatchRules = resolvedMatchRules as? JsonObject,
        segments = segments,
        incidents = incidents,
        officialIds = officialIds.map { assignment ->
            jsonMVP.encodeToJsonElement(
                EventEditorMaintenanceGraphOfficialAssignmentDto.serializer(),
                assignment,
            ).jsonObject
        },
        teamOfficialId = teamOfficialId,
        team1Points = team1Points,
        team2Points = team2Points,
        losersBracket = losersBracket,
        winnerNextMatchId = winnerNextMatchId,
        loserNextMatchId = loserNextMatchId,
        previousLeftId = previousLeftId,
        previousRightId = previousRightId,
        side = side,
        officialCheckedIn = officialCheckedIn,
    )

@Serializable
data class EventEditorMaintenanceProposalDto(
    val status: EventEditorMaintenanceResponseStatus,
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
    val revisionBinding: EventEditorRevisionBindingDto,
    val graph: EventEditorMaintenanceGraphDto,
    val protectedMatchIds: List<String>,
    val scheduleOutcome: EventEditorMaintenanceScheduleOutcomeDto,
)

@Serializable
data class EventEditorAcceptMaintenanceProposalDto(
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
    val acceptanceOperationId: String,
)

@Serializable
data class EventEditorMaintenanceAcceptedResultDto(
    val status: EventEditorMaintenanceResponseStatus,
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
    val revisionBinding: EventEditorRevisionBindingDto,
    val graph: EventEditorMaintenanceGraphDto,
    val protectedMatchIds: List<String>,
    val scheduleOutcome: EventEditorMaintenanceScheduleOutcomeDto,
    val acceptanceOperationId: String,
)

@Serializable
data class EventEditorRejectMaintenanceProposalDto(
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
)

@Serializable
data class EventEditorMaintenanceRejectedResultDto(
    val status: EventEditorMaintenanceResponseStatus,
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
)

sealed interface EventEditorMaintenanceResponseDto {
    data class Proposed(val proposal: EventEditorMaintenanceProposalDto) :
        EventEditorMaintenanceResponseDto

    data class Accepted(val result: EventEditorMaintenanceAcceptedResultDto) :
        EventEditorMaintenanceResponseDto

    data class Rejected(val result: EventEditorMaintenanceRejectedResultDto) :
        EventEditorMaintenanceResponseDto
}



@Serializable
data class EventEditorDraftDto(
    val basics: EventEditorBasicsDto,
    val participation: EventEditorParticipationDto,
    val registration: EventEditorRegistrationDto,
    val competition: EventEditorCompetitionDto,
    val schedule: EventEditorScheduleDto,
    val resources: EventEditorResourcesDto,
    val staff: EventEditorStaffDto,
)

@Serializable
data class EventEditorBasicsDto(
    val name: String,
    val description: String,
    val eventType: String,
    val sportIds: List<String> = emptyList(),
    val start: String,
    val timeZone: String,
    val location: String,
    val address: String,
    val coordinates: List<Double> = listOf(0.0, 0.0),
    val affiliateUrl: String,
    val parentEvent: String? = null,
    val organizationId: String? = null,
    val hostId: String? = null,
    val state: String,
    val imageId: String? = null,
    val tags: List<EventEditorTagDto> = emptyList(),
)

@Serializable
data class EventEditorParticipationDto(
    val teamSignup: Boolean,
    val singleDivision: Boolean,
    val registrationByDivisionType: Boolean,
    val teamSizeLimit: Int? = null,
    val maxParticipants: Int? = null,
    val minAge: Int? = null,
    val maxAge: Int? = null,
    val cancellationRefundHours: Int? = null,
    val registrationCutoffHours: Int,
    val allowTeamSplitDefault: Boolean,
    val waitListIds: List<String> = emptyList(),
    val freeAgentIds: List<String> = emptyList(),
)

@Serializable
data class EventEditorRegistrationDto(
    val payment: EventEditorPaymentDto,
    val questions: List<EventEditorQuestionDto> = emptyList(),
    val requiredDocumentIds: List<String> = emptyList(),
)

@Serializable
data class EventEditorPaymentDto(
    val mode: String,
    val priceCents: Int,
    val taxHandling: String,
    val organizerManualTaxRateBps: Int,
    val manualPaymentInstructions: String? = null,
    val manualPaymentLinks: List<EventEditorManualPaymentLinkDto> = emptyList(),
    val allowPaymentPlans: Boolean,
    val installmentCount: Int? = null,
    val installmentDueDates: List<String> = emptyList(),
    val installmentDueRelativeDays: List<Int> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
)

@Serializable
data class EventEditorQuestionDto(
    val id: String? = null,
    val clientId: String? = null,
    val prompt: String,
    val answerType: String,
    val required: Boolean,
    val sortOrder: Int,
)

@Serializable
data class EventEditorManualPaymentLinkDto(
    val id: String? = null,
    val provider: String? = null,
    val label: String? = null,
    val url: String? = null,
)

@Serializable
data class EventEditorCompetitionDto(
    val divisionIds: List<String> = emptyList(),
    val divisionDetails: List<EventEditorDivisionDetailDto> = emptyList(),
    val playoffDivisionDetails: List<EventEditorDivisionDetailDto> = emptyList(),
    val divisionFieldIds: Map<String, List<String>> = emptyMap(),
    val winnerSetCount: Int? = null,
    val loserSetCount: Int? = null,
    val doubleElimination: Boolean,
    val includePlayoffs: Boolean,
    val splitLeaguePlayoffDivisions: Boolean,
    val playoffTeamCount: Int? = null,
    val pointsToVictory: List<Int> = emptyList(),
    val winnerBracketPointsToVictory: List<Int> = emptyList(),
    val loserBracketPointsToVictory: List<Int> = emptyList(),
    val usesSets: Boolean,
    val setsPerMatch: Int? = null,
    val setDurationMinutes: Double? = null,
    val restTimeMinutes: Double? = null,
    val matchDurationMinutes: Double? = null,
    val gamesPerOpponent: Int? = null,
    val matchRulesOverride: JsonObject? = null,
    val leagueScoringConfig: JsonObject? = null,
)

@Serializable
data class EventEditorDivisionDetailDto(
    val id: String,
    val sourceDivisionId: String? = null,
    val key: String,
    val name: String,
    val kind: String,
    val isSystemGenerated: Boolean? = null,
    val poolPlay: Boolean? = null,
    val divisionTypeId: String,
    val skillDivisionTypeId: String,
    val ageDivisionTypeId: String,
    val divisionTypeName: String,
    val ratingType: String,
    val gender: String? = null,
    val price: Double? = null,
    val maxParticipants: Double? = null,
    val playoffTeamCount: Double? = null,
    val poolCount: Double? = null,
    val poolTeamCount: Double? = null,
    val phaseSettings: JsonObject? = null,
    val playoffPlacementDivisionIds: List<String> = emptyList(),
    val standingsOverrides: Map<String, Double>? = null,
    val playoffConfig: JsonObject? = null,
    val gamesPerOpponent: Double? = null,
    val restTimeMinutes: Double? = null,
    val usesSets: Boolean? = null,
    val matchDurationMinutes: Double? = null,
    val setDurationMinutes: Double? = null,
    val setsPerMatch: Double? = null,
    val pointsToVictory: List<Int> = emptyList(),
    val standingsConfirmedAt: String? = null,
    val standingsConfirmedBy: String? = null,
    val allowPaymentPlans: Boolean? = null,
    val installmentCount: Double? = null,
    val installmentDueDates: List<String> = emptyList(),
    val installmentDueRelativeDays: List<Int> = emptyList(),
    val installmentAmounts: List<Int> = emptyList(),
    val ageCutoffDate: String? = null,
    val ageCutoffLabel: String? = null,
    val ageCutoffSource: String? = null,
    val fieldIds: List<String> = emptyList(),
    val teamIds: List<String> = emptyList(),
    @Transient
    val playoffConfigPresent: Boolean = false,
)

@Serializable
data class EventEditorScheduleDto(
    val mode: String,
    val endConstraint: String? = null,
    val generatedScheduleEnd: String? = null,
    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    @kotlinx.serialization.json.JsonNames("automatedScheduling")
    val isAutomatedScheduling: Boolean = true,
)

@Serializable
data class EventEditorResourcesDto(
    val fieldIds: List<String> = emptyList(),
    val fields: List<EventEditorFieldDto> = emptyList(),
    val timeSlotIds: List<String> = emptyList(),
    val timeSlots: List<EventEditorTimeSlotDto> = emptyList(),
    val requiredTemplateIds: List<String> = emptyList(),
    val immutableFieldIds: List<String> = emptyList(),
    val rentalBookingId: String? = null,
    val rentalBookingItemId: String? = null,
    val sourceTemplateId: String? = null,
)

@Serializable
data class EventEditorFieldDto(
    val id: String? = null,
    @SerialName("\$id")
    val legacyId: String? = null,
    val name: String? = null,
    val location: String? = null,
    val address: String? = null,
    val lat: Double? = null,
    val long: Double? = null,
    val heading: Double? = null,
    val inUse: Boolean? = null,
    val rentalSlotIds: List<String> = emptyList(),
    val sportIds: List<String> = emptyList(),
    val createdBy: String? = null,
    val archivedAt: String? = null,
    val archivedByUserId: String? = null,
    val archiveReason: String? = null,
    val organizationId: String? = null,
    val facilityId: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

@Serializable
data class EventEditorTimeSlotDto(
    val id: String? = null,
    @SerialName("\$id")
    val legacyId: String? = null,
    val eventId: String? = null,
    val archivedAt: String? = null,
    val archivedByUserId: String? = null,
    val archiveReason: String? = null,
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int> = emptyList(),
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val start: String? = null,
    val end: String? = null,
    val timeZone: String = "UTC",
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String> = emptyList(),
    val fieldId: String? = null,
    val fieldIds: List<String> = emptyList(),
    val division: String? = null,
    val divisions: List<String> = emptyList(),
    val divisionKeys: List<String> = emptyList(),
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
    val repeating: Boolean? = null,
    val price: Double? = null,
    val taxHandling: String? = null,
    val sourceType: String? = null,
    val rentalBookingId: String? = null,
    val rentalBookingItemId: String? = null,
    val rentalLocked: Boolean? = null,
)

@Serializable
data class EventEditorStaffDto(
    val staffingPriority: String? = null,
    val doTeamsOfficiate: Boolean? = null,
    val teamOfficialsMaySwap: Boolean = false,
    val teamCheckInMode: String,
    val teamCheckInOpenMinutesBefore: Int,
    val allowMatchRosterEdits: Boolean,
    val allowTemporaryMatchPlayers: Boolean,
    val autoCreatePointMatchIncidents: Boolean,
    val officialIds: List<String> = emptyList(),
    val officialPositions: List<EventEditorOfficialPositionDto> = emptyList(),
    val eventOfficials: List<EventEditorOfficialDto> = emptyList(),
    val assistantHostIds: List<String> = emptyList(),
    val pendingInvites: List<EventEditorStaffInviteDto> = emptyList(),
)

@Serializable
data class EventEditorOfficialPositionDto(
    val id: String,
    val name: String,
    val count: Int,
    val order: Int,
)

@Serializable
data class EventEditorOfficialDto(
    val id: String? = null,
    val userId: String,
    val positionIds: List<String> = emptyList(),
    val fieldIds: List<String> = emptyList(),
    val isActive: Boolean,
)

@Serializable
data class EventEditorStaffInviteDto(
    val id: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val sentAt: String? = null,
    val email: String,
    val firstName: String? = null,
    val lastName: String? = null,
    val roles: List<String> = emptyList(),
    val staffTypes: List<String> = emptyList(),
    val resolvedUserId: String? = null,
    val userId: String? = null,
    val type: String? = null,
    val status: String? = null,
    val eventId: String? = null,
    val organizationId: String? = null,
    val teamId: String? = null,
    val createdBy: String? = null,
)

@Serializable
data class EventEditorTagDto(
    val id: String? = null,
    @SerialName("\$id")
    val legacyId: String? = null,
    val slug: String? = null,
    val name: String? = null,
    val label: String? = null,
)

@Serializable
data class EventEditorExpectedCreateRevisionsDto(
    val editorRevision: String,
    val staffRevision: String?,
    val scheduleRevision: String,
)
@Serializable
data class EventEditorCreateCommandDto(
    val contractVersion: Int,
    val createOperationId: String,
    val expectedRevisions: EventEditorExpectedCreateRevisionsDto,
    val draft: EventEditorDraftDto,
    val completion: EventEditorCreateCompletionDto,
    val hasScheduleProposalSupport: Boolean = false,
)

@Serializable
data class EventEditorAcceptProposalCommandDto(
    val contractVersion: Int,
    val createOperationId: String,
    val proposalRevision: String,
    val draft: EventEditorDraftDto,
)

@Serializable
data class EventEditorAcceptPartialProposalCommandDto(
    val contractVersion: Int,
    val createOperationId: String,
    val proposalRevision: String,
    val acceptanceMode: EventEditorProposalAcceptanceMode = EventEditorProposalAcceptanceMode.PARTIAL,
    val acceptanceOperationId: String,
    val draft: EventEditorDraftDto,
)

@Serializable
data class EventEditorRejectProposalCommandDto(
    val contractVersion: Int,
    val createOperationId: String,
    val proposalRevision: String,
)

@Serializable
data class EventEditorSaveCommandDto(
    val contractVersion: Int,
    val editorRevision: String,
    val staffRevision: String? = null,
    val draft: EventEditorDraftDto,
    val scheduleTransition: EventEditorSaveScheduleTransitionDto,
)

@Serializable
data class EventEditorSaveResultDto(
    val status: String,
    val snapshot: EventEditorSnapshotDto,
    val questionIdMap: Map<String, String> = emptyMap(),
    val staffEmailDelivery: String,
    val scheduleOutcome: EventEditorScheduleOutcomeDto,
    val graph: EventEditorCreateProposalGraphDto? = null,
    val acceptanceOperationId: String? = null,
)
@Serializable
data class EventEditorRevisionBindingDto(
    val editorRevision: String,
    val staffRevision: String? = null,
    val scheduleRevision: String,
    val fieldRevisions: Map<String, String> = emptyMap(),
    val timeSlotRevisions: Map<String, String> = emptyMap(),
    val rentalBookingRevision: String? = null,
    val rentalBookingRevisions: Map<String, String> = emptyMap(),
    val rentalBookingItemRevisions: Map<String, String> = emptyMap(),
    val availabilityRevision: String,
)

@Serializable
data class EventEditorProposalGraphUserDto(
    val id: String,
    val firstName: String = "",
    val lastName: String = "",
    val userName: String = "",
)

@Serializable
data class EventEditorCreateProposalGraphDto(
    val event: EventApiDto,
    val matches: List<MatchApiDto> = emptyList(),
)

@Serializable
data class EventEditorCreateProposalDto(
    val status: String,
    val createOperationId: String,
    val eventId: String,
    val proposalRevision: String,
    val expectedRevisions: EventEditorExpectedCreateRevisionsDto,
    val completion: EventEditorCreateCompletionDto,
    val snapshot: EventEditorSnapshotDto,
    val revisionBinding: EventEditorRevisionBindingDto,
    val scheduleOutcome: EventEditorScheduleOutcomeDto,
    val graph: EventEditorCreateProposalGraphDto,
)

sealed interface EventEditorCreateResponseDto {
    data class Saved(val result: EventEditorSaveResultDto) : EventEditorCreateResponseDto
    data class Proposed(val proposal: EventEditorCreateProposalDto) : EventEditorCreateResponseDto
}

@Serializable
data class EventEditorErrorDto(
    val error: String,
    val code: String,
    val field: String? = null,
    val editorRevision: String? = null,
    val staffRevision: String? = null,
    val scheduleRevision: String? = null,
    val slotIds: List<String>? = null,
    val occurrenceDate: String? = null,
    val createOperationId: String? = null,
    val divisionId: String? = null,
    val matchCount: Int? = null,
    val capacity: Int? = null,
    val participantCount: Int? = null,
    val requestId: String? = null,
    val details: JsonElement? = null,
)



private val eventEditorCommandJson = Json {
    encodeDefaults = true
    explicitNulls = true
    isLenient = true
    allowSpecialFloatingPointValues = true
    allowStructuredMapKeys = true
    useArrayPolymorphism = false
}

/**
 * Encodes a create command as the exact JSON tree accepted by the web editor contract.
 *
 * The shared HTTP JSON omits nulls for legacy payloads. The editor contract instead requires
 * several nullable keys, while strict nested rows reject nulls on optional non-nullable keys.
 */
fun encodeEventEditorCreateCommand(command: EventEditorCreateCommandDto): JsonObject {
    val wire = eventEditorCommandJson.encodeToJsonElement(
        EventEditorCreateCommandDto.serializer(),
        command,
    ).jsonObject.toEventEditorCommandWire(command.draft)
    val eventType = command.draft.basics.eventType.trim().uppercase()
    return if (
        !command.hasScheduleProposalSupport
        && (eventType == "WEEKLY_EVENT" || eventType == "TRYOUT")
    ) {
        // Weekly and Tryout never use the proposal-only capability marker.
        // Omit it so older site runtimes accept the unchanged command.
        wire.without("hasScheduleProposalSupport")
    } else {
        wire
    }
}

/** Encodes proposal acceptance with the same strict editor draft projection as create. */
fun encodeEventEditorAcceptProposalCommand(
    command: EventEditorAcceptProposalCommandDto,
): JsonObject =
    eventEditorCommandJson.encodeToJsonElement(
        EventEditorAcceptProposalCommandDto.serializer(),
        command,
    ).jsonObject.toEventEditorCommandWire(command.draft)

/** Encodes explicit partial proposal acceptance. */
fun encodeEventEditorAcceptPartialProposalCommand(
    command: EventEditorAcceptPartialProposalCommandDto,
): JsonObject =
    eventEditorCommandJson.encodeToJsonElement(
        EventEditorAcceptPartialProposalCommandDto.serializer(),
        command,
    ).jsonObject.toEventEditorCommandWire(command.draft)

/** Encodes a save command with the same strict editor projection as create. */
fun encodeEventEditorSaveCommand(command: EventEditorSaveCommandDto): JsonObject =
    eventEditorCommandJson.encodeToJsonElement(
        EventEditorSaveCommandDto.serializer(),
        command,
    ).jsonObject.toEventEditorCommandWire(command.draft)

private fun JsonObject.toEventEditorCommandWire(
    draftState: EventEditorDraftDto,
): JsonObject {
    val draftJson = this["draft"]?.jsonObject ?: return this
    val draft = draftJson.withPlayoffConfigPresence(draftState.competition)
    val transition = this["scheduleTransition"]?.jsonObject?.let { value ->
        if (value["mode"]?.jsonPrimitive?.content == "PRESERVE") {
            value.without("expectedScheduleRevision")
        } else {
            value.withoutNulls()
        }
    }
    return withNullable("draft", draft.toEventEditorDraftWire())
        .withNullable("scheduleTransition", transition)
}
private const val PLAYOFF_CONFIG_PRESENCE_MARKER = "__playoffConfigPresent"

private fun JsonObject.withPlayoffConfigPresence(
    competitionState: EventEditorCompetitionDto,
): JsonObject {
    val competition = this["competition"]?.jsonObject ?: return this
    val withRegularPresence = competition.withArray("divisionDetails") { details ->
        details.mapIndexed { index, detail ->
            if (competitionState.divisionDetails.getOrNull(index)?.playoffConfigPresent == true) {
                (detail as? JsonObject)?.withPresenceMarker() ?: detail
            } else {
                detail
            }
        }
    }
    val withPlayoffPresence = withRegularPresence.withArray("playoffDivisionDetails") { details ->
        details.mapIndexed { index, detail ->
            if (competitionState.playoffDivisionDetails.getOrNull(index)?.playoffConfigPresent == true) {
                (detail as? JsonObject)?.withPresenceMarker() ?: detail
            } else {
                detail
            }
        }
    }
    return withNullable("competition", withPlayoffPresence)
}

private fun JsonObject.withPresenceMarker(): JsonObject {
    val result = toMutableMap()
    result[PLAYOFF_CONFIG_PRESENCE_MARKER] = JsonPrimitive(true)
    return JsonObject(result)
}

private fun JsonObject.toEventEditorDraftWire(): JsonObject {
    val basics = this["basics"]?.jsonObject
        ?.withoutNulls()
        ?.withRequiredNulls("parentEvent", "organizationId", "hostId", "imageId")
        ?.withArray("tags") { it.map(::withoutNulls) }
    val participation = this["participation"]?.jsonObject
        ?.withoutNulls()
        ?.withRequiredNulls(
            "teamSizeLimit",
            "maxParticipants",
            "minAge",
            "maxAge",
            "cancellationRefundHours",
        )
    val registration = this["registration"]?.jsonObject?.let { value ->
        value
            .withoutNulls()
            .withNullable("payment", value["payment"]?.jsonObject?.let { payment ->
                payment
                    .withoutNulls()
                    .withRequiredNulls("manualPaymentInstructions", "installmentCount")
                    .withArray("manualPaymentLinks") { it.map(::withoutNulls) }
            })
            .withArray("questions") { it.map(::toQuestionWire) }
    }
    val competition = this["competition"]?.jsonObject?.let { value ->
        value
            .withoutNulls()
            .withRequiredNulls(
                "winnerSetCount",
                "loserSetCount",
                "playoffTeamCount",
                "setsPerMatch",
                "setDurationMinutes",
                "restTimeMinutes",
                "gamesPerOpponent",
                "matchRulesOverride",
                "leagueScoringConfig",
            )
            .withArray("divisionDetails") { it.map { detail -> toDivisionDetailWire(detail, requiredNull = false) } }
            .withArray("playoffDivisionDetails") { it.map { detail -> toDivisionDetailWire(detail, requiredNull = true) } }
    }
    val schedule = this["schedule"]?.jsonObject?.toScheduleWire()
    val resources = this["resources"]?.jsonObject?.let { value ->
        value
            .withoutNulls()
            .withRequiredNulls("rentalBookingId", "rentalBookingItemId", "sourceTemplateId")
            .withArray("fields") { it.map(::withoutNulls) }
            .withArray("timeSlots") { it.map(::withoutNulls) }
    }
    val staff = this["staff"]?.jsonObject?.withoutNulls()
        ?.withArray("eventOfficials") { it.map(::withoutNulls) }
        ?.withArray("pendingInvites") { it.map(::withoutNulls) }
    return this
        .withNullable("basics", basics)
        .withNullable("participation", participation)
        .withNullable("registration", registration)
        .withNullable("competition", competition)
        .withNullable("schedule", schedule)
        .withNullable("resources", resources)
        .withNullable("staff", staff)
}

private fun JsonObject.toScheduleWire(): JsonObject {
    val mode = this["mode"]?.jsonPrimitive?.content
    return when (mode) {
        "FIXED_END" -> withoutNulls().without("generatedScheduleEnd")
        "GENERATED_END" -> withoutNulls().withRequiredNulls("endConstraint")
        else -> withoutNulls()
    }
}

private fun toQuestionWire(value: JsonElement): JsonElement {
    val question = value.jsonObject.withoutNulls().toMutableMap()
    if (question["id"] != null) {
        question.remove("clientId")
    } else {
        question.remove("id")
    }
    return JsonObject(question)
}

private enum class PlayoffConfigWirePresence {
    ABSENT,
    EXPLICIT_NULL,
    VALUE,
}

private fun toDivisionDetailWire(
    value: JsonElement,
    requiredNull: Boolean,
): JsonElement {
    val division = value.jsonObject
    val playoffConfig = division["playoffConfig"]
    val presence = when {
        playoffConfig != null && playoffConfig !is JsonNull -> PlayoffConfigWirePresence.VALUE
        requiredNull ||
            division[PLAYOFF_CONFIG_PRESENCE_MARKER]?.jsonPrimitive?.content == "true" -> {
            PlayoffConfigWirePresence.EXPLICIT_NULL
        }
        else -> PlayoffConfigWirePresence.ABSENT
    }
    val wire = division
        .withoutNulls()
        .without(PLAYOFF_CONFIG_PRESENCE_MARKER)
    return if (presence == PlayoffConfigWirePresence.EXPLICIT_NULL) {
        wire.withRequiredNulls("playoffConfig")
    } else {
        wire
    }
}

private fun withoutNulls(value: JsonElement): JsonElement =
    value.jsonObject.withoutNulls()

private fun JsonObject.withRequiredNulls(vararg keys: String): JsonObject {
    val result = toMutableMap()
    keys.forEach { key ->
        if (!result.containsKey(key)) result[key] = JsonNull
    }
    return JsonObject(result)
}

private fun JsonObject.withNullable(key: String, value: JsonElement?): JsonObject {
    if (value == null) return this
    val result = toMutableMap()
    result[key] = value
    return JsonObject(result)
}

private fun JsonObject.withArray(
    key: String,
    transform: (List<JsonElement>) -> List<JsonElement>,
): JsonObject {
    val array = this[key] as? kotlinx.serialization.json.JsonArray ?: return this
    val result = toMutableMap()
    result[key] = kotlinx.serialization.json.JsonArray(transform(array))
    return JsonObject(result)
}

private fun JsonObject.without(key: String): JsonObject =
    JsonObject(entries.filter { it.key != key }.associate { it.key to it.value })

private fun JsonObject.withoutNulls(): JsonObject =
    JsonObject(entries.filter { it.value !is JsonNull }.associate { it.key to it.value })
