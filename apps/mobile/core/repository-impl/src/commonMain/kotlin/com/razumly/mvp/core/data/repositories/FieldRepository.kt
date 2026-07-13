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
import com.razumly.mvp.core.data.dataTypes.TimeSlotDTO
import com.razumly.mvp.core.data.dataTypes.normalizedDivisionIds
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.FieldsResponseDto
import com.razumly.mvp.core.network.dto.RentalAvailabilityFieldDto
import com.razumly.mvp.core.network.dto.RentalAvailabilityResponseDto
import com.razumly.mvp.core.network.dto.RentalAvailabilitySlotDto
import com.razumly.mvp.core.network.dto.TimeSlotsResponseDto
import io.ktor.http.encodeURLPathPart
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.Serializable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlin.time.Instant

interface IFieldRepository : IMVPRepository {
    suspend fun createFields(count: Int, organizationId: String? = null): Result<List<Field>>
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
    override suspend fun createFields(count: Int, organizationId: String?): Result<List<Field>> =
        runCatching {
            val fields = List(count) { Field(fieldNumber = it + 1, organizationId = organizationId) }
            val created = fields.map { field ->
                api.post<Field, Field>(path = "api/fields", body = field)
            }
            databaseService.getFieldDao.upsertFields(created)
            created
        }

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

        val slotsById = LinkedHashMap<String, TimeSlot>()
        for (slotIdChunk in slotIdChunks) {
            val encodedIds = slotIdChunk.joinToString(",").encodeURLQueryComponent()
            api.get<TimeSlotsResponseDto>("api/time-slots?ids=$encodedIds").timeSlots.forEach { slot ->
                slotsById[slot.id] = slot
            }
        }
        slotIds.mapNotNull(slotsById::get)
    }

    override suspend fun getTimeSlotsForField(fieldId: String): Result<List<TimeSlot>> = runCatching {
        val normalizedFieldId = fieldId.trim()
        if (normalizedFieldId.isEmpty()) return@runCatching emptyList()
        val encodedFieldId = normalizedFieldId.encodeURLQueryComponent()
        api.get<TimeSlotsResponseDto>("api/time-slots?fieldId=$encodedFieldId").timeSlots
    }

    override suspend fun getTimeSlotsForFields(
        fieldIds: List<String>,
        rentalOnly: Boolean,
    ): Result<List<TimeSlot>> = runCatching {
        val fieldIdChunks = collectionIdChunks(fieldIds)
        val normalizedFieldIds = fieldIdChunks.flatten()
        if (normalizedFieldIds.isEmpty()) return@runCatching emptyList()

        val slotsById = LinkedHashMap<String, TimeSlot>()
        for (fieldIdChunk in fieldIdChunks) {
            val encodedFieldIds = fieldIdChunk.joinToString(",").encodeURLQueryComponent()
            val query = buildList {
                add("fieldIds=$encodedFieldIds")
                if (rentalOnly) {
                    add("rentalOnly=true")
                }
            }.joinToString("&")
            api.get<TimeSlotsResponseDto>("api/time-slots?$query").timeSlots.forEach { slot ->
                slotsById[slot.id] = slot
            }
        }
        slotsById.values.toList()
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
        api.post<CreateTimeSlotRequestDto, TimeSlot>(
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
    }

    override suspend fun updateTimeSlot(slot: TimeSlot): Result<TimeSlot> = runCatching {
        val payload = slot.toTimeSlotDTO()
        api.patch<UpdateTimeSlotRequestDto, TimeSlot>(
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
    }

    override suspend fun deleteTimeSlot(timeSlotId: String): Result<Unit> = runCatching {
        api.deleteNoResponse("api/time-slots/${timeSlotId.trim()}")
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
