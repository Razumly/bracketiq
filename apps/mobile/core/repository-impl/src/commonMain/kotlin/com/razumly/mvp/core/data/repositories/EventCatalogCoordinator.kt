package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.normalizedEventTags
import com.razumly.mvp.core.data.dataTypes.usableLatitudeLongitude
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.EventSearchFiltersDto
import com.razumly.mvp.core.network.dto.EventSearchRequestDto
import com.razumly.mvp.core.network.dto.EventSearchUserLocationDto
import com.razumly.mvp.core.network.dto.EventTagsResponseDto
import com.razumly.mvp.core.network.dto.EventTemplatesResponseDto
import com.razumly.mvp.core.network.dto.EventsResponseDto
import com.razumly.mvp.core.network.dto.hasMoreEventRows
import com.razumly.mvp.core.network.dto.pageContinuationOrThrow
import com.razumly.mvp.core.network.dto.toEventsOrThrow
import com.razumly.mvp.core.util.calcDistance
import dev.icerock.moko.geo.LatLng
import io.ktor.http.encodeURLQueryComponent
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlin.time.Instant

private const val KILOMETERS_PER_MILE = 1.60934
private const val EVENT_PAGE_SIZE = 50

private fun milesToKilometers(value: Double): Double = value * KILOMETERS_PER_MILE

/** Owns event discovery, host/organization catalogs, tags, and template reads. */
internal class EventCatalogCoordinator(
    private val databaseService: DatabaseService,
    private val api: MvpApiClient,
    private val userRepository: IUserRepository,
    private val sessionCacheCoordinator: EventSessionCacheCoordinator,
) {
    private suspend fun cacheCatalogEvents(events: List<Event>): List<Event> {
        return databaseService.cachePartialEventsPreservingDivisionState(events)
    }

    suspend fun getRegistrationQuestions(
        scopeType: String,
        scopeId: String,
    ): Result<List<TeamJoinQuestion>> = runCatching {
        val normalizedScopeType = scopeType.trim().uppercase().takeIf(String::isNotBlank)
            ?: error("Question scope type is required.")
        val normalizedScopeId = scopeId.trim().takeIf(String::isNotBlank)
            ?: error("Question scope id is required.")
        val response = api.get<RegistrationQuestionsResponseDto>(
            path = "api/registration-questions?scopeType=${normalizedScopeType.encodeURLQueryComponent()}&scopeId=${normalizedScopeId.encodeURLQueryComponent()}",
        )
        if (!response.error.isNullOrBlank()) error(response.error)
        response.questions
            .mapNotNull(RegistrationQuestionDto::toTeamJoinQuestionOrNull)
            .sortedWith(compareBy<TeamJoinQuestion> { it.sortOrder }.thenBy { it.prompt })
    }

    suspend fun getEventsByIds(eventIds: List<String>): Result<List<Event>> = runCatching {
        val ids = eventIds.map(String::trim).filter(String::isNotBlank).distinct()
        if (ids.isEmpty()) return@runCatching emptyList()

        val events = fetchRemoteEventsByIds(ids)
        if (events.isNotEmpty()) {
            cacheCatalogEvents(events)
        }
        val staleIds = ids.toSet() - events.map(Event::id).toSet()
        if (staleIds.isNotEmpty()) {
            databaseService.getEventDao.deleteEventsWithCrossRefs(staleIds.toList())
        }

        val cachedById = databaseService.getEventDao.getEventsByIds(ids).associateBy(Event::id)
        ids.mapNotNull(cachedById::get)
    }

    suspend fun getEventsByOrganization(
        organizationId: String,
        limit: Int,
    ): Result<List<Event>> {
        val normalizedOrganizationId = organizationId.trim()
        if (normalizedOrganizationId.isEmpty()) return Result.success(emptyList())

        return runCatching {
            val events = fetchRemoteEventsByOrganization(normalizedOrganizationId, limit)
            if (events.isNotEmpty()) {
                cacheCatalogEvents(events)
            }
            events
        }
    }

    suspend fun getOrganizationEventsPage(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): Result<OrganizationEventPage> {
        val normalizedOrganizationId = organizationId.trim()
        if (normalizedOrganizationId.isEmpty()) {
            return Result.success(
                OrganizationEventPage(
                    events = emptyList(),
                    nextOffset = 0,
                    hasMore = false,
                ),
            )
        }

        return runCatching {
            val page = fetchRemoteEventsPageByOrganization(
                organizationId = normalizedOrganizationId,
                limit = limit,
                offset = offset,
            )
            if (page.events.isNotEmpty()) {
                cacheCatalogEvents(page.events)
            }
            page
        }
    }

    fun getEventsInBoundsFlow(bounds: Bounds): Flow<Result<List<Event>>> = combine(
        databaseService.getEventDao.getAllCachedEvents(),
        userRepository.currentUser,
    ) { cached, currentUserResult ->
        val visibleEvents = sessionCacheCoordinator.filterHiddenEvents(
            events = cached,
            currentUser = currentUserResult.getOrNull(),
        )
        val inBounds = visibleEvents.filter { event ->
            calcDistance(bounds.center, LatLng(event.lat, event.long)) <= bounds.radiusMiles
        }
        Result.success(inBounds.sortedBy { calcDistance(bounds.center, LatLng(it.lat, it.long)) })
    }

    suspend fun getEventsInBounds(bounds: Bounds): Result<Pair<List<Event>, Boolean>> =
        getEventsInBounds(
            bounds = bounds,
            dateFrom = null,
            dateTo = null,
            sports = emptyList(),
            tags = emptyList(),
            limit = EVENT_PAGE_SIZE,
            offset = 0,
            includeDistanceFilter = true,
        )

    suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
        sports: List<String>,
        tags: List<String>,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
    ): Result<Pair<List<Event>, Boolean>> = getEventsInBounds(
        bounds = bounds,
        dateFrom = dateFrom,
        dateTo = dateTo,
        sports = sports,
        tags = tags,
        price = null,
        divisionGenders = emptyList(),
        skillDivisionTypeIds = emptyList(),
        ageDivisionTypeIds = emptyList(),
        limit = limit,
        offset = offset,
        includeDistanceFilter = includeDistanceFilter,
    )

    suspend fun getEventsInBounds(
        bounds: Bounds,
        dateFrom: Instant?,
        dateTo: Instant?,
        sports: List<String>,
        tags: List<String>,
        price: Pair<Double, Double>?,
        divisionGenders: List<String>,
        skillDivisionTypeIds: List<String>,
        ageDivisionTypeIds: List<String>,
        limit: Int,
        offset: Int,
        includeDistanceFilter: Boolean,
    ): Result<Pair<List<Event>, Boolean>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 500)
        val normalizedOffset = offset.coerceAtLeast(0)
        val filters = EventSearchFiltersDto(
            maxDistance = bounds.radiusMiles.takeIf { includeDistanceFilter }?.let(::milesToKilometers),
            userLocation = if (includeDistanceFilter) {
                EventSearchUserLocationDto(
                    lat = bounds.center.latitude,
                    long = bounds.center.longitude,
                )
            } else {
                null
            },
            dateFrom = dateFrom?.toString(),
            dateTo = dateTo?.toString(),
            priceMin = price?.first?.times(100.0)?.toInt(),
            priceMax = price?.second?.times(100.0)?.toInt(),
            sports = sports
                .mapNotNull { sport -> sport.trim().takeIf(String::isNotBlank) }
                .takeIf { it.isNotEmpty() },
            tags = tags
                .mapNotNull { tag -> tag.trim().takeIf(String::isNotBlank) }
                .takeIf { it.isNotEmpty() },
            divisionGenders = divisionGenders
                .mapNotNull { gender -> gender.trim().uppercase().takeIf(String::isNotBlank) }
                .takeIf { it.isNotEmpty() },
            skillDivisionTypeIds = skillDivisionTypeIds
                .mapNotNull { id -> id.trim().takeIf(String::isNotBlank) }
                .takeIf { it.isNotEmpty() },
            ageDivisionTypeIds = ageDivisionTypeIds
                .mapNotNull { id -> id.trim().takeIf(String::isNotBlank) }
                .takeIf { it.isNotEmpty() },
        )
        val response = api.post<EventSearchRequestDto, EventsResponseDto>(
            path = "api/events/search",
            body = EventSearchRequestDto(
                filters = filters,
                limit = normalizedLimit,
                offset = normalizedOffset,
            ),
        )

        val events = sessionCacheCoordinator.filterHiddenEvents(
            response.events.toEventsOrThrow("Event bounds search response"),
            userRepository.currentUser.value.getOrNull(),
        )
        cacheCatalogEvents(events)
        val orderedEvents = if (includeDistanceFilter) {
            events.sortedBy { event ->
                event.usableLatitudeLongitude()
                    ?.let { (latitude, longitude) -> calcDistance(bounds.center, LatLng(latitude, longitude)) }
                    ?: Double.MAX_VALUE
            }
        } else {
            events
        }

        Pair(orderedEvents, response.hasMoreEventRows(normalizedLimit))
    }

    suspend fun searchEvents(
        searchQuery: String,
        userLocation: LatLng?,
        limit: Int,
        offset: Int,
    ): Result<Pair<List<Event>, Boolean>> = runCatching {
        val normalizedLimit = limit.coerceIn(1, 500)
        val normalizedOffset = offset.coerceAtLeast(0)
        val response = api.post<EventSearchRequestDto, EventsResponseDto>(
            path = "api/events/search",
            body = EventSearchRequestDto(
                filters = EventSearchFiltersDto(query = searchQuery),
                limit = normalizedLimit,
                offset = normalizedOffset,
            ),
        )

        val events = sessionCacheCoordinator.filterHiddenEvents(
            response.events.toEventsOrThrow("Event search response"),
            userRepository.currentUser.value.getOrNull(),
        )
        cacheCatalogEvents(events)

        val orderedEvents = userLocation?.let { location ->
            events.sortedBy { event ->
                event.usableLatitudeLongitude()
                    ?.let { (latitude, longitude) -> calcDistance(location, LatLng(latitude, longitude)) }
                    ?: Double.MAX_VALUE
            }
        } ?: events

        Pair(orderedEvents, response.hasMoreEventRows(normalizedLimit))
    }

    suspend fun getEventTags(query: String?, filterOnly: Boolean): Result<List<EventTag>> = runCatching {
        val normalizedQuery = query?.trim().orEmpty()
        val path = buildString {
            append("api/event-tags")
            val params = buildList {
                if (normalizedQuery.isNotEmpty()) {
                    add("query=${normalizedQuery.encodeURLQueryComponent()}")
                }
                if (filterOnly) add("filterOnly=true")
            }
            if (params.isNotEmpty()) {
                append("?")
                append(params.joinToString("&"))
            }
        }
        api.get<EventTagsResponseDto>(path).tags
            .normalizedEventTags()
            .sortedWith(
                compareByDescending<EventTag>(EventTag::eventCount)
                    .thenBy { tag -> tag.name.lowercase() },
            )
    }

    fun getEventsByHostFlow(hostId: String): Flow<Result<List<Event>>> = callbackFlow {
        val localJob = launch {
            databaseService.getEventDao.getAllCachedEvents().collect { cached ->
                trySend(Result.success(cached.filter { it.hostId == hostId }))
            }
        }

        val remoteJob = launch {
            runCatching {
                val remote = fetchRemoteEventsByHost(hostId)
                val localHostEvents = databaseService.getEventDao.getAllCachedEvents().first()
                    .filter { it.hostId == hostId }
                val staleIds = localHostEvents.map(Event::id).toSet() - remote.map(Event::id).toSet()
                if (staleIds.isNotEmpty()) {
                    databaseService.getEventDao.deleteEventsWithCrossRefs(staleIds.toList())
                }
                cacheCatalogEvents(remote)
            }.onFailure { error -> trySend(Result.failure(error)) }
        }

        awaitClose {
            localJob.cancel()
            remoteJob.cancel()
        }
    }

    suspend fun getHostEventsPage(
        hostId: String,
        limit: Int,
        offset: Int,
    ): Result<HostEventPage> {
        val normalizedHostId = hostId.trim()
        if (normalizedHostId.isEmpty()) {
            return Result.success(
                HostEventPage(
                    events = emptyList(),
                    nextOffset = 0,
                    hasMore = false,
                ),
            )
        }

        return runCatching {
            val page = fetchRemoteEventsPageByHost(
                hostId = normalizedHostId,
                limit = limit,
                offset = offset,
            )
            if (page.events.isNotEmpty()) {
                cacheCatalogEvents(page.events)
            }
            page
        }
    }

    fun getEventTemplatesByHostFlow(hostId: String): Flow<Result<List<EventTemplateSummary>>> = flow {
        emit(runCatching { fetchRemoteEventTemplatesByHost(hostId) })
    }

    private suspend fun fetchRemoteEventsByHost(hostId: String): List<Event> {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val response = api.get<EventsResponseDto>("api/events?hostId=$encodedHostId&limit=200")
        return response.events.toEventsOrThrow("Hosted events response")
    }

    private suspend fun fetchRemoteEventsPageByHost(
        hostId: String,
        limit: Int,
        offset: Int,
    ): HostEventPage {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)
        val response = api.get<EventsResponseDto>(
            "api/events?hostId=$encodedHostId&limit=$safeLimit&offset=$safeOffset",
        )
        val events = response.events.toEventsOrThrow("Hosted events page")
        val continuation = response.pageContinuationOrThrow("Hosted events page", safeOffset)
        return HostEventPage(
            events = events,
            nextOffset = continuation.nextOffset,
            hasMore = continuation.hasMore,
        )
    }

    private suspend fun fetchRemoteEventTemplatesByHost(hostId: String): List<EventTemplateSummary> {
        val encodedHostId = hostId.encodeURLQueryComponent()
        val response = api.get<EventTemplatesResponseDto>(
            "api/event-templates?hostId=$encodedHostId&limit=200",
        )
        return response.templates.mapNotNull { it.toEventTemplateSummaryOrNull() }
    }

    private suspend fun fetchRemoteEventsByOrganization(organizationId: String, limit: Int): List<Event> {
        val encodedOrganizationId = organizationId.encodeURLQueryComponent()
        val safeLimit = limit.coerceIn(1, 500)
        val response = api.get<EventsResponseDto>(
            "api/events?organizationId=$encodedOrganizationId&limit=$safeLimit",
        )
        return response.events.toEventsOrThrow("Organization events response")
    }

    private suspend fun fetchRemoteEventsPageByOrganization(
        organizationId: String,
        limit: Int,
        offset: Int,
    ): OrganizationEventPage {
        val encodedOrganizationId = organizationId.encodeURLQueryComponent()
        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)
        val response = api.get<EventsResponseDto>(
            "api/events?organizationId=$encodedOrganizationId&limit=$safeLimit&offset=$safeOffset",
        )
        val events = response.events.toEventsOrThrow("Organization events page")
        val continuation = response.pageContinuationOrThrow("Organization events page", safeOffset)
        return OrganizationEventPage(
            events = events,
            nextOffset = continuation.nextOffset,
            hasMore = continuation.hasMore,
        )
    }

    private suspend fun fetchRemoteEventsByIds(eventIds: List<String>): List<Event> {
        val idChunks = collectionIdChunks(eventIds)
        val ids = idChunks.flatten()
        if (ids.isEmpty()) return emptyList()

        val eventsById = LinkedHashMap<String, Event>()
        for (idChunk in idChunks) {
            val encodedIds = idChunk.joinToString(",").encodeURLQueryComponent()
            val response = api.get<EventsResponseDto>("api/events?ids=$encodedIds&limit=${idChunk.size}")
            response.events.toEventsOrThrow("Event id batch response").forEach { event ->
                eventsById[event.id] = event
            }
        }
        return ids.mapNotNull(eventsById::get)
    }
}
