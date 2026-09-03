package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.isSupportedEventEditorContractVersion
import com.razumly.mvp.core.network.dto.EventEditorBootstrapQueryDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorCreateProposalDto
import com.razumly.mvp.core.network.dto.EventEditorCreateResponseDto
import com.razumly.mvp.core.network.dto.EventEditorErrorDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptPartialProposalCommandDto
import com.razumly.mvp.core.network.dto.EventEditorAcceptProposalCommandDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceAcceptedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRejectedResultDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceRequestDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseDto
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceResponseStatus
import com.razumly.mvp.core.network.dto.EventEditorRejectMaintenanceProposalDto
import com.razumly.mvp.core.network.dto.EventEditorRevisionBindingDto
import com.razumly.mvp.core.network.dto.EventEditorRejectProposalCommandDto
import com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto
import com.razumly.mvp.core.network.dto.EventEditorSaveResultDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.encodeEventEditorAcceptProposalCommand
import com.razumly.mvp.core.network.dto.encodeEventEditorAcceptPartialProposalCommand
import com.razumly.mvp.core.network.dto.encodeEventEditorCreateCommand
import com.razumly.mvp.core.network.dto.encodeEventEditorSaveCommand
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private val maintenanceWireJson = Json {
    encodeDefaults = true
    explicitNulls = true
    isLenient = false
    allowSpecialFloatingPointValues = false
    allowStructuredMapKeys = true
    useArrayPolymorphism = false
    ignoreUnknownKeys = false
    coerceInputValues = false
}

private val maintenancePayloadJson = Json {
    encodeDefaults = true
    explicitNulls = true
    isLenient = false
    allowSpecialFloatingPointValues = false
    allowStructuredMapKeys = true
    useArrayPolymorphism = false
    ignoreUnknownKeys = true
    coerceInputValues = false
}
@Serializable
private data class MaintenanceProposalWire(
    val status: EventEditorMaintenanceResponseStatus,
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
    val revisionBinding: JsonElement,
    val graph: JsonElement,
    val protectedMatchIds: JsonElement,
    val scheduleOutcome: JsonElement,
)

@Serializable
private data class MaintenanceAcceptedWire(
    val status: EventEditorMaintenanceResponseStatus,
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
    val revisionBinding: JsonElement,
    val graph: JsonElement,
    val protectedMatchIds: JsonElement,
    val scheduleOutcome: JsonElement,
    val acceptanceOperationId: String,
)

@Serializable
private data class MaintenanceRejectedWire(
    val status: EventEditorMaintenanceResponseStatus,
    val contractVersion: Int,
    val eventId: String,
    val operation: EventEditorMaintenanceOperation,
    val operationId: String,
    val proposalRevision: String,
)

open class EventEditorApiException(
    val statusCode: Int,
    val url: String,
    val payload: EventEditorErrorDto?,
    val responseBody: String?,
    cause: Throwable? = null,
) : Exception(
    payload?.error?.takeIf(String::isNotBlank)
        ?: "Event editor request failed with HTTP $statusCode.",
    cause,
)

class EventEditorProposalStaleException(
    statusCode: Int,
    url: String,
    payload: EventEditorErrorDto,
    responseBody: String?,
    cause: Throwable? = null,
) : EventEditorApiException(statusCode, url, payload, responseBody, cause)

class EventEditorMaintenanceRejectedException(
    statusCode: Int,
    url: String,
    payload: EventEditorErrorDto,
    responseBody: String?,
    cause: Throwable? = null,
) : EventEditorApiException(statusCode, url, payload, responseBody, cause)

class EventEditorContractException(
    message: String,
) : IllegalStateException(message)

class EventEditorMaintenanceAcceptanceConflictException(
    statusCode: Int,
    url: String,
    payload: EventEditorErrorDto,
    responseBody: String?,
    cause: Throwable? = null,
) : EventEditorApiException(statusCode, url, payload, responseBody, cause)

/**
 * The server committed maintenance, but the mobile cache could not finish synchronizing it.
 *
 * Callers must keep the accepted result and offer sync retry. They must not submit another
 * acceptance request for the same operation.
 */
class EventEditorMaintenanceAcceptedSyncPendingException(
    val result: EventEditorMaintenanceAcceptedResultDto,
    cause: Throwable? = null,
) : IllegalStateException(
    "Schedule maintenance was accepted, but local synchronization is pending.",
    cause,
)

/** Owns event-editor request paths, wire validation, and typed API errors. */
internal class EventEditorRemoteGateway(
    private val api: MvpApiClient,
) {
    suspend fun openCreate(query: EventEditorBootstrapQueryDto): EventEditorCreateBootstrapDto = request {
        api.get<EventEditorCreateBootstrapDto>(createBootstrapPath(query))
    }.also { bootstrap ->
        requireVersion(bootstrap.contractVersion)
        requireVersion(bootstrap.snapshot.contractVersion)
        if (bootstrap.snapshot.mode != "CREATE") {
            throw EventEditorContractException("Event editor create bootstrap returned mode ${bootstrap.snapshot.mode}.")
        }
        if (bootstrap.createOperationId.trim().isBlank()) {
            throw EventEditorContractException("Event editor create bootstrap did not include an operation ID.")
        }
    }

    suspend fun openEdit(eventId: String): EventEditorSnapshotDto {
        val normalizedEventId = requireEventId(eventId)
        return request {
            api.get<EventEditorSnapshotDto>("api/events/$normalizedEventId/editor")
        }.also { snapshot ->
            requireVersion(snapshot.contractVersion)
            if (snapshot.mode != "EDIT") {
                throw EventEditorContractException("Event editor edit bootstrap returned mode ${snapshot.mode}.")
            }
        }
    }

    suspend fun create(command: EventEditorCreateCommandDto): EventEditorCreateResponseDto = request {
        val response = api.post<JsonObject, JsonObject>(
            path = "api/events/editor",
            body = encodeEventEditorCreateCommand(command),
        )
        when (response["status"]?.jsonPrimitive?.content) {
            "SAVED" -> EventEditorCreateResponseDto.Saved(
                jsonMVP.decodeFromJsonElement<EventEditorSaveResultDto>(response),
            ).also { validateSaveResult(it.result) }
            "PROPOSED" -> EventEditorCreateResponseDto.Proposed(
                jsonMVP.decodeFromJsonElement<EventEditorCreateProposalDto>(response),
            ).also { validateProposal(it.proposal) }
            else -> throw EventEditorContractException(
                "Event editor returned unsupported result status ${response["status"]}.",
            )
        }
    }

    suspend fun acceptProposal(
        createOperationId: String,
        proposalRevision: String,
        draft: EventEditorDraftDto,
    ): EventEditorSaveResultDto = request {
        api.put<JsonObject, EventEditorSaveResultDto>(
            path = "api/events/editor",
            body = encodeEventEditorAcceptProposalCommand(
                EventEditorAcceptProposalCommandDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    createOperationId = createOperationId,
                    proposalRevision = proposalRevision,
                    draft = draft,
                ),
            ),
        )
    }.also(::validateSaveResult)

    suspend fun acceptPartialProposal(
        createOperationId: String,
        proposalRevision: String,
        acceptanceOperationId: String,
        draft: EventEditorDraftDto,
    ): EventEditorSaveResultDto = request {
        api.put<JsonObject, EventEditorSaveResultDto>(
            path = "api/events/editor",
            body = encodeEventEditorAcceptPartialProposalCommand(
                EventEditorAcceptPartialProposalCommandDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    createOperationId = createOperationId,
                    proposalRevision = proposalRevision,
                    acceptanceOperationId = acceptanceOperationId,
                    draft = draft,
                ),
            ),
        )
    }.also { result ->
        validateSaveResult(result)
        if (result.scheduleOutcome.status != EventEditorScheduleOutcomeStatus.PARTIAL) {
            throw EventEditorContractException(
                "Partial schedule acceptance returned a non-partial schedule outcome.",
            )
        }
        if (result.acceptanceOperationId?.trim() != acceptanceOperationId.trim()) {
            throw EventEditorContractException(
                "Partial schedule acceptance returned an unexpected operation ID.",
            )
        }
    }

    suspend fun rejectProposal(
        createOperationId: String,
        proposalRevision: String,
    ) {
        request {
            api.deleteNoResponse(
                path = "api/events/editor",
                body = EventEditorRejectProposalCommandDto(
                    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
                    createOperationId = createOperationId,
                    proposalRevision = proposalRevision,
                ),
            )
        }
    }

    suspend fun save(eventId: String, command: EventEditorSaveCommandDto): EventEditorSaveResultDto {
        val normalizedEventId = requireEventId(eventId)
        return request {
            api.put<JsonObject, EventEditorSaveResultDto>(
                path = "api/events/$normalizedEventId/editor",
                body = encodeEventEditorSaveCommand(command),
            )
        }.also(::validateSaveResult)
    }

    suspend fun proposeMaintenance(
        request: EventEditorMaintenanceRequestDto,
    ): EventEditorMaintenanceResponseDto {
        validateMaintenanceRequest(request)
        val normalizedEventId = requireEventId(request.eventId)
        val response = request {
            api.post<JsonObject, JsonObject>(
                path = "api/events/$normalizedEventId/schedule",
                body = encodeMaintenanceRequest(request),
            )
        }
        return decodeMaintenanceResponse(
            response = response,
            expectedEventId = normalizedEventId,
            expectedOperation = request.operation,
            expectedOperationId = request.operationId,
        )
    }

    suspend fun acceptMaintenance(
        request: EventEditorAcceptMaintenanceProposalDto,
    ): EventEditorMaintenanceAcceptedResultDto {
        validateMaintenanceIdentity(
            contractVersion = request.contractVersion,
            eventId = request.eventId,
            operation = request.operation,
            operationId = request.operationId,
        )
        if (request.proposalRevision.trim().isBlank()) {
            throw EventEditorContractException("Maintenance proposal revision is required.")
        }
        if (request.acceptanceOperationId.trim().isBlank()) {
            throw EventEditorContractException("Maintenance acceptance operation ID is required.")
        }
        val normalizedEventId = requireEventId(request.eventId)
        val response = request {
            api.put<EventEditorAcceptMaintenanceProposalDto, JsonObject>(
                path = "api/events/$normalizedEventId/schedule",
                body = request,
            )
        }
        val decoded = decodeMaintenanceResponse(
            response = response,
            expectedEventId = normalizedEventId,
            expectedOperation = request.operation,
            expectedOperationId = request.operationId,
            expectedProposalRevision = request.proposalRevision,
            expectedAcceptanceOperationId = request.acceptanceOperationId,
        )
        return (decoded as? EventEditorMaintenanceResponseDto.Accepted)?.result
            ?: throw EventEditorContractException(
                "Maintenance acceptance returned an unexpected response status.",
            )
    }

    suspend fun rejectMaintenance(
        request: EventEditorRejectMaintenanceProposalDto,
    ): EventEditorMaintenanceRejectedResultDto {
        validateMaintenanceIdentity(
            contractVersion = request.contractVersion,
            eventId = request.eventId,
            operation = request.operation,
            operationId = request.operationId,
        )
        if (request.proposalRevision.trim().isBlank()) {
            throw EventEditorContractException("Maintenance proposal revision is required.")
        }
        val normalizedEventId = requireEventId(request.eventId)
        val response = request {
            api.delete<EventEditorRejectMaintenanceProposalDto, JsonObject>(
                path = "api/events/$normalizedEventId/schedule",
                body = request,
            )
        }
        val decoded = decodeMaintenanceResponse(
            response = response,
            expectedEventId = normalizedEventId,
            expectedOperation = request.operation,
            expectedOperationId = request.operationId,
            expectedProposalRevision = request.proposalRevision,
        )
        return (decoded as? EventEditorMaintenanceResponseDto.Rejected)?.result
            ?: throw EventEditorContractException(
                "Maintenance rejection returned an unexpected response status.",
            )
    }

    private fun encodeMaintenanceRequest(
        request: EventEditorMaintenanceRequestDto,
    ): JsonObject = buildJsonObject {
        put("contractVersion", JsonPrimitive(request.contractVersion))
        put("eventId", JsonPrimitive(request.eventId))
        put("operation", JsonPrimitive(request.operation.name))
        put("operationId", JsonPrimitive(request.operationId))
        request.expectedRevisions?.let { revisions ->
            put(
                "expectedRevisions",
                maintenanceWireJson.encodeToJsonElement(
                    EventEditorRevisionBindingDto.serializer(),
                    revisions,
                ),
            )
        }
        request.participantCount?.let { participantCount ->
            put("participantCount", JsonPrimitive(participantCount))
        }
        request.includePlaceholderTeams?.let { includePlaceholderTeams ->
            put("includePlaceholderTeams", JsonPrimitive(includePlaceholderTeams))
        }
    }

    private fun createBootstrapPath(query: EventEditorBootstrapQueryDto): String {
        val params = buildList {
            fun add(name: String, value: String?) {
                value?.trim()?.takeIf(String::isNotBlank)?.let { normalized ->
                    add("$name=${normalized.encodeURLQueryComponent()}")
                }
            }
            add("organizationId", query.organizationId)
            add("eventType", query.eventType)
            add("sportId", query.sportId)
            add("parentEventId", query.parentEventId)
            add("templateId", query.templateId)
            add("rentalBookingId", query.rentalBookingId)
            add("start", query.start)
        }
        return buildString {
            append("api/events/editor")
            if (params.isNotEmpty()) append("?").append(params.joinToString("&"))
        }
    }

    private fun requireEventId(eventId: String): String = eventId.trim().takeIf(String::isNotBlank)
        ?: throw IllegalArgumentException("Event id is required.")

    private fun requireVersion(version: Int) {
        if (!isSupportedEventEditorContractVersion(version)) {
            throw EventEditorContractException(
                "Update BracketIQ to edit this event (contract version $version is not supported).",
            )
        }
    }

    private fun validateMaintenanceRequest(request: EventEditorMaintenanceRequestDto) {
        validateMaintenanceIdentity(
            contractVersion = request.contractVersion,
            eventId = request.eventId,
            operation = request.operation,
            operationId = request.operationId,
        )
        request.participantCount?.let { count ->
            if (count <= 0) {
                throw EventEditorContractException("Maintenance participantCount must be positive.")
            }
        }
    }

    private fun validateMaintenanceIdentity(
        contractVersion: Int,
        eventId: String,
        operation: EventEditorMaintenanceOperation,
        operationId: String,
    ) {
        requireVersion(contractVersion)
        requireEventId(eventId)
        if (operationId.trim().isBlank()) {
            throw EventEditorContractException("Maintenance operation ID is required.")
        }
        if (operation !in EventEditorMaintenanceOperation.values()) {
            throw EventEditorContractException("Maintenance operation is not supported.")
        }
    }

    private fun decodeMaintenanceResponse(
        response: JsonObject,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
        expectedProposalRevision: String? = null,
        expectedAcceptanceOperationId: String? = null,
    ): EventEditorMaintenanceResponseDto {
        val status = (response["status"] as? JsonPrimitive)?.content
            ?: throw EventEditorContractException("Maintenance response did not include a status.")
        return when (status) {
            EventEditorMaintenanceResponseStatus.PROPOSED.name -> {
                val wire = decodeMaintenanceWire<MaintenanceProposalWire>(
                    response = response,
                    description = "proposal",
                )
                validateMaintenanceProposalWire(
                    wire = wire,
                    expectedEventId = expectedEventId,
                    expectedOperation = expectedOperation,
                    expectedOperationId = expectedOperationId,
                )
                val proposal = decodeMaintenancePayload<EventEditorMaintenanceProposalDto>(
                    response = response,
                    description = "proposal",
                )
                validateMaintenanceProposal(
                    proposal = proposal,
                    expectedEventId = expectedEventId,
                    expectedOperation = expectedOperation,
                    expectedOperationId = expectedOperationId,
                )
                EventEditorMaintenanceResponseDto.Proposed(proposal)
            }

            EventEditorMaintenanceResponseStatus.ACCEPTED.name -> {
                val wire = decodeMaintenanceWire<MaintenanceAcceptedWire>(
                    response = response,
                    description = "accepted result",
                )
                validateMaintenanceAcceptedWire(
                    wire = wire,
                    expectedEventId = expectedEventId,
                    expectedOperation = expectedOperation,
                    expectedOperationId = expectedOperationId,
                    expectedProposalRevision = expectedProposalRevision,
                    expectedAcceptanceOperationId = expectedAcceptanceOperationId,
                )
                val result = decodeMaintenancePayload<EventEditorMaintenanceAcceptedResultDto>(
                    response = response,
                    description = "accepted result",
                )
                validateMaintenanceAcceptedResult(
                    result = result,
                    expectedEventId = expectedEventId,
                    expectedOperation = expectedOperation,
                    expectedOperationId = expectedOperationId,
                    expectedProposalRevision = expectedProposalRevision,
                    expectedAcceptanceOperationId = expectedAcceptanceOperationId,
                )
                EventEditorMaintenanceResponseDto.Accepted(result)
            }

            EventEditorMaintenanceResponseStatus.REJECTED.name -> {
                val wire = decodeMaintenanceWire<MaintenanceRejectedWire>(
                    response = response,
                    description = "rejected result",
                )
                validateMaintenanceRejectedWire(
                    wire = wire,
                    expectedEventId = expectedEventId,
                    expectedOperation = expectedOperation,
                    expectedOperationId = expectedOperationId,
                    expectedProposalRevision = expectedProposalRevision,
                )
                val result = decodeMaintenancePayload<EventEditorMaintenanceRejectedResultDto>(
                    response = response,
                    description = "rejected result",
                )
                validateMaintenanceRejectedResult(
                    result = result,
                    expectedEventId = expectedEventId,
                    expectedOperation = expectedOperation,
                    expectedOperationId = expectedOperationId,
                    expectedProposalRevision = expectedProposalRevision,
                )
                EventEditorMaintenanceResponseDto.Rejected(result)
            }

            else -> throw EventEditorContractException(
                "Maintenance response returned unsupported status $status.",
            )
        }
    }

    private inline fun <reified T> decodeMaintenanceWire(
        response: JsonObject,
        description: String,
    ): T = runCatching {
        maintenanceWireJson.decodeFromJsonElement<T>(response)
    }.getOrElse { error ->
        throw EventEditorContractException(
            "Maintenance response contained an invalid $description envelope: ${error.message}",
        )
    }

    private inline fun <reified T> decodeMaintenancePayload(
        response: JsonObject,
        description: String,
    ): T = runCatching {
        // Keep graph metadata as JsonElement until the repository normalizes it.
        maintenancePayloadJson.decodeFromJsonElement<T>(response)
    }.getOrElse { error ->
        throw EventEditorContractException(
            "Maintenance response contained an invalid $description: ${error.message}",
        )
    }

    private fun validateMaintenanceProposalWire(
        wire: MaintenanceProposalWire,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
    ) {
        if (wire.status != EventEditorMaintenanceResponseStatus.PROPOSED) {
            throw EventEditorContractException("Maintenance response returned an unsupported proposal status.")
        }
        requireVersion(wire.contractVersion)
        requireMaintenanceIdentity(
            eventId = wire.eventId,
            operation = wire.operation,
            operationId = wire.operationId,
            expectedEventId = expectedEventId,
            expectedOperation = expectedOperation,
            expectedOperationId = expectedOperationId,
        )
        requireNonBlank(wire.proposalRevision, "Maintenance proposal revision")
        validateMaintenanceRevisionBinding(wire.revisionBinding)
        val graphMatchIds = validateMaintenanceGraph(
            graph = wire.graph,
            expectedEventId = expectedEventId,
            path = "graph",
        )
        val outcomeMatchIds = validateMaintenanceScheduleOutcome(
            outcome = wire.scheduleOutcome,
            expectedEventId = expectedEventId,
            path = "scheduleOutcome",
        )
        requireEqualMatchIds(graphMatchIds, outcomeMatchIds)
        validateStringArray(wire.protectedMatchIds, "protectedMatchIds")
    }

    private fun validateMaintenanceAcceptedWire(
        wire: MaintenanceAcceptedWire,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
        expectedProposalRevision: String?,
        expectedAcceptanceOperationId: String?,
    ) {
        if (wire.status != EventEditorMaintenanceResponseStatus.ACCEPTED) {
            throw EventEditorContractException("Maintenance response returned an unsupported accepted status.")
        }
        requireVersion(wire.contractVersion)
        requireMaintenanceIdentity(
            eventId = wire.eventId,
            operation = wire.operation,
            operationId = wire.operationId,
            expectedEventId = expectedEventId,
            expectedOperation = expectedOperation,
            expectedOperationId = expectedOperationId,
        )
        requireMaintenanceIdentityValue(
            actual = wire.proposalRevision,
            expected = expectedProposalRevision,
            label = "Maintenance proposal revision",
        )
        requireMaintenanceIdentityValue(
            actual = wire.acceptanceOperationId,
            expected = expectedAcceptanceOperationId,
            label = "Maintenance acceptance operation ID",
        )
        validateMaintenanceRevisionBinding(wire.revisionBinding)
        val graphMatchIds = validateMaintenanceGraph(
            graph = wire.graph,
            expectedEventId = expectedEventId,
            path = "graph",
        )
        val outcomeMatchIds = validateMaintenanceScheduleOutcome(
            outcome = wire.scheduleOutcome,
            expectedEventId = expectedEventId,
            path = "scheduleOutcome",
        )
        requireEqualMatchIds(graphMatchIds, outcomeMatchIds)
        validateStringArray(wire.protectedMatchIds, "protectedMatchIds")
    }

    private fun validateMaintenanceRejectedWire(
        wire: MaintenanceRejectedWire,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
        expectedProposalRevision: String?,
    ) {
        if (wire.status != EventEditorMaintenanceResponseStatus.REJECTED) {
            throw EventEditorContractException("Maintenance response returned an unsupported rejected status.")
        }
        requireVersion(wire.contractVersion)
        requireMaintenanceIdentity(
            eventId = wire.eventId,
            operation = wire.operation,
            operationId = wire.operationId,
            expectedEventId = expectedEventId,
            expectedOperation = expectedOperation,
            expectedOperationId = expectedOperationId,
        )
        requireMaintenanceIdentityValue(
            actual = wire.proposalRevision,
            expected = expectedProposalRevision,
            label = "Rejected maintenance proposal revision",
        )
    }

    private fun validateMaintenanceGraph(
        graph: JsonElement,
        expectedEventId: String,
        path: String,
    ): List<String> {
        val graphObject = requireObjectKeys(graph, MAINTENANCE_GRAPH_KEYS, path)
        val event = requireObjectKeys(
            value = requiredValue(graphObject, "event", path),
            requiredKeys = MAINTENANCE_GRAPH_EVENT_REQUIRED_KEYS,
            allowedKeys = MAINTENANCE_GRAPH_EVENT_KEYS,
            path = "$path.event",
        )
        requireString(event, "id", "$path.event").also { eventId ->
            requireNonBlank(eventId, "Maintenance graph Event id")
            if (eventId != expectedEventId) {
                throw EventEditorContractException("Maintenance graph Event id does not match the request.")
            }
        }
        validateMaintenanceGraphEvent(event, "$path.event")

        val matches = requireArray(graphObject, "matches", path)
        if (matches.isEmpty()) {
            throw EventEditorContractException("Maintenance graph did not include any Match nodes.")
        }
        return matches.mapIndexed { index, match ->
            validateMaintenanceGraphMatch(
                match = match,
                expectedEventId = expectedEventId,
                path = "$path.matches[$index]",
            )
        }
    }

    private fun validateMaintenanceGraphEvent(
        event: JsonObject,
        path: String,
    ) {
        requireStringArray(event, "waitListIds", path)
        requireStringArray(event, "freeAgentIds", path)
        requireStringArray(event, "teamIds", path)
        requireStringArray(event, "userIds", path)
        requireStringArray(event, "fieldIds", path)
        requireStringArray(event, "timeSlotIds", path)
        requireStringArray(event, "officialIds", path)
        requireStringArray(event, "sportIds", path)
        requireStringArray(event, "requiredTemplateIds", path)
        requireStringArray(event, "divisions", path)
        requireBoolean(event, "noFixedEndDateTime", path)
        requireBoolean(event, "teamSignup", path)
        requireBoolean(event, "singleDivision", path)
        requireBoolean(event, "autoCreatePointMatchIncidents", path)
        requireBoolean(event, "allowPaymentPlans", path)
        requireBoolean(event, "allowTeamSplitDefault", path)
        requireBoolean(event, "splitLeaguePlayoffDivisions", path)
        requireInt(event, "maxParticipants", path)
        requireString(event, "name", path)
        requireString(event, "description", path)
        requireString(event, "start", path).also { requireNonBlank(it, "$path.start") }
        requireString(event, "end", path).also { requireNonBlank(it, "$path.end") }
        requireString(event, "location", path)
        requireString(event, "state", path).also { requireNonBlank(it, "$path.state") }
        requireString(event, "officialSchedulingMode", path).also {
            requireNonBlank(it, "$path.officialSchedulingMode")
        }
        requireString(event, "staffingPriority", path).also {
            requireNonBlank(it, "$path.staffingPriority")
        }
        requireString(event, "eventType", path).also { requireNonBlank(it, "$path.eventType") }
        validateMaintenanceObjectArray(event, "officialPositions", path, ::validateGraphOfficialPosition)
        validateMaintenanceObjectArray(event, "eventOfficials", path, ::validateGraphEventOfficial)
        validateMaintenanceObjectArray(event, "divisionDetails", path, ::validateGraphDivision)
        validateMaintenanceObjectArray(event, "playoffDivisionDetails", path, ::validateGraphDivision)
        validateMaintenanceObjectArray(event, "fields", path, ::validateGraphField)
        validateMaintenanceObjectArray(event, "teams", path, ::validateGraphTeam)
        validateMaintenanceObjectArray(event, "timeSlots", path, ::validateGraphTimeSlot)
        validateMaintenanceObjectArray(event, "officials", path, ::validateGraphUser)
    }

    private fun validateMaintenanceGraphMatch(
        match: JsonElement,
        expectedEventId: String,
        path: String,
    ): String {
        val value = requireObjectKeys(
            value = match,
            requiredKeys = MAINTENANCE_GRAPH_MATCH_KEYS,
            allowedKeys = MAINTENANCE_GRAPH_MATCH_ALLOWED_KEYS,
            path = path,
        )
        val id = requireString(value, "id", path).also {
            requireNonBlank(it, "$path.id")
        }
        val eventId = requireString(value, "eventId", path).also {
            requireNonBlank(it, "$path.eventId")
        }
        if (eventId != expectedEventId) {
            throw EventEditorContractException("Maintenance Match Graph belongs to another Event.")
        }
        requireBoolean(value, "locked", path)
        val placementState = requireString(value, "placementState", path)
        if (placementState != "PLACED" && placementState != "UNPLACED") {
            throw EventEditorContractException("Maintenance response $path.placementState is invalid.")
        }
        requireArray(value, "segments", path)
        requireArray(value, "incidents", path)
        requireArray(value, "officialIds", path)
        requireArray(value, "officialAssignments", path)
        requireNull(value, "teamOfficialSeed", path)
        requireArray(value, "team1Points", path)
        requireArray(value, "team2Points", path)
        requireBoolean(value, "losersBracket", path)
        requireBoolean(value, "officialCheckedIn", path)
        requireObjectOrNull(value, "team1", path)
        requireObjectOrNull(value, "team2", path)
        requireObjectOrNull(value, "teamOfficial", path)
        requireObjectOrNull(value, "official", path)
        requireObjectOrNull(value, "field", path)
        validateMaintenanceObjectArray(value, "segments", path, ::validateGraphSegment)
        validateMaintenanceObjectArray(value, "incidents", path, ::validateGraphIncident)
        validateMaintenanceObjectArray(value, "officialIds", path, ::validateGraphOfficialAssignment)
        validateMaintenanceObjectArray(value, "officialAssignments", path, ::validateGraphOfficialAssignment)
        value["team1"]?.let { validateGraphTeamOrNull(it, "$path.team1") }
        value["team2"]?.let { validateGraphTeamOrNull(it, "$path.team2") }
        value["teamOfficial"]?.let { validateGraphTeamOrNull(it, "$path.teamOfficial") }
        value["official"]?.let { validateGraphUserOrNull(it, "$path.official") }
        value["field"]?.let { validateGraphFieldOrNull(it, "$path.field") }
        return id
    }


    private fun validateMaintenanceObjectArray(
        value: JsonObject,
        key: String,
        path: String,
        validator: (JsonObject, String) -> Unit,
    ) {
        requireArray(value, key, path).forEachIndexed { index, item ->
            val objectValue = item as? JsonObject
                ?: throw EventEditorContractException("Maintenance response $path.$key[$index] must be an object.")
            validator(objectValue, "$path.$key[$index]")
        }
    }

    private fun validateGraphUser(value: JsonObject, path: String) {
        requireObjectKeys(value, setOf("id", "firstName", "lastName", "userName"), path)
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireString(value, "firstName", path)
        requireString(value, "lastName", path)
        requireString(value, "userName", path)
    }

    private fun validateGraphUserOrNull(value: JsonElement, path: String) {
        if (value is JsonNull) return
        validateGraphUser(value as? JsonObject
            ?: throw EventEditorContractException("Maintenance response $path must be an object or null."), path)
    }

    private fun validateGraphField(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            requiredKeys = setOf("id", "organizationId", "divisions", "name"),
            path = path,
        )
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireNullableString(value, "organizationId", path)
        requireStringArray(value, "divisions", path)
        requireString(value, "name", path)
    }

    private fun validateGraphFieldOrNull(value: JsonElement, path: String) {
        if (value is JsonNull) return
        validateGraphField(value as? JsonObject
            ?: throw EventEditorContractException("Maintenance response $path must be an object or null."), path)
    }

    private fun validateGraphTeam(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            requiredKeys = setOf(
                "id", "captainId", "division", "kind", "name", "playerIds",
                "players", "playerRegistrations",
            ),
            path = path,
        )
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireNullableString(value, "captainId", path)
        requireNullableString(value, "division", path)
        requireNullableString(value, "kind", path)
        requireString(value, "name", path)
        requireStringArray(value, "playerIds", path)
        validateMaintenanceObjectArray(value, "players", path, ::validateGraphUser)
        validateMaintenanceObjectArray(value, "playerRegistrations", path, ::validateGraphRegistration)
    }

    private fun validateGraphTeamOrNull(value: JsonElement, path: String) {
        if (value is JsonNull) return
        validateGraphTeam(value as? JsonObject
            ?: throw EventEditorContractException("Maintenance response $path must be an object or null."), path)
    }

    private fun validateGraphRegistration(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            requiredKeys = setOf("id", "teamId", "userId", "status", "jerseyNumber", "position", "isCaptain"),
            path = path,
        )
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireNullableString(value, "teamId", path)
        requireString(value, "userId", path).also { requireNonBlank(it, "$path.userId") }
        requireString(value, "status", path)
        requireNullableString(value, "jerseyNumber", path)
        requireNullableString(value, "position", path)
        requireBoolean(value, "isCaptain", path)
    }

    private fun validateGraphEventOfficial(value: JsonObject, path: String) {
        requireObjectKeys(value, setOf("id", "userId", "positionIds", "fieldIds", "isActive"), path)
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireString(value, "userId", path).also { requireNonBlank(it, "$path.userId") }
        requireStringArray(value, "positionIds", path)
        requireStringArray(value, "fieldIds", path)
        requireBoolean(value, "isActive", path)
    }

    private fun validateGraphTimeSlot(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            setOf(
                "id", "dayOfWeek", "daysOfWeek", "endDate", "repeating", "startTimeMinutes",
                "endTimeMinutes", "price", "scheduledFieldId", "scheduledFieldIds", "divisions",
            ),
            path,
            allowedKeys = setOf(
                "id", "dayOfWeek", "daysOfWeek", "startDate", "endDate", "repeating",
                "startTimeMinutes", "endTimeMinutes", "price", "scheduledFieldId",
                "scheduledFieldIds", "divisions",
            ),
        )
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        val day = requireInt(value, "dayOfWeek", path)
        if (day !in 0..6) throw EventEditorContractException("Maintenance response $path.dayOfWeek is invalid.")
        requireIntArrayRange(value, "daysOfWeek", path)
        value["startDate"]?.let { requireStringValue(it, "$path.startDate") }
        requireNullableString(value, "endDate", path)
        requireBoolean(value, "repeating", path)
        requireInt(value, "startTimeMinutes", path)
        requireInt(value, "endTimeMinutes", path)
        requireNumberOrNull(value, "price", path)
        requireNullableString(value, "scheduledFieldId", path)
        requireStringArray(value, "scheduledFieldIds", path)
        requireStringArray(value, "divisions", path)
    }

    private fun validateGraphDivision(value: JsonObject, path: String) {
        val graphDivisionKeys = setOf(
            "id", "name", "kind", "role", "phase", "sourceDivisionId", "isSystemGenerated",
            "phaseSettings", "teamIds", "playoffTeamCount", "playoffPlacementDivisionIds",
            "standingsOverrides", "standingsConfirmedAt", "standingsConfirmedBy",
            "playoffConfig", "leagueConfig",
        )
        requireObjectKeys(
            value = value,
            requiredKeys = graphDivisionKeys,
            allowedKeys = graphDivisionKeys,
            path = path,
        )
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireString(value, "name", path)
        requireString(value, "kind", path)
        requireString(value, "role", path)
        requireNullableString(value, "phase", path)
        requireNullableString(value, "sourceDivisionId", path)
        requireBoolean(value, "isSystemGenerated", path)
        requireObject(value, "phaseSettings", path).values.forEach { settings ->
            val settingsObject = settings as? JsonObject
                ?: throw EventEditorContractException("Maintenance response $path.phaseSettings must contain objects.")
            validateGraphPhaseSettings(settingsObject, "$path.phaseSettings")
        }
        requireStringArray(value, "teamIds", path)
        requireNullableInt(value, "playoffTeamCount", path)
        requireStringArray(value, "playoffPlacementDivisionIds", path)
        requireObjectOrNullValue(value.getValue("standingsOverrides"), "$path.standingsOverrides")
        requireNullableString(value, "standingsConfirmedAt", path)
        requireNullableString(value, "standingsConfirmedBy", path)
        validateGraphPlayoffConfig(value.getValue("playoffConfig"), "$path.playoffConfig")
        validateGraphLeagueConfig(value.getValue("leagueConfig"), "$path.leagueConfig")
    }

    private fun validateGraphPlayoffConfig(value: JsonElement, path: String) {
        if (value is JsonNull) return
        val requiredKeys = setOf(
            "doubleElimination", "winnerSetCount", "loserSetCount",
            "winnerBracketPointsToVictory", "loserBracketPointsToVictory", "prize",
            "fieldCount", "restTimeMinutes",
        )
        val allowedKeys = requiredKeys + setOf("matchDurationMinutes", "setDurationMinutes")
        val config = requireObjectKeys(value, requiredKeys, path, allowedKeys)
        requireBoolean(config, "doubleElimination", path)
        requireInt(config, "winnerSetCount", path)
        requireInt(config, "loserSetCount", path)
        requireArray(config, "winnerBracketPointsToVictory", path)
            .forEach { requireNumberValue(it, "$path.winnerBracketPointsToVictory") }
        requireArray(config, "loserBracketPointsToVictory", path)
            .forEach { requireNumberValue(it, "$path.loserBracketPointsToVictory") }
        requireString(config, "prize", path)
        requireInt(config, "fieldCount", path)
        requireInt(config, "restTimeMinutes", path)
        config["matchDurationMinutes"]?.let { requireNullableIntValue(it, "$path.matchDurationMinutes") }
        config["setDurationMinutes"]?.let { requireNullableIntValue(it, "$path.setDurationMinutes") }
    }

    private fun validateGraphLeagueConfig(value: JsonElement, path: String) {
        if (value is JsonNull) return
        val keys = setOf(
            "gamesPerOpponent", "includePlayoffs", "playoffTeamCount", "usesSets",
            "matchDurationMinutes", "setDurationMinutes", "setsPerMatch", "pointsToVictory",
            "restTimeMinutes",
        )
        val config = requireObjectKeys(value, emptySet(), path, keys)
        config["gamesPerOpponent"]?.let { requireIntValue(it, "$path.gamesPerOpponent") }
        config["includePlayoffs"]?.let { requireBooleanValue(it, "$path.includePlayoffs") }
        config["playoffTeamCount"]?.let { requireIntValue(it, "$path.playoffTeamCount") }
        config["usesSets"]?.let { requireBooleanValue(it, "$path.usesSets") }
        config["matchDurationMinutes"]?.let { requireNullableIntValue(it, "$path.matchDurationMinutes") }
        config["setDurationMinutes"]?.let { requireNullableIntValue(it, "$path.setDurationMinutes") }
        config["setsPerMatch"]?.let { requireIntValue(it, "$path.setsPerMatch") }
        config["pointsToVictory"]?.let { points ->
            requireArrayValue(points, "$path.pointsToVictory")
                .forEach { requireNumberValue(it, "$path.pointsToVictory") }
        }
        config["restTimeMinutes"]?.let { requireIntValue(it, "$path.restTimeMinutes") }
    }

    private fun validateGraphOfficialPosition(value: JsonObject, path: String) {
        val keys = setOf("id", "name", "count", "order")
        requireObjectKeys(value, keys, path, keys)
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireString(value, "name", path)
        val count = requireInt(value, "count", path)
        val order = requireInt(value, "order", path)
        if (count < 0 || order < 0) {
            throw EventEditorContractException("Maintenance response $path has invalid position bounds.")
        }
    }

    private fun validateGraphPhaseSettings(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            emptySet(),
            path,
            allowedKeys = setOf(
                "matchRulesOverride", "autoCreatePointMatchIncidents", "segmentLengthMinutes",
                "segmentBreakMinutes", "doTeamsOfficiate", "officialPositions",
            ),
        )
        value["autoCreatePointMatchIncidents"]?.let { requireBooleanValue(it, "$path.autoCreatePointMatchIncidents") }
        value["segmentLengthMinutes"]?.let { requireNullableIntValue(it, "$path.segmentLengthMinutes") }
        value["segmentBreakMinutes"]?.let { requireNullableIntValue(it, "$path.segmentBreakMinutes") }
        value["doTeamsOfficiate"]?.let { requireBooleanValue(it, "$path.doTeamsOfficiate") }
        value["officialPositions"]?.let { validateObjectArray(it, "$path.officialPositions", ::validateGraphOfficialPosition) }
    }

    private fun validateGraphSegment(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            setOf("id", "matchId", "sequence", "status", "scores"),
            path,
            allowedKeys = setOf(
                "id", "eventId", "matchId", "sequence", "status", "scores", "winnerEventTeamId",
                "startedAt", "endedAt", "resultType", "statusReason", "metadata", "createdAt", "updatedAt",
            ),
        )
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        value["eventId"]?.let { requireNullableStringValue(it, "$path.eventId") }
        requireString(value, "matchId", path).also { requireNonBlank(it, "$path.matchId") }
        requireInt(value, "sequence", path)
        requireString(value, "status", path)
        requireObject(value, "scores", path).forEach { (key, score) ->
            requireNumberValue(score, "$path.scores.$key")
        }
        value["winnerEventTeamId"]?.let { requireNullableStringValue(it, "$path.winnerEventTeamId") }
        listOf("startedAt", "endedAt", "resultType", "statusReason", "createdAt", "updatedAt").forEach { key ->
            value[key]?.let { requireNullableStringValue(it, "$path.$key") }
        }
        value["metadata"]?.let { requireObjectOrNullValue(it, "$path.metadata") }
    }

    private fun validateGraphIncident(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            setOf("id", "matchId", "incidentType", "sequence"),
            path,
            allowedKeys = setOf(
                "id", "eventId", "matchId", "segmentId", "eventTeamId", "eventRegistrationId",
                "participantUserId", "officialUserId", "incidentType", "sequence", "minute", "clock",
                "clockSeconds", "linkedPointDelta", "note", "metadata", "createdAt", "updatedAt",
            ),
        )
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        value["eventId"]?.let { requireNullableStringValue(it, "$path.eventId") }
        requireString(value, "matchId", path).also { requireNonBlank(it, "$path.matchId") }
        listOf("segmentId", "eventTeamId", "eventRegistrationId", "participantUserId", "officialUserId")
            .forEach { key -> value[key]?.let { requireNullableStringValue(it, "$path.$key") } }
        requireString(value, "incidentType", path)
        requireInt(value, "sequence", path)
        listOf("minute", "clockSeconds").forEach { key ->
            value[key]?.let { requireNullableIntValue(it, "$path.$key") }
        }
        value["clock"]?.let { requireNullableStringValue(it, "$path.clock") }
        value["linkedPointDelta"]?.let { requireNullableNumberValue(it, "$path.linkedPointDelta") }
        value["note"]?.let { requireNullableStringValue(it, "$path.note") }
        listOf("metadata", "createdAt", "updatedAt").forEach { key ->
            value[key]?.let {
                if (key == "metadata") requireObjectOrNullValue(it, "$path.$key")
                else requireNullableStringValue(it, "$path.$key")
            }
        }
    }

    private fun validateGraphOfficialAssignment(value: JsonObject, path: String) {
        requireObjectKeys(
            value,
            setOf("positionId", "slotIndex", "holderType", "userId", "eventOfficialId", "checkedIn", "hasConflict"),
            path,
        )
        requireString(value, "positionId", path).also { requireNonBlank(it, "$path.positionId") }
        requireInt(value, "slotIndex", path)
        requireString(value, "holderType", path)
        requireNullableString(value, "userId", path)
        requireNullableString(value, "eventOfficialId", path)
        requireBoolean(value, "checkedIn", path)
        requireBoolean(value, "hasConflict", path)
    }

    private fun validateObjectArray(
        value: JsonElement,
        path: String,
        validator: (JsonObject, String) -> Unit,
    ) {
        val array = value as? JsonArray
            ?: throw EventEditorContractException("Maintenance response $path must be an array.")
        array.forEachIndexed { index, item ->
            validator(
                item as? JsonObject
                    ?: throw EventEditorContractException("Maintenance response $path[$index] must be an object."),
                "$path[$index]",
            )
        }
    }
    private fun validateJsonObjectArray(value: JsonObject, key: String, path: String) {
        requireArray(value, key, path).forEachIndexed { index, item ->
            if (item !is JsonObject) {
                throw EventEditorContractException("Maintenance response $path.$key[$index] must be an object.")
            }
        }
    }

    private fun validateMaintenanceScheduleOutcome(
        outcome: JsonElement,
        expectedEventId: String,
        path: String,
    ): List<String> {
        val value = requireObjectKeys(outcome, MAINTENANCE_OUTCOME_KEYS, path)
        val status = requireString(value, "status", path)
        val isComplete = requireBoolean(value, "isComplete", path)
        val matchCount = requireInt(value, "matchCount", path)
        val placedMatchCount = requireInt(value, "placedMatchCount", path)
        val unplacedMatchCount = requireInt(value, "unplacedMatchCount", path)
        if (matchCount <= 0 || placedMatchCount < 0 || unplacedMatchCount < 0) {
            throw EventEditorContractException("Maintenance schedule outcome counts are invalid.")
        }
        val matches = requireArray(value, "matches", path)
        if (matches.size != matchCount) {
            throw EventEditorContractException("Maintenance schedule outcome Match count is invalid.")
        }
        val matchIds = matches.mapIndexed { index, match ->
            validateMaintenanceProjectionMatch(
                match = match,
                expectedEventId = expectedEventId,
                path = "$path.matches[$index]",
            )
        }
        validateMaintenanceObjectArray(value, "unscheduledMatches", path, ::validateUnscheduledMatch)
        validateMaintenanceObjectArray(value, "affectedCompetitionPhases", path, ::validateAffectedPhase)
        value["diagnostics"]?.takeUnless { it is JsonNull }?.let {
            validateDiagnostics(it, "$path.diagnostics")
        }
        validateWarnings(value, path)
        when (status) {
            EventEditorMaintenanceScheduleOutcomeStatus.COMPLETE.name -> {
                if (!isComplete || unplacedMatchCount != 0 || placedMatchCount != matchCount) {
                    throw EventEditorContractException("Complete maintenance schedule outcome is invalid.")
                }
            }

            EventEditorMaintenanceScheduleOutcomeStatus.INCOMPLETE.name -> {
                if (isComplete || unplacedMatchCount <= 0 || placedMatchCount + unplacedMatchCount != matchCount) {
                    throw EventEditorContractException("Incomplete maintenance schedule outcome is invalid.")
                }
            }

            else -> throw EventEditorContractException(
                "Maintenance schedule outcome returned unsupported status $status.",
            )
        }
        return matchIds
    }
    private fun validateUnscheduledMatch(value: JsonObject, path: String) {
        requireObjectKeys(value, setOf("id", "matchId", "phaseDivisionId", "phase", "sourceDivisionId"), path)
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireNullableInt(value, "matchId", path)
        requireString(value, "phaseDivisionId", path).also { requireNonBlank(it, "$path.phaseDivisionId") }
        requireString(value, "phase", path)
        requireNullableString(value, "sourceDivisionId", path)
    }

    private fun validateAffectedPhase(value: JsonObject, path: String) {
        requireObjectKeys(value, setOf("id", "name", "phase", "sourceDivisionId"), path)
        requireString(value, "id", path).also { requireNonBlank(it, "$path.id") }
        requireString(value, "name", path)
        requireString(value, "phase", path)
        requireNullableString(value, "sourceDivisionId", path)
    }


    private fun validateMaintenanceProjectionMatch(
        match: JsonElement,
        expectedEventId: String,
        path: String,
    ): String {
        val value = requireObjectKeys(match, MAINTENANCE_PROJECTION_MATCH_KEYS, path)
        val id = requireString(value, "id", path).also {
            requireNonBlank(it, "$path.id")
        }
        val eventId = requireString(value, "eventId", path).also {
            requireNonBlank(it, "$path.eventId")
        }
        if (eventId != expectedEventId) {
            throw EventEditorContractException("Maintenance schedule Match belongs to another Event.")
        }
        requireBoolean(value, "locked", path)
        val placementState = requireString(value, "placementState", path)
        if (placementState != "PLACED" && placementState != "UNPLACED") {
            throw EventEditorContractException("Maintenance response $path.placementState is invalid.")
        }
        requireArray(value, "team1Points", path).forEach { requireNumberValue(it, "$path.team1Points") }
        requireArray(value, "team2Points", path).forEach { requireNumberValue(it, "$path.team2Points") }
        validateJsonObjectArray(value, "segments", path)
        validateJsonObjectArray(value, "incidents", path)
        validateJsonObjectArray(value, "officialIds", path)
        requireBoolean(value, "losersBracket", path)
        requireBoolean(value, "officialCheckedIn", path)
        return id
    }

    private fun validateMaintenanceRevisionBinding(value: JsonElement) {
        val binding = requireObjectKeys(value, MAINTENANCE_REVISION_KEYS, "revisionBinding")
        requireString(binding, "editorRevision", "revisionBinding")
        requireString(binding, "scheduleRevision", "revisionBinding")
        requireString(binding, "availabilityRevision", "revisionBinding")
        requireObject(binding, "fieldRevisions", "revisionBinding")
        requireObject(binding, "timeSlotRevisions", "revisionBinding")
        requireObject(binding, "rentalBookingRevisions", "revisionBinding")
        requireObject(binding, "rentalBookingItemRevisions", "revisionBinding")
    }

    private fun validateWarnings(value: JsonObject, path: String) {
        val warnings = requireArray(value, "warnings", path)
        warnings.forEachIndexed { index, warning ->
            val warningObject = requireObjectKeys(
                warning,
                requiredKeys = setOf("code", "message"),
                allowedKeys = MAINTENANCE_WARNING_KEYS,
                path = "$path.warnings[$index]",
            )
            requireString(warningObject, "code", "$path.warnings[$index]")
            requireString(warningObject, "message", "$path.warnings[$index]")
            warningObject["matchIds"]?.let { validateStringArray(it, "$path.warnings[$index].matchIds") }
            warningObject["restrictingFactor"]?.let {
                requireStringValue(it, "$path.warnings[$index].restrictingFactor")
            }
        }
    }

    private fun validateDiagnostics(value: JsonElement, path: String) {
        val diagnostics = requireObjectKeys(
            value,
            requiredKeys = setOf(
                "message",
                "matchDemand",
                "estimatedCapacity",
                "estimatedCapacityIsUpperBound",
                "minimumDeficitMatches",
                "searchComplete",
                "restrictingFactors",
                "remedies",
            ),
            path = path,
        )
        requireString(diagnostics, "message", path)
        val demand = requireObjectKeys(
            requireObject(diagnostics, "matchDemand", path),
            requiredKeys = setOf("total", "byDivision", "byPhase", "placed", "unplaced"),
            path = "$path.matchDemand",
        )
        listOf("total", "placed", "unplaced").forEach { key ->
            if (requireInt(demand, key, "$path.matchDemand") < 0) {
                throw EventEditorContractException("Maintenance response $path.matchDemand.$key cannot be negative.")
            }
        }
        listOf("byDivision", "byPhase").forEach { key ->
            requireObject(demand, key, "$path.matchDemand").forEach { (entryKey, entryValue) ->
                val number = entryValue as? JsonPrimitive
                if (number == null || number.isString || number.content.toIntOrNull() == null || number.content.toInt() < 0) {
                    throw EventEditorContractException("Maintenance response $path.matchDemand.$key.$entryKey must contain a non-negative integer.")
                }
            }
        }
        if (requireInt(diagnostics, "estimatedCapacity", path) < 0
            || requireInt(diagnostics, "minimumDeficitMatches", path) < 0
        ) {
            throw EventEditorContractException("Maintenance response $path capacity values cannot be negative.")
        }
        if (!requireBoolean(diagnostics, "estimatedCapacityIsUpperBound", path)) {
            throw EventEditorContractException("Maintenance response $path must mark Estimated Capacity as an upper bound.")
        }
        validateMaintenanceObjectArray(diagnostics, "restrictingFactors", path) { factor, factorPath ->
            requireObjectKeys(factor, setOf("factor", "confidence", "message", "evidence"), factorPath)
            requireString(factor, "factor", factorPath)
            requireString(factor, "confidence", factorPath)
            requireString(factor, "message", factorPath)
            validateMaintenanceObjectArray(factor, "evidence", factorPath) { evidence, evidencePath ->
                requireObjectKeys(evidence, setOf("kind", "message"), evidencePath, DIAGNOSTIC_EVIDENCE_KEYS)
                requireString(evidence, "kind", evidencePath)
                requireString(evidence, "message", evidencePath)
                validateDiagnosticEvidenceValues(evidence, evidencePath)
            }
        }
        validateMaintenanceObjectArray(diagnostics, "remedies", path) { remedy, remedyPath ->
            requireObjectKeys(remedy, setOf("code", "factor", "message", "evidence"), remedyPath)
            requireString(remedy, "code", remedyPath)
            requireString(remedy, "factor", remedyPath)
            requireString(remedy, "message", remedyPath)
            validateMaintenanceObjectArray(remedy, "evidence", remedyPath) { evidence, evidencePath ->
                requireObjectKeys(evidence, setOf("kind", "message"), evidencePath, DIAGNOSTIC_EVIDENCE_KEYS)
                requireString(evidence, "kind", evidencePath)
                requireString(evidence, "message", evidencePath)
                validateDiagnosticEvidenceValues(evidence, evidencePath)
            }
        }
    }

    private fun validateDiagnosticEvidenceValues(value: JsonObject, path: String) {
        listOf("matchIds", "resourceIds", "divisionIds", "teamIds", "dependencyIds", "officialIds", "timeSlotIds").forEach { key ->
            value[key]?.let { validateStringArray(it, "$path.$key") }
        }
        value["intervals"]?.let { intervals ->
            val intervalArray = intervals as? JsonArray
                ?: throw EventEditorContractException("Maintenance response $path.intervals must be an array.")
            intervalArray.forEachIndexed { index, intervalElement ->
                val interval = intervalElement as? JsonObject
                    ?: throw EventEditorContractException("Maintenance response $path.intervals[$index] must be an object.")
                val intervalPath = "$path.intervals[$index]"
                requireObjectKeys(interval, setOf("start", "end"), intervalPath)
                requireString(interval, "start", intervalPath)
                requireString(interval, "end", intervalPath)
            }
        }
        listOf("demand", "capacity", "deficit", "candidateCount").forEach { key ->
            value[key]?.let { number ->
                val primitive = number as? JsonPrimitive
                if (primitive == null || primitive.isString || primitive.content.toIntOrNull() == null || primitive.content.toInt() < 0) {
                    throw EventEditorContractException("Maintenance response $path.$key must contain a non-negative integer.")
                }
            }
        }
    }

    private fun requireEqualMatchIds(graphMatchIds: List<String>, outcomeMatchIds: List<String>) {
        if (graphMatchIds != outcomeMatchIds) {
            throw EventEditorContractException(
                "Maintenance graph and schedule outcome Match identities do not match.",
            )
        }
    }

    private fun validateMaintenanceProposal(
        proposal: EventEditorMaintenanceProposalDto,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
    ) {
        if (proposal.status != EventEditorMaintenanceResponseStatus.PROPOSED) {
            throw EventEditorContractException(
                "Maintenance response returned unsupported proposal status ${proposal.status}.",
            )
        }
        requireVersion(proposal.contractVersion)
        requireMaintenanceIdentity(
            eventId = proposal.eventId,
            operation = proposal.operation,
            operationId = proposal.operationId,
            expectedEventId = expectedEventId,
            expectedOperation = expectedOperation,
            expectedOperationId = expectedOperationId,
        )
        requireNonBlank(proposal.proposalRevision, "Maintenance proposal revision")
    }

    private fun validateMaintenanceAcceptedResult(
        result: EventEditorMaintenanceAcceptedResultDto,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
        expectedProposalRevision: String?,
        expectedAcceptanceOperationId: String?,
    ) {
        if (result.status != EventEditorMaintenanceResponseStatus.ACCEPTED) {
            throw EventEditorContractException(
                "Maintenance response returned unsupported accepted status ${result.status}.",
            )
        }
        requireVersion(result.contractVersion)
        requireMaintenanceIdentity(
            eventId = result.eventId,
            operation = result.operation,
            operationId = result.operationId,
            expectedEventId = expectedEventId,
            expectedOperation = expectedOperation,
            expectedOperationId = expectedOperationId,
        )
        requireMaintenanceIdentityValue(
            actual = result.proposalRevision,
            expected = expectedProposalRevision,
            label = "Maintenance proposal revision",
        )
        requireMaintenanceIdentityValue(
            actual = result.acceptanceOperationId,
            expected = expectedAcceptanceOperationId,
            label = "Maintenance acceptance operation ID",
        )
    }

    private fun validateMaintenanceRejectedResult(
        result: EventEditorMaintenanceRejectedResultDto,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
        expectedProposalRevision: String?,
    ) {
        if (result.status != EventEditorMaintenanceResponseStatus.REJECTED) {
            throw EventEditorContractException(
                "Maintenance response returned unsupported rejected status ${result.status}.",
            )
        }
        requireVersion(result.contractVersion)
        requireMaintenanceIdentity(
            eventId = result.eventId,
            operation = result.operation,
            operationId = result.operationId,
            expectedEventId = expectedEventId,
            expectedOperation = expectedOperation,
            expectedOperationId = expectedOperationId,
        )
        requireMaintenanceIdentityValue(
            actual = result.proposalRevision,
            expected = expectedProposalRevision,
            label = "Rejected maintenance proposal revision",
        )
    }

    private fun requireMaintenanceIdentity(
        eventId: String,
        operation: EventEditorMaintenanceOperation,
        operationId: String,
        expectedEventId: String,
        expectedOperation: EventEditorMaintenanceOperation,
        expectedOperationId: String,
    ) {
        if (eventId != expectedEventId ||
            operation != expectedOperation ||
            operationId != expectedOperationId
        ) {
            throw EventEditorContractException("Maintenance response identity does not match the request.")
        }
    }

    private fun requireMaintenanceIdentityValue(actual: String, expected: String?, label: String) {
        requireNonBlank(actual, label)
        if (expected != null && actual != expected) {
            throw EventEditorContractException("$label does not match the request.")
        }
    }

    private fun requireNonBlank(value: String, label: String) {
        if (value.isBlank()) {
            throw EventEditorContractException("$label is required.")
        }
    }

    private fun requireObjectKeys(
        value: JsonElement,
        requiredKeys: Set<String>,
        path: String,
        allowedKeys: Set<String> = requiredKeys,
    ): JsonObject {
        val objectValue = value as? JsonObject
            ?: throw EventEditorContractException("Maintenance response $path must be an object.")
        val missing = requiredKeys - objectValue.keys
        if (missing.isNotEmpty()) {
            throw EventEditorContractException(
                "Maintenance response $path is missing ${missing.sorted().joinToString(", ")}.",
            )
        }
        val unexpected = objectValue.keys - allowedKeys
        if (unexpected.isNotEmpty()) {
            throw EventEditorContractException(
                "Maintenance response $path contains unsupported ${unexpected.sorted().joinToString(", ")}.",
            )
        }
        return objectValue
    }

    private fun requiredValue(value: JsonObject, key: String, path: String): JsonElement =
        value[key] ?: throw EventEditorContractException("Maintenance response $path is missing $key.")

    private fun requireString(value: JsonObject, key: String, path: String): String =
        requireStringValue(requiredValue(value, key, path), "$path.$key")

    private fun requireStringValue(value: JsonElement, path: String): String {
        val primitive = value as? JsonPrimitive
        if (primitive == null || !primitive.isString) {
            throw EventEditorContractException("Maintenance response $path must contain a string.")
        }
        return primitive.content
    }

    private fun requireInt(value: JsonObject, key: String, path: String): Int {
        val primitive = requiredValue(value, key, path) as? JsonPrimitive
            ?: throw EventEditorContractException("Maintenance response $path.$key must contain an integer.")
        if (primitive.isString) {
            throw EventEditorContractException("Maintenance response $path.$key must contain an integer.")
        }
        return primitive.content.toIntOrNull()
            ?: throw EventEditorContractException("Maintenance response $path.$key must contain an integer.")
    }

    private fun requireBoolean(value: JsonObject, key: String, path: String): Boolean {
        val primitive = requiredValue(value, key, path) as? JsonPrimitive
            ?: throw EventEditorContractException("Maintenance response $path.$key must contain a boolean.")
        if (primitive.isString || primitive.content !in setOf("true", "false")) {
            throw EventEditorContractException("Maintenance response $path.$key must contain a boolean.")
        }
        return primitive.content == "true"
    }
    private fun requireIntValue(value: JsonElement, path: String): Int {
        val primitive = value as? JsonPrimitive
            ?: throw EventEditorContractException("Maintenance response $path must contain an integer.")
        if (primitive.isString) {
            throw EventEditorContractException("Maintenance response $path must contain an integer.")
        }
        return primitive.content.toIntOrNull()
            ?: throw EventEditorContractException("Maintenance response $path must contain an integer.")
    }

    private fun requireArrayValue(value: JsonElement, path: String): JsonArray =
        value as? JsonArray
            ?: throw EventEditorContractException("Maintenance response $path must be an array.")


    private fun requireNullableString(value: JsonObject, key: String, path: String) {
        requireNullableStringValue(requiredValue(value, key, path), "$path.$key")
    }

    private fun requireNullableStringValue(value: JsonElement, path: String) {
        if (value !is JsonNull) requireStringValue(value, path)
    }

    private fun requireNullableInt(value: JsonObject, key: String, path: String) {
        requireNullableIntValue(requiredValue(value, key, path), "$path.$key")
    }

    private fun requireNullableIntValue(value: JsonElement, path: String) {
        if (value is JsonNull) return
        val primitive = value as? JsonPrimitive
            ?: throw EventEditorContractException("Maintenance response $path must contain an integer or null.")
        if (primitive.isString || primitive.content.toIntOrNull() == null) {
            throw EventEditorContractException("Maintenance response $path must contain an integer or null.")
        }
    }

    private fun requireNumberValue(value: JsonElement, path: String) {
        val primitive = value as? JsonPrimitive
        if (primitive == null || primitive.isString || primitive.content.toDoubleOrNull() == null) {
            throw EventEditorContractException("Maintenance response $path must contain a number.")
        }
    }

    private fun requireNullableNumberValue(value: JsonElement, path: String) {
        if (value !is JsonNull) requireNumberValue(value, path)
    }

    private fun requireNumberOrNull(value: JsonObject, key: String, path: String) {
        requireNullableNumberValue(requiredValue(value, key, path), "$path.$key")
    }

    private fun requireBooleanValue(value: JsonElement, path: String) {
        val primitive = value as? JsonPrimitive
        if (primitive == null || primitive.isString || primitive.content !in setOf("true", "false")) {
            throw EventEditorContractException("Maintenance response $path must contain a boolean.")
        }
    }

    private fun requireIntArrayRange(value: JsonObject, key: String, path: String) {
        requireArray(value, key, path).forEachIndexed { index, item ->
            val primitive = item as? JsonPrimitive
            val number = primitive?.takeUnless(JsonPrimitive::isString)?.content?.toIntOrNull()
            if (number == null || number !in 0..6) {
                throw EventEditorContractException("Maintenance response $path.$key[$index] is invalid.")
            }
        }
    }

    private fun requireNull(value: JsonObject, key: String, path: String) {
        if (requiredValue(value, key, path) !is JsonNull) {
            throw EventEditorContractException("Maintenance response $path.$key must be null.")
        }
    }

    private fun requireArray(value: JsonObject, key: String, path: String): JsonArray =
        requiredValue(value, key, path) as? JsonArray
            ?: throw EventEditorContractException("Maintenance response $path.$key must be an array.")

    private fun requireObject(value: JsonObject, key: String, path: String): JsonObject =
        requiredValue(value, key, path) as? JsonObject
            ?: throw EventEditorContractException("Maintenance response $path.$key must be an object.")

    private fun requireObjectOrNull(value: JsonObject, key: String, path: String) {
        val field = requiredValue(value, key, path)
        if (field !is JsonNull && field !is JsonObject) {
            throw EventEditorContractException("Maintenance response $path.$key must be an object or null.")
        }
    }

    private fun requireStringArray(value: JsonObject, key: String, path: String) {
        validateStringArray(requireArray(value, key, path), "$path.$key")
    }

    private fun validateStringArray(value: JsonElement, path: String) {
        val array = value as? JsonArray
            ?: throw EventEditorContractException("Maintenance response $path must be an array.")
        array.forEachIndexed { index, item ->
            requireStringValue(item, "$path[$index]")
        }
    }

    private fun requireObjectOrNullValue(value: JsonElement, path: String) {
        if (value !is JsonNull && value !is JsonObject) {
            throw EventEditorContractException("Maintenance response $path must be an object or null.")
        }
    }
private val MAINTENANCE_REVISION_KEYS = setOf(
    "editorRevision",
    "staffRevision",
    "scheduleRevision",
    "fieldRevisions",
    "timeSlotRevisions",
    "rentalBookingRevision",
    "rentalBookingRevisions",
    "rentalBookingItemRevisions",
    "availabilityRevision",
)

private val MAINTENANCE_GRAPH_KEYS = setOf("event", "matches")

private val MAINTENANCE_GRAPH_EVENT_REQUIRED_KEYS = setOf(
    "id",
    "name",
    "description",
    "start",
    "end",
    "location",
    "coordinates",
    "price",
    "minAge",
    "maxAge",
    "rating",
    "imageId",
    "hostId",
    "noFixedEndDateTime",
    "scheduleEndConstraint",
    "generatedScheduleEnd",
    "state",
    "maxParticipants",
    "teamSizeLimit",
    "restTimeMinutes",
    "teamSignup",
    "singleDivision",
    "waitListIds",
    "freeAgentIds",
    "teamIds",
    "userIds",
    "fieldIds",
    "timeSlotIds",
    "officialIds",
    "officialSchedulingMode",
    "staffingPriority",
    "officialPositions",
    "eventOfficials",
    "matchRulesOverride",
    "autoCreatePointMatchIncidents",
    "resolvedMatchRules",
    "cancellationRefundHours",
    "registrationCutoffHours",
    "seedColor",
    "eventType",
    "sportIds",
    "leagueScoringConfigId",
    "organizationId",
    "requiredTemplateIds",
    "allowPaymentPlans",
    "installmentCount",
    "installmentDueDates",
    "installmentDueRelativeDays",
    "installmentAmounts",
    "allowTeamSplitDefault",
    "splitLeaguePlayoffDivisions",
    "divisions",
    "divisionDetails",
    "playoffDivisionDetails",
    "fields",
    "teams",
    "timeSlots",
    "officials",
)

private val MAINTENANCE_GRAPH_EVENT_OPTIONAL_KEYS = setOf(
    "doubleElimination",
    "winnerSetCount",
    "loserSetCount",
    "winnerBracketPointsToVictory",
    "loserBracketPointsToVictory",
    "prize",
    "fieldCount",
    "matches",
    "usesSets",
    "matchDurationMinutes",
    "setDurationMinutes",
    "setsPerMatch",
    "doTeamsOfficiate",
    "teamOfficialsMaySwap",
    "teamCheckInMode",
    "teamCheckInOpenMinutesBefore",
    "allowMatchRosterEdits",
    "allowTemporaryMatchPlayers",
    "gamesPerOpponent",
    "includePlayoffs",
    "playoffTeamCount",
    "pointsToVictory",
)

private val MAINTENANCE_GRAPH_EVENT_KEYS =
    MAINTENANCE_GRAPH_EVENT_REQUIRED_KEYS + MAINTENANCE_GRAPH_EVENT_OPTIONAL_KEYS

private val MAINTENANCE_GRAPH_MATCH_KEYS = setOf(
    "id",
    "matchId",
    "eventId",
    "start",
    "end",
    "locked",
    "placementState",
    "phase",
    "sourceDivisionId",
    "phaseDivisionId",
    "division",
    "fieldId",
    "team1Id",
    "team2Id",
    "team1Seed",
    "team2Seed",
    "status",
    "resultStatus",
    "resultType",
    "actualStart",
    "actualEnd",
    "statusReason",
    "winnerEventTeamId",
    "matchRulesSnapshot",
    "resolvedMatchRules",
    "segments",
    "incidents",
    "officialIds",
    "officialAssignments",
    "teamOfficialId",
    "teamOfficialSeed",
    "team1Points",
    "team2Points",
    "losersBracket",
    "winnerNextMatchId",
    "loserNextMatchId",
    "previousLeftId",
    "previousRightId",
    "side",
    "officialCheckedIn",
    "team1",
    "team2",
    "teamOfficial",
    "official",
    "field",
)
private val MAINTENANCE_GRAPH_MATCH_ALLOWED_KEYS =
    MAINTENANCE_GRAPH_MATCH_KEYS

private val MAINTENANCE_PROJECTION_MATCH_KEYS = setOf(
    "id",
    "matchId",
    "eventId",
    "start",
    "end",
    "locked",
    "placementState",
    "phase",
    "sourceDivisionId",
    "phaseDivisionId",
    "division",
    "fieldId",
    "team1Id",
    "team2Id",
    "team1Seed",
    "team2Seed",
    "status",
    "resultStatus",
    "resultType",
    "actualStart",
    "actualEnd",
    "statusReason",
    "winnerEventTeamId",
    "matchRulesSnapshot",
    "resolvedMatchRules",
    "segments",
    "incidents",
    "officialId",
    "officialIds",
    "teamOfficialId",
    "team1Points",
    "team2Points",
    "losersBracket",
    "winnerNextMatchId",
    "loserNextMatchId",
    "previousLeftId",
    "previousRightId",
    "side",
    "officialCheckedIn",
)

private val MAINTENANCE_OUTCOME_KEYS = setOf(
    "status",
    "isComplete",
    "matchCount",
    "placedMatchCount",
    "unplacedMatchCount",
    "matches",
    "unscheduledMatches",
    "affectedCompetitionPhases",
    "diagnostics",
    "warnings",
)

private val MAINTENANCE_WARNING_KEYS = setOf(
    "code",
    "message",
    "matchIds",
    "restrictingFactor",
)

private val DIAGNOSTIC_EVIDENCE_KEYS = setOf(
    "kind",
    "message",
    "matchIds",
    "resourceIds",
    "divisionIds",
    "teamIds",
    "dependencyIds",
    "officialIds",
    "timeSlotIds",
    "intervals",
    "demand",
    "capacity",
    "deficit",
    "candidateCount",
)


    private fun validateSaveResult(result: EventEditorSaveResultDto) {
        if (result.status != "SAVED") {
            throw EventEditorContractException("Event editor returned unsupported result status ${result.status}.")
        }
        requireVersion(result.snapshot.contractVersion)
    }

    private fun validateProposal(proposal: EventEditorCreateProposalDto) {
        if (proposal.status != "PROPOSED") {
            throw EventEditorContractException(
                "Event editor returned unsupported proposal status ${proposal.status}.",
            )
        }
        requireVersion(proposal.snapshot.contractVersion)
        if (proposal.createOperationId.isBlank() || proposal.eventId.isBlank()) {
            throw EventEditorContractException("Event editor returned an incomplete schedule proposal.")
        }
        if (
            proposal.scheduleOutcome.status != EventEditorScheduleOutcomeStatus.BUILT
            && proposal.scheduleOutcome.status != EventEditorScheduleOutcomeStatus.PARTIAL
        ) {
            throw EventEditorContractException("Event editor returned an incomplete schedule proposal.")
        }
    }

    private suspend inline fun <T> request(crossinline block: suspend () -> T): T = try {
        block()
    } catch (error: ApiException) {
        val payload = error.responseBody
            ?.let { body -> runCatching { jsonMVP.decodeFromString<EventEditorErrorDto>(body) }.getOrNull() }
        if (payload?.code == "EDITOR_PROPOSAL_STALE" || payload?.code == "EDITOR_MAINTENANCE_STALE") {
            throw EventEditorProposalStaleException(
                statusCode = error.statusCode,
                url = error.url,
                payload = payload,
                responseBody = error.responseBody,
                cause = error,
            )
        }
        if (payload?.code == "EDITOR_MAINTENANCE_REJECTED") {
            throw EventEditorMaintenanceRejectedException(
                statusCode = error.statusCode,
                url = error.url,
                payload = payload,
                responseBody = error.responseBody,
                cause = error,
            )
        }
        if (payload?.code == "EDITOR_MAINTENANCE_ACCEPTANCE_CONFLICT") {
            throw EventEditorMaintenanceAcceptanceConflictException(
                statusCode = error.statusCode,
                url = error.url,
                payload = payload,
                responseBody = error.responseBody,
                cause = error,
            )
        }
        throw EventEditorApiException(
            statusCode = error.statusCode,
            url = error.url,
            payload = payload,
            responseBody = error.responseBody,
            cause = error,
        )
    }
}
