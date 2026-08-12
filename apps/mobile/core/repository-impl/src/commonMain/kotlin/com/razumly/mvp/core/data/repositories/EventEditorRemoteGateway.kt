package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventEditorBootstrapQueryDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorErrorDto
import com.razumly.mvp.core.network.dto.EventEditorSaveCommandDto
import com.razumly.mvp.core.network.dto.EventEditorSaveResultDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleRequestDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleResponseDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.encodeEventEditorCreateCommand
import com.razumly.mvp.core.network.dto.encodeEventEditorSaveCommand
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonObject

class EventEditorApiException(
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

class EventEditorContractException(
    message: String,
) : IllegalStateException(message)

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

    suspend fun create(command: EventEditorCreateCommandDto): EventEditorSaveResultDto = request {
        api.post<JsonObject, EventEditorSaveResultDto>(
            path = "api/events/editor",
            body = encodeEventEditorCreateCommand(command),
        )
    }.also(::validateSaveResult)

    suspend fun save(eventId: String, command: EventEditorSaveCommandDto): EventEditorSaveResultDto {
        val normalizedEventId = requireEventId(eventId)
        return request {
            api.put<JsonObject, EventEditorSaveResultDto>(
                path = "api/events/$normalizedEventId/editor",
                body = encodeEventEditorSaveCommand(command),
            )
        }.also(::validateSaveResult)
    }

    suspend fun schedule(
        eventId: String,
        request: EventEditorScheduleRequestDto,
    ): EventEditorScheduleResponseDto {
        val normalizedEventId = requireEventId(eventId)
        return request {
            api.post<EventEditorScheduleRequestDto, EventEditorScheduleResponseDto>(
                path = "api/events/$normalizedEventId/schedule",
                body = request,
            )
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
        if (version != EVENT_EDITOR_CONTRACT_VERSION) {
            throw EventEditorContractException(
                "Update BracketIQ to edit this event (contract version $version is not supported).",
            )
        }
    }

    private fun validateSaveResult(result: EventEditorSaveResultDto) {
        if (result.status != "SAVED") {
            throw EventEditorContractException("Event editor returned unsupported result status ${result.status}.")
        }
        requireVersion(result.snapshot.contractVersion)
    }

    private suspend inline fun <T> request(crossinline block: suspend () -> T): T = try {
        block()
    } catch (error: ApiException) {
        throw EventEditorApiException(
            statusCode = error.statusCode,
            url = error.url,
            payload = error.responseBody
                ?.let { body -> runCatching { jsonMVP.decodeFromString<EventEditorErrorDto>(body) }.getOrNull() },
            responseBody = error.responseBody,
            cause = error,
        )
    }
}
