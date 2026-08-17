package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.daos.EventRegistrationDao
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.CurrentUserEventRegistrationsResponseDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlin.time.Clock
import kotlin.time.Instant

/** Owns viewer-scoped registration synchronization between the profile API and Room. */
internal class EventRegistrationCacheCoordinator(
    private val registrationDao: () -> EventRegistrationDao,
    private val api: MvpApiClient,
    private val currentUserDataSource: CurrentUserDataSource?,
    private val now: () -> Instant = { Clock.System.now() },
) {
    suspend fun syncAll() {
        val dataSource = currentUserDataSource ?: return
        val currentUserId = dataSource.getUserIdNow().trim()
        if (currentUserId.isBlank()) {
            dataSource.clearRegistrationSyncState()
            registrationDao().clearAll()
            return
        }

        val storedUserId = dataSource.getRegistrationSyncUserId()
        val updatedAfter = if (storedUserId == currentUserId) {
            dataSource.getRegistrationSyncStartedAt()
        } else {
            registrationDao().clearAll()
            null
        }
        dataSource.saveRegistrationSyncState(
            userId = currentUserId,
            startedAt = now(),
        )

        val registrations = fetchRegistrations(updatedAfter = updatedAfter)
        if (registrations.isNotEmpty()) {
            registrationDao().upsertRegistrations(registrations)
        }
    }

    suspend fun syncForEvent(eventId: String) {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) return

        val dataSource = currentUserDataSource ?: return
        val currentUserId = dataSource.getUserIdNow().trim()
        if (currentUserId.isBlank()) {
            registrationDao().deleteRegistrationsForEvent(normalizedEventId)
            return
        }

        val registrations = fetchRegistrations(
            updatedAfter = null,
            eventId = normalizedEventId,
        )
        registrationDao().deleteRegistrationsForEvent(normalizedEventId)
        if (registrations.isNotEmpty()) {
            registrationDao().upsertRegistrations(registrations)
        }
    }

    fun observeForEvent(eventId: String): Flow<List<EventRegistrationCacheEntry>> {
        val normalizedEventId = eventId.trim()
        if (normalizedEventId.isBlank()) return flowOf(emptyList())
        return registrationDao().observeRegistrationsForEvent(normalizedEventId)
    }

    suspend fun clear() {
        currentUserDataSource?.clearRegistrationSyncState()
        registrationDao().clearAll()
    }

    private suspend fun fetchRegistrations(
        updatedAfter: Instant?,
        eventId: String? = null,
    ): List<EventRegistrationCacheEntry> {
        val queryParams = mutableListOf<String>()
        updatedAfter?.let { timestamp ->
            queryParams += "updatedAfter=${timestamp.toString().encodeURLQueryComponent()}"
        }
        eventId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { normalizedEventId ->
                queryParams += "eventId=${normalizedEventId.encodeURLQueryComponent()}"
            }
        val path = buildString {
            append("api/profile/registrations")
            if (queryParams.isNotEmpty()) {
                append("?")
                append(queryParams.joinToString("&"))
            }
        }
        val response = api.get<CurrentUserEventRegistrationsResponseDto>(path)
        return response.registrations.mapNotNull { dto ->
            val id = dto.id?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val registrationEventId = dto.eventId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val registrantId = dto.registrantId?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            val registrantType = dto.registrantType?.trim()?.takeIf(String::isNotBlank) ?: return@mapNotNull null
            EventRegistrationCacheEntry(
                id = id,
                eventId = registrationEventId,
                registrantId = registrantId,
                parentId = dto.parentId?.trim()?.takeIf(String::isNotBlank),
                registrantType = registrantType,
                rosterRole = dto.rosterRole?.trim()?.takeIf(String::isNotBlank),
                status = dto.status?.trim()?.takeIf(String::isNotBlank),
                eventTeamId = dto.eventTeamId?.trim()?.takeIf(String::isNotBlank),
                sourceTeamRegistrationId = dto.sourceTeamRegistrationId?.trim()?.takeIf(String::isNotBlank),
                divisionId = dto.divisionId?.trim()?.takeIf(String::isNotBlank),
                divisionTypeId = dto.divisionTypeId?.trim()?.takeIf(String::isNotBlank),
                divisionTypeKey = dto.divisionTypeKey?.trim()?.takeIf(String::isNotBlank),
                jerseyNumber = dto.jerseyNumber?.trim()?.takeIf(String::isNotBlank),
                position = dto.position?.trim()?.takeIf(String::isNotBlank),
                isCaptain = dto.isCaptain,
                slotId = dto.slotId?.trim()?.takeIf(String::isNotBlank),
                occurrenceDate = dto.occurrenceDate?.trim()?.takeIf(String::isNotBlank),
                createdAt = dto.createdAt?.trim()?.takeIf(String::isNotBlank),
                updatedAt = dto.updatedAt?.trim()?.takeIf(String::isNotBlank),
            )
        }
    }
}
