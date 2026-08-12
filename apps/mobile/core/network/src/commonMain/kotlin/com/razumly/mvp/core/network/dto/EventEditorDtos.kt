package com.razumly.mvp.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

const val EVENT_EDITOR_CONTRACT_VERSION: Int = 2

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
data class EventEditorSnapshotDto(
    val contractVersion: Int,
    val draft: EventEditorDraftDto,
    val mode: String,
    val eventId: String? = null,
    val editorRevision: String,
    val staffRevision: String? = null,
    val capabilities: EventEditorCapabilitiesDto,
    val catalogs: EventEditorCatalogsDto,
    val immutable: EventEditorImmutableDto,
)

@Serializable
data class EventEditorCapabilitiesDto(
    val canUseOnlinePayments: Boolean,
    val canManageStaff: Boolean,
    val canEdit: Boolean,
    val supportsTeamStaffing: Boolean,
)

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
)

@Serializable
data class EventEditorScheduleDto(
    val mode: String,
    val endConstraint: String? = null,
    val generatedScheduleEnd: String? = null,
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
    val officialSchedulingMode: String,
    val teamOfficialsMaySwap: Boolean,
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
data class EventEditorCreateCommandDto(
    val contractVersion: Int,
    val createOperationId: String,
    val draft: EventEditorDraftDto,
)

@Serializable
data class EventEditorSaveCommandDto(
    val contractVersion: Int,
    val editorRevision: String,
    val staffRevision: String? = null,
    val draft: EventEditorDraftDto,
)

@Serializable
data class EventEditorSaveResultDto(
    val status: String,
    val snapshot: EventEditorSnapshotDto,
    val questionIdMap: Map<String, String> = emptyMap(),
    val staffEmailDelivery: String,
)

@Serializable
data class EventEditorErrorDto(
    val error: String,
    val code: String,
    val field: String? = null,
    val editorRevision: String? = null,
    val staffRevision: String? = null,
    val requestId: String? = null,
    val details: JsonElement? = null,
)

@Serializable
data class EventEditorScheduleRequestDto(
    val participantCount: Int? = null,
    val includePlaceholderTeams: Boolean? = null,
    val replaceExistingMatches: Boolean = false,
)

@Serializable
data class EventEditorScheduleResponseDto(
    val preview: Boolean = false,
    val event: EventApiDto? = null,
    val matches: List<MatchApiDto> = emptyList(),
    val warnings: List<JsonElement> = emptyList(),
    val didRebuildSchedule: Boolean = false,
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
fun encodeEventEditorCreateCommand(command: EventEditorCreateCommandDto): JsonObject =
    eventEditorCommandJson.encodeToJsonElement(
        EventEditorCreateCommandDto.serializer(),
        command,
    ).jsonObject.toEventEditorCommandWire()

/** Encodes a save command with the same strict editor projection as create. */
fun encodeEventEditorSaveCommand(command: EventEditorSaveCommandDto): JsonObject =
    eventEditorCommandJson.encodeToJsonElement(
        EventEditorSaveCommandDto.serializer(),
        command,
    ).jsonObject.toEventEditorCommandWire()

private fun JsonObject.toEventEditorCommandWire(): JsonObject {
    val draft = this["draft"]?.jsonObject ?: return this
    return withNullable("draft", draft.toEventEditorDraftWire())
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
            .withArray("divisionDetails") { it.map(::toDivisionDetailWire) }
            .withArray("playoffDivisionDetails") { it.map(::toDivisionDetailWire) }
    }
    val schedule = this["schedule"]?.jsonObject?.toScheduleWire()
    val resources = this["resources"]?.jsonObject?.let { value ->
        value
            .withoutNulls()
            .withRequiredNulls("rentalBookingId", "rentalBookingItemId")
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

private fun toDivisionDetailWire(value: JsonElement): JsonElement =
    value.jsonObject.withoutNulls()

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