package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EventApiDto
import com.razumly.mvp.core.network.dto.EventDetailBootstrapResponseDto
import com.razumly.mvp.core.network.dto.EventParticipantsSnapshotResponseDto
import com.razumly.mvp.core.network.dto.EventTeamComplianceResponseDto
import com.razumly.mvp.core.network.dto.EventUserComplianceResponseDto
import com.razumly.mvp.core.network.dto.toEventOrThrow
import io.ktor.http.encodeURLQueryComponent

/** Owns event-detail request mechanics and canonical response decoding. */
internal class EventDetailRemoteGateway(
    private val api: MvpApiClient,
) {
    suspend fun fetchEvent(eventId: String): Event {
        val dto = fetchEventDto(eventId)
        return dto.toEventOrThrow("Event $eventId response")
    }

    suspend fun fetchEventDto(eventId: String): EventApiDto =
        api.get("api/events/$eventId")

    suspend fun fetchLeagueScoringConfig(scoringConfigId: String): LeagueScoringConfig =
        api.get("api/league-scoring-configs/$scoringConfigId")

    suspend fun fetchParticipantsSnapshot(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean = false,
    ): EventParticipantsSnapshotResponseDto {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        return api.get(
            occurrencePath(
                basePath = "api/events/$normalizedEventId/participants",
                occurrence = occurrence,
                extraQueryParams = if (manage) {
                    mapOf("manage" to "true")
                } else {
                    emptyMap()
                },
            ),
        )
    }

    suspend fun fetchDetailBootstrap(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
        manage: Boolean,
    ): EventDetailBootstrapResponseDto {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        return api.get(
            occurrencePath(
                basePath = "api/events/$normalizedEventId/detail",
                occurrence = occurrence,
                extraQueryParams = if (manage) {
                    mapOf("manage" to "true")
                } else {
                    emptyMap()
                },
            ),
        )
    }

    suspend fun fetchTeamCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): EventTeamComplianceResponseDto {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        return api.get(
            occurrencePath(
                basePath = "api/events/$normalizedEventId/teams/compliance",
                occurrence = occurrence,
            ),
        )
    }

    suspend fun fetchUserCompliance(
        eventId: String,
        occurrence: EventOccurrenceSelection?,
    ): EventUserComplianceResponseDto {
        val normalizedEventId = eventId.trim().takeIf(String::isNotBlank)
            ?: error("Event id is required.")
        return api.get(
            occurrencePath(
                basePath = "api/events/$normalizedEventId/users/compliance",
                occurrence = occurrence,
            ),
        )
    }

    fun occurrencePath(
        basePath: String,
        occurrence: EventOccurrenceSelection?,
        extraQueryParams: Map<String, String> = emptyMap(),
    ): String {
        val normalizedSlotId = occurrence?.slotId?.trim()?.takeIf(String::isNotBlank)
        val normalizedOccurrenceDate = occurrence?.occurrenceDate?.trim()?.takeIf(String::isNotBlank)
        val queryParams = linkedMapOf<String, String>()
        if (normalizedSlotId != null && normalizedOccurrenceDate != null) {
            queryParams["slotId"] = normalizedSlotId
            queryParams["occurrenceDate"] = normalizedOccurrenceDate
        }
        extraQueryParams.forEach { (key, value) ->
            val normalizedKey = key.trim()
            val normalizedValue = value.trim()
            if (normalizedKey.isNotBlank() && normalizedValue.isNotBlank()) {
                queryParams[normalizedKey] = normalizedValue
            }
        }
        if (queryParams.isEmpty()) {
            return basePath
        }
        return buildString {
            append(basePath)
            append("?")
            append(
                queryParams.entries.joinToString("&") { (key, value) ->
                    "${key.encodeURLQueryComponent()}=${value.encodeURLQueryComponent()}"
                },
            )
        }
    }
}
