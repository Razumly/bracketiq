@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilityBusyBlock
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilityField
import com.razumly.mvp.core.data.dataTypes.RentalAvailabilitySnapshot
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.CatalogQueryCacheEntry
import com.razumly.mvp.core.data.dataTypes.TimeSlotCacheEntry
import com.razumly.mvp.core.data.dataTypes.TimeSlotDTO
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.MvpApiSession
import com.razumly.mvp.core.network.dto.FieldsResponseDto
import com.razumly.mvp.core.network.dto.RentalAvailabilityFieldDto
import com.razumly.mvp.core.network.dto.RentalAvailabilityResponseDto
import com.razumly.mvp.core.network.dto.RentalAvailabilitySlotDto
import com.razumly.mvp.core.network.dto.TimeSlotsResponseDto
import com.razumly.mvp.core.util.jsonMVP
import io.ktor.http.encodeURLPathPart
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlin.time.Instant

private const val TIME_SLOT_RESOURCE = "time-slots"
private const val TIME_SLOT_PROJECTION_AUTHENTICATED = "authenticated"
private const val TIME_SLOT_PROJECTION_PUBLIC_RENTAL = "public-rental"
private const val TIME_SLOT_PAGE_LIMIT = 200

@Serializable
private data class CachedTimeSlotQueryMetadata(
    val itemCount: Int,
    val pageLimit: Int,
    val isComplete: Boolean,
)

private fun TimeSlot.toCacheEntry(
    scope: CatalogCacheScope,
    projectionKey: String,
): TimeSlotCacheEntry = TimeSlotCacheEntry(
    viewerKey = scope.viewerKey,
    projectionKey = projectionKey,
    id = id,
    payloadJson = jsonMVP.encodeToString(this),
)

private fun TimeSlotCacheEntry.toTimeSlot(): TimeSlot =
    jsonMVP.decodeFromString(payloadJson)

private fun List<TimeSlot>.toTimeSlotQueryEntry(
    cacheKey: String,
    scope: CatalogCacheScope,
    projectionKey: String,
): CatalogQueryCacheEntry = CatalogQueryCacheEntry(
    cacheKey = cacheKey,
    viewerKey = scope.viewerKey,
    resourceType = TIME_SLOT_RESOURCE,
    projectionKey = projectionKey,
    orderedIdsJson = jsonMVP.encodeToString(map(TimeSlot::id)),
    payloadJson = jsonMVP.encodeToString(this),
    paginationJson = jsonMVP.encodeToString(
        CachedTimeSlotQueryMetadata(
            itemCount = size,
            pageLimit = TIME_SLOT_PAGE_LIMIT,
            isComplete = true,
        ),
    ),
    isComplete = true,
)

private fun CatalogQueryCacheEntry.toTimeSlots(): List<TimeSlot> {
    require(resourceType == TIME_SLOT_RESOURCE && isComplete) {
        "The cached time-slot query is not an exact complete snapshot."
    }
    val slots = jsonMVP.decodeFromString<List<TimeSlot>>(payloadJson)
    val orderedIds = jsonMVP.decodeFromString<List<String>>(orderedIdsJson)
    val metadata = paginationJson?.let { value ->
        jsonMVP.decodeFromString<CachedTimeSlotQueryMetadata>(value)
    } ?: error("The cached time-slot query is missing completeness metadata.")
    require(orderedIds == slots.map(TimeSlot::id)) {
        "The cached time-slot ordering metadata does not match its payload."
    }
    require(metadata.isComplete && metadata.itemCount == slots.size) {
        "The cached time-slot completeness metadata does not match its payload."
    }
    return slots
}

private suspend fun MvpApiSession.fetchAllTimeSlotPages(queryParameters: List<String>): List<TimeSlot> {
    val slots = mutableListOf<TimeSlot>()
    val seenIds = mutableSetOf<String>()
    var offset = 0
    do {
        val response = get<TimeSlotsResponseDto>(
            buildString {
                append("api/time-slots?")
                append(queryParameters.joinToString("&"))
                if (queryParameters.isNotEmpty()) append("&")
                append("limit=$TIME_SLOT_PAGE_LIMIT&offset=$offset")
            },
        )
        response.timeSlots.forEach { slot ->
            require(seenIds.add(slot.id)) {
                "Time-slot pagination returned duplicate id ${slot.id}."
            }
            slots += slot
        }
        val hasMore = response.pagination?.hasMore ?: (response.timeSlots.size >= TIME_SLOT_PAGE_LIMIT)
        if (!hasMore) break
        val nextOffset = response.pagination?.nextOffset ?: (offset + response.timeSlots.size)
        require(nextOffset > offset) { "Time-slot pagination did not advance beyond offset $offset." }
        offset = nextOffset
    } while (true)
    return slots
}

private fun CatalogQueryCacheEntry?.orderedIdsOrEmpty(): List<String> = this?.let { snapshot ->
    jsonMVP.decodeFromString<List<String>>(snapshot.orderedIdsJson)
}.orEmpty()

private suspend fun cachedTimeSlotsOrThrow(
    cacheKey: String,
    scope: CatalogCacheScope,
    dao: com.razumly.mvp.core.data.dataTypes.daos.CatalogCacheDao,
    refreshFailure: Throwable,
    projectionKey: String,
    requestedIds: List<String> = emptyList(),
): List<TimeSlot> {
    dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toTimeSlots()?.let { return it }
    if (requestedIds.isNotEmpty()) {
        val cachedById = dao.getTimeSlots(requestedIds, scope.viewerKey, projectionKey)
            .associateBy(TimeSlotCacheEntry::id)
        if (requestedIds.all(cachedById::containsKey)) {
            return requestedIds.map { id -> cachedById.getValue(id).toTimeSlot() }
        }
    }
    throw refreshFailure
}

private fun timeSlotProjection(scope: CatalogCacheScope, rentalOnly: Boolean): String =
    if (scope.isAnonymous && rentalOnly) {
        TIME_SLOT_PROJECTION_PUBLIC_RENTAL
    } else {
        TIME_SLOT_PROJECTION_AUTHENTICATED
    }

private fun normalizedTimeSlotResultForRequest(slot: TimeSlot, request: TimeSlot): TimeSlot {
    if (slot.normalizedScheduledFieldIds().isNotEmpty()) return slot
    val requestedFieldIds = request.normalizedScheduledFieldIds()
    return slot.copy(
        scheduledFieldId = requestedFieldIds.firstOrNull(),
        scheduledFieldIds = requestedFieldIds,
    )
}

private fun TimeSlot.withPublicFieldAssociation(fieldId: String): TimeSlot {
    val associatedFieldIds = (normalizedScheduledFieldIds() + fieldId.trim())
        .filter(String::isNotBlank)
        .distinct()
    return copy(
        scheduledFieldId = associatedFieldIds.firstOrNull(),
        scheduledFieldIds = associatedFieldIds,
    )
}

interface IFieldRepository : IMVPRepository {
    suspend fun createField(field: Field): Result<Field>
    suspend fun updateField(field: Field): Result<Field>
    fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>>
    suspend fun getFields(ids: List<String>): Result<List<Field>>
    suspend fun listFields(eventId: String? = null): Result<List<Field>>
    suspend fun getTimeSlots(ids: List<String>): Result<List<TimeSlot>>
    suspend fun getTimeSlotsForField(fieldId: String): Result<List<TimeSlot>>
    suspend fun getTimeSlotsForFields(
        fieldIds: List<String>,
        rentalOnly: Boolean = false,
    ): Result<List<TimeSlot>>
    suspend fun getRentalAvailability(
        organizationId: String,
        rangeStart: Instant,
        rangeEnd: Instant,
    ): Result<RentalAvailabilitySnapshot> = Result.failure(
        UnsupportedOperationException("Rental availability snapshots are not supported by this repository."),
    )
    suspend fun createTimeSlot(slot: TimeSlot): Result<TimeSlot>
    suspend fun updateTimeSlot(slot: TimeSlot): Result<TimeSlot>
    suspend fun deleteTimeSlot(timeSlotId: String): Result<Unit>
}

class FieldRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) : IFieldRepository {
    override suspend fun createField(field: Field): Result<Field> = runCatching {
        val created = api.post<Field, Field>(path = "api/fields", body = field)
        databaseService.getFieldDao.upsertField(created)
        created
    }

    override suspend fun updateField(field: Field): Result<Field> = runCatching {
        val payload = FieldPatchRequest(
            field = FieldPatchPayload(
                fieldNumber = field.fieldNumber,
                divisions = field.divisions,
                lat = field.lat,
                long = field.long,
                heading = field.heading,
                inUse = field.inUse,
                name = field.name,
                rentalSlotIds = field.rentalSlotIds,
                location = field.location,
            )
        )
        val updated = api.patch<FieldPatchRequest, Field>(
            path = "api/fields/${field.id}",
            body = payload
        )
        databaseService.getFieldDao.upsertField(updated)
        updated
    }

    override fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>> {
        if (ids.isEmpty()) return flowOf(emptyList())
        return databaseService.getFieldDao.getFieldsWithMatches(ids)
    }

    override suspend fun getFields(ids: List<String>): Result<List<Field>> {
        val fieldIdChunks = collectionIdChunks(ids)
        val fieldIds = fieldIdChunks.flatten()
        if (fieldIds.isEmpty()) return Result.success(emptyList())

        return multiResponse(
            authoritativeIds = fieldIds,
            getRemoteData = {
                val fieldsById = LinkedHashMap<String, Field>()
                for (fieldIdChunk in fieldIdChunks) {
                    val encodedIds = fieldIdChunk.joinToString(",").encodeURLQueryComponent()
                    api.get<FieldsResponseDto>("api/fields?ids=$encodedIds").fields.forEach { field ->
                        fieldsById[field.id] = field
                    }
                }
                fieldsById.values.toList()
            },
            saveData = { fields -> databaseService.getFieldDao.upsertFields(fields) },
            getLocalData = { databaseService.getFieldDao.getFieldsByIds(fieldIds) },
            deleteData = { staleIds -> databaseService.getFieldDao.deleteFieldsById(staleIds) },
        )
    }

    override suspend fun listFields(eventId: String?): Result<List<Field>> = runCatching {
        val params = buildList {
            eventId
                ?.takeIf(String::isNotBlank)
                ?.trim()
                ?.let { add("eventId=${it.encodeURLQueryComponent()}") }
        }
        val path = if (params.isEmpty()) {
            "api/fields"
        } else {
            "api/fields?${params.joinToString("&")}"
        }

        val fields = api.get<FieldsResponseDto>(path).fields
        if (fields.isNotEmpty()) {
            databaseService.getFieldDao.upsertFields(fields)
        }
        fields
    }

    override suspend fun getTimeSlots(ids: List<String>): Result<List<TimeSlot>> = runCatching {
        val slotIdChunks = collectionIdChunks(ids)
        val slotIds = slotIdChunks.flatten()
        if (slotIds.isEmpty()) return@runCatching emptyList()

        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val projectionKey = TIME_SLOT_PROJECTION_AUTHENTICATED
        val cacheKey = catalogCacheKey(
            scope,
            TIME_SLOT_RESOURCE,
            projectionKey,
            "ids",
            *slotIds.toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedIdsOrEmpty()
        val remoteSlots = try {
            val slotsById = LinkedHashMap<String, TimeSlot>()
            for (slotIdChunk in slotIdChunks) {
                val encodedIds = slotIdChunk.joinToString(",").encodeURLQueryComponent()
                scope.api.fetchAllTimeSlotPages(listOf("ids=$encodedIds")).forEach { slot ->
                    slotsById[slot.id] = slot
                }
            }
            // ID lookups retain their caller-requested ordering even though each server page is
            // consumed in order. Missing IDs are an authoritative part of this exact snapshot.
            slotIds.mapNotNull(slotsById::get)
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching cachedTimeSlotsOrThrow(
                cacheKey = cacheKey,
                scope = scope,
                dao = dao,
                refreshFailure = error,
                projectionKey = projectionKey,
                requestedIds = slotIds,
            )
        }
        val snapshot = remoteSlots.toTimeSlotQueryEntry(cacheKey, scope, projectionKey)
        dao.replaceTimeSlotQuery(
            snapshot = snapshot,
            entries = remoteSlots.map { slot -> slot.toCacheEntry(scope, projectionKey) },
            staleTimeSlotIds = previousIds.filterNot(remoteSlots.map(TimeSlot::id).toSet()::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toTimeSlots()
            ?: error("Time-slot query cache was not written.")
    }

    override suspend fun getTimeSlotsForField(fieldId: String): Result<List<TimeSlot>> = runCatching {
        val normalizedFieldId = fieldId.trim()
        if (normalizedFieldId.isEmpty()) return@runCatching emptyList()
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val projectionKey = TIME_SLOT_PROJECTION_AUTHENTICATED
        val cacheKey = catalogCacheKey(scope, TIME_SLOT_RESOURCE, projectionKey, "field", normalizedFieldId)
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedIdsOrEmpty()
        val slots = try {
            scope.api.fetchAllTimeSlotPages(
                listOf("fieldId=${normalizedFieldId.encodeURLQueryComponent()}"),
            )
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching cachedTimeSlotsOrThrow(
                cacheKey,
                scope,
                dao,
                error,
                projectionKey,
            )
        }
        val snapshot = slots.toTimeSlotQueryEntry(cacheKey, scope, projectionKey)
        dao.replaceTimeSlotQuery(
            snapshot = snapshot,
            entries = slots.map { slot -> slot.toCacheEntry(scope, projectionKey) },
            staleTimeSlotIds = previousIds.filterNot(slots.map(TimeSlot::id).toSet()::contains),
        )
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toTimeSlots()
            ?: error("Time-slot field query cache was not written.")
    }

    override suspend fun getTimeSlotsForFields(
        fieldIds: List<String>,
        rentalOnly: Boolean,
    ): Result<List<TimeSlot>> = runCatching {
        val fieldIdChunks = collectionIdChunks(fieldIds)
        val normalizedFieldIds = fieldIdChunks.flatten()
        if (normalizedFieldIds.isEmpty()) return@runCatching emptyList()

        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val projectionKey = timeSlotProjection(scope, rentalOnly)
        val cacheKey = catalogCacheKey(
            scope,
            TIME_SLOT_RESOURCE,
            projectionKey,
            "fields",
            rentalOnly.toString(),
            *normalizedFieldIds.toTypedArray(),
        )
        val previousIds = dao.getCatalogQuery(cacheKey, scope.viewerKey).orderedIdsOrEmpty()
        val slots = try {
            val slotsById = LinkedHashMap<String, TimeSlot>()
            if (scope.isAnonymous && rentalOnly) {
                // The public projection deliberately omits field IDs. Query one requested field at
                // a time so the association is known without inventing or exposing other fields.
                normalizedFieldIds.forEach { fieldId ->
                    scope.api.fetchAllTimeSlotPages(
                        listOf(
                            "fieldId=${fieldId.encodeURLQueryComponent()}",
                            "rentalOnly=true",
                        ),
                    ).forEach { slot ->
                        slotsById[slot.id] = (slotsById[slot.id] ?: slot)
                            .withPublicFieldAssociation(fieldId)
                    }
                }
            } else {
                for (fieldIdChunk in fieldIdChunks) {
                    val encodedFieldIds = fieldIdChunk.joinToString(",").encodeURLQueryComponent()
                    val query = buildList {
                        add("fieldIds=$encodedFieldIds")
                        if (rentalOnly) {
                            add("rentalOnly=true")
                        }
                    }
                    scope.api.fetchAllTimeSlotPages(query).forEach { slot ->
                        slotsById[slot.id] = slot
                    }
                }
            }
            slotsById.values.toList()
        } catch (error: Throwable) {
            if (!error.isCatalogFallbackEligible()) throw error
            return@runCatching cachedTimeSlotsOrThrow(
                cacheKey,
                scope,
                dao,
                error,
                projectionKey,
            )
        }
        val snapshot = slots.toTimeSlotQueryEntry(cacheKey, scope, projectionKey)
        dao.replaceTimeSlotQuery(
            snapshot = snapshot,
            entries = slots.map { slot -> slot.toCacheEntry(scope, projectionKey) },
            staleTimeSlotIds = previousIds.filterNot(slots.map(TimeSlot::id).toSet()::contains),
        )
        // Public rental payloads intentionally omit scheduledFieldIds. The exact request-to-result
        // association is represented by this query snapshot, not inferred from missing fields.
        dao.getCatalogQuery(cacheKey, scope.viewerKey)?.toTimeSlots()
            ?: error("Time-slot fields query cache was not written.")
    }

    override suspend fun getRentalAvailability(
        organizationId: String,
        rangeStart: Instant,
        rangeEnd: Instant,
    ): Result<RentalAvailabilitySnapshot> = runCatching {
        val normalizedOrganizationId = organizationId.trim()
        require(normalizedOrganizationId.isNotEmpty()) { "Organization id is required." }
        require(rangeEnd > rangeStart) { "Rental availability range end must be after its start." }

        val response = api.get<RentalAvailabilityResponseDto>(
            path = buildString {
                append("api/organizations/")
                append(normalizedOrganizationId.encodeURLPathPart())
                append("/rental-availability?start=")
                append(rangeStart.toString().encodeURLQueryComponent())
                append("&end=")
                append(rangeEnd.toString().encodeURLQueryComponent())
            },
        )
        val snapshot = response.toRentalAvailabilitySnapshot(
            organizationId = normalizedOrganizationId,
            requestedStart = rangeStart,
            requestedEnd = rangeEnd,
        )
        // Availability fields are an intentionally partial projection. Keep
        // them inside the snapshot instead of overwriting complete Room rows.
        snapshot
    }

    override suspend fun createTimeSlot(slot: TimeSlot): Result<TimeSlot> = runCatching {
        val normalizedDays = slot.normalizedDaysOfWeek()
        val normalizedFieldIds = slot.normalizedScheduledFieldIds()
        val normalizedDivisionIds = slot.normalizedDivisionIds()
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val createdResponse = scope.api.post<CreateTimeSlotRequestDto, TimeSlot>(
            path = "api/time-slots",
            body = CreateTimeSlotRequestDto(
                id = slot.id,
                dayOfWeek = normalizedDays.firstOrNull() ?: slot.dayOfWeek,
                daysOfWeek = normalizedDays.takeIf { it.isNotEmpty() },
                divisions = normalizedDivisionIds.takeIf { it.isNotEmpty() },
                startTimeMinutes = slot.startTimeMinutes,
                endTimeMinutes = slot.endTimeMinutes,
                startDate = slot.startDate.toString(),
                timeZone = slot.timeZone,
                repeating = slot.repeating,
                endDate = slot.endDate?.toString(),
                scheduledFieldId = normalizedFieldIds.firstOrNull() ?: slot.scheduledFieldId,
                scheduledFieldIds = normalizedFieldIds.takeIf { it.isNotEmpty() },
                price = slot.price,
                requiredTemplateIds = slot.requiredTemplateIds,
                hostRequiredTemplateIds = slot.hostRequiredTemplateIds,
            )
        )
        val created = normalizedTimeSlotResultForRequest(createdResponse, slot)
        val projectionKey = TIME_SLOT_PROJECTION_AUTHENTICATED
        dao.upsertTimeSlotAndInvalidateQueries(created.toCacheEntry(scope, projectionKey))
        dao.getTimeSlots(listOf(created.id), scope.viewerKey, projectionKey).single().toTimeSlot()
    }

    override suspend fun updateTimeSlot(slot: TimeSlot): Result<TimeSlot> = runCatching {
        val payload = slot.toTimeSlotDTO()
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        val updatedResponse = scope.api.patch<UpdateTimeSlotRequestDto, TimeSlot>(
            path = "api/time-slots/${slot.id}",
            body = UpdateTimeSlotRequestDto(
                slot = UpdateTimeSlotPayload(
                    dayOfWeek = payload.dayOfWeek,
                    daysOfWeek = payload.daysOfWeek,
                    divisions = payload.divisions,
                    startTimeMinutes = payload.startTimeMinutes,
                    endTimeMinutes = payload.endTimeMinutes,
                    startDate = payload.startDate,
                    timeZone = payload.timeZone,
                    repeating = payload.repeating,
                    endDate = payload.endDate,
                    scheduledFieldId = payload.scheduledFieldId,
                    scheduledFieldIds = payload.scheduledFieldIds,
                    price = payload.price,
                    requiredTemplateIds = payload.requiredTemplateIds,
                    hostRequiredTemplateIds = payload.hostRequiredTemplateIds,
                )
            )
        )
        val updated = normalizedTimeSlotResultForRequest(updatedResponse, slot)
        val projectionKey = TIME_SLOT_PROJECTION_AUTHENTICATED
        dao.upsertTimeSlotAndInvalidateQueries(updated.toCacheEntry(scope, projectionKey))
        dao.getTimeSlots(listOf(updated.id), scope.viewerKey, projectionKey).single().toTimeSlot()
    }

    override suspend fun deleteTimeSlot(timeSlotId: String): Result<Unit> = runCatching {
        val normalizedId = timeSlotId.trim()
        require(normalizedId.isNotEmpty()) { "Time slot id is required." }
        val dao = databaseService.getCatalogCacheDao
        val scope = api.activateCatalogCache(dao)
        scope.api.deleteNoResponse("api/time-slots/$normalizedId")
        dao.deleteTimeSlotAndInvalidateQueries(normalizedId, scope.viewerKey)
    }

    private fun TimeSlot.toTimeSlotDTO(): TimeSlotDTO = TimeSlotDTO(
        dayOfWeek = normalizedDaysOfWeek().firstOrNull() ?: dayOfWeek,
        daysOfWeek = normalizedDaysOfWeek().takeIf { it.isNotEmpty() },
        divisions = normalizedDivisionIds().takeIf { it.isNotEmpty() },
        startTimeMinutes = startTimeMinutes,
        endTimeMinutes = endTimeMinutes,
        startDate = startDate.toString(),
        timeZone = timeZone,
        repeating = repeating,
        endDate = endDate?.toString(),
        scheduledFieldId = normalizedScheduledFieldIds().firstOrNull() ?: scheduledFieldId,
        scheduledFieldIds = normalizedScheduledFieldIds().takeIf { it.isNotEmpty() },
        price = price,
        requiredTemplateIds = requiredTemplateIds,
        hostRequiredTemplateIds = hostRequiredTemplateIds,
    )
}

private fun RentalAvailabilityResponseDto.toRentalAvailabilitySnapshot(
    organizationId: String,
    requestedStart: Instant,
    requestedEnd: Instant,
): RentalAvailabilitySnapshot {
    val responseStart = range.start.toRequiredInstant("Rental availability response range start")
    val responseEnd = range.end.toRequiredInstant("Rental availability response range end")
    require(responseStart == requestedStart && responseEnd == requestedEnd) {
        "Rental availability response range does not match the requested range."
    }

    val seenFieldIds = mutableSetOf<String>()
    val mappedFields = fields.map { fieldDto ->
        val fieldId = fieldDto.id.requiredId("Rental availability field id")
        require(seenFieldIds.add(fieldId)) { "Rental availability response contains duplicate field $fieldId." }
        fieldDto.toRentalAvailabilityField(
            organizationId = organizationId,
            fieldId = fieldId,
        )
    }
    val knownFieldIds = mappedFields.mapTo(mutableSetOf()) { field -> field.field.id }
    val mappedBusyBlocks = busyBlocks.map { blockDto ->
        val fieldId = blockDto.fieldId.requiredId("Rental availability busy block field id")
        require(fieldId in knownFieldIds) {
            "Rental availability busy block references unknown field $fieldId."
        }
        val start = blockDto.start.toRequiredInstant("Rental availability busy block start")
        val end = blockDto.end.toRequiredInstant("Rental availability busy block end")
        require(end > start) { "Rental availability busy block end must be after its start." }
        require(start >= responseStart && end <= responseEnd) {
            "Rental availability busy block falls outside the response range."
        }
        RentalAvailabilityBusyBlock(
            fieldId = fieldId,
            start = start,
            end = end,
        )
    }.distinct()

    return RentalAvailabilitySnapshot(
        rangeStart = responseStart,
        rangeEnd = responseEnd,
        fields = mappedFields,
        busyBlocks = mappedBusyBlocks,
    )
}

private fun RentalAvailabilityFieldDto.toRentalAvailabilityField(
    organizationId: String,
    fieldId: String,
): RentalAvailabilityField {
    val seenSlotIds = mutableSetOf<String>()
    val slots = rentalSlots.map { slotDto ->
        val slotId = slotDto.id.requiredId("Rental availability slot id")
        require(seenSlotIds.add(slotId)) {
            "Rental availability field $fieldId contains duplicate slot $slotId."
        }
        slotDto.toTimeSlot(fieldId = fieldId, slotId = slotId)
    }
    val normalizedFacilityId = facilityId?.trim()?.takeIf(String::isNotBlank)
    val mappedField = Field(
        fieldNumber = fieldNumber ?: 0,
        name = name.trim().takeIf(String::isNotBlank),
        rentalSlotIds = slots.map(TimeSlot::id),
        organizationId = organizationId,
        facilityId = normalizedFacilityId,
        id = fieldId,
    )
    if (normalizedFacilityId != null) {
        mappedField.facility = Facility(
            id = normalizedFacilityId,
            name = facilityName?.trim()?.takeIf(String::isNotBlank),
        )
    }
    return RentalAvailabilityField(
        field = mappedField,
        rentalSlots = slots,
    )
}

private fun RentalAvailabilitySlotDto.toTimeSlot(
    fieldId: String,
    slotId: String,
): TimeSlot {
    require(daysOfWeek.all { day -> day in 0..6 }) {
        "Rental availability slot $slotId contains an invalid weekday."
    }
    val normalizedDays = daysOfWeek.distinct().sorted()
    val normalizedStartDate = startDate
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?: error("Rental availability slot $slotId is missing its start date.")
    val normalizedEndDate = endDate?.trim()?.takeIf(String::isNotBlank)
    return TimeSlot(
        id = slotId,
        dayOfWeek = normalizedDays.firstOrNull(),
        daysOfWeek = normalizedDays,
        startTimeMinutes = startTimeMinutes,
        endTimeMinutes = endTimeMinutes,
        startDate = normalizedStartDate.toRequiredInstant("Rental availability slot $slotId start date"),
        timeZone = timeZone?.trim()?.takeIf(String::isNotBlank) ?: "UTC",
        repeating = repeating,
        endDate = normalizedEndDate?.toRequiredInstant("Rental availability slot $slotId end date"),
        scheduledFieldId = fieldId,
        scheduledFieldIds = listOf(fieldId),
        price = price,
    )
}

private fun String.requiredId(label: String): String = trim().also { normalized ->
    require(normalized.isNotEmpty()) { "$label is required." }
}

private fun String.toRequiredInstant(label: String): Instant = runCatching {
    Instant.parse(trim())
}.getOrElse { error ->
    throw IllegalArgumentException("$label must be a valid ISO instant.", error)
}

@Serializable
private data class CreateTimeSlotRequestDto(
    val id: String,
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int>? = null,
    val divisions: List<String>? = null,
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val timeZone: String = "UTC",
    val repeating: Boolean = false,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String>? = null,
    val price: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
)

@Serializable
private data class UpdateTimeSlotRequestDto(
    val slot: UpdateTimeSlotPayload,
)

@Serializable
private data class UpdateTimeSlotPayload(
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int>? = null,
    val divisions: List<String>? = null,
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val timeZone: String = "UTC",
    val repeating: Boolean = false,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val scheduledFieldIds: List<String>? = null,
    val price: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
    val hostRequiredTemplateIds: List<String> = emptyList(),
)

@Serializable
private data class FieldPatchRequest(
    val field: FieldPatchPayload,
)

@Serializable
private data class FieldPatchPayload(
    val fieldNumber: Int,
    val divisions: List<String> = emptyList(),
    val lat: Double? = null,
    val long: Double? = null,
    val heading: Double? = null,
    val inUse: Boolean? = null,
    val name: String? = null,
    val rentalSlotIds: List<String> = emptyList(),
    val location: String? = null,
)
