package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TimeSlotDTO
import com.razumly.mvp.core.data.dataTypes.normalizedDaysOfWeek
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.FieldsResponseDto
import com.razumly.mvp.core.network.dto.TimeSlotsResponseDto
import io.ktor.http.encodeURLQueryComponent
import kotlinx.serialization.Serializable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

interface IFieldRepository : IMVPRepository {
    suspend fun createFields(count: Int, organizationId: String? = null): Result<List<Field>>
    suspend fun createField(field: Field): Result<Field>
    suspend fun updateField(field: Field): Result<Field>
    fun getFieldsWithMatchesFlow(ids: List<String>): Flow<List<FieldWithMatches>>
    suspend fun getFields(ids: List<String>): Result<List<Field>>
    suspend fun listFields(eventId: String? = null): Result<List<Field>>
    suspend fun getTimeSlots(ids: List<String>): Result<List<TimeSlot>>
    suspend fun getTimeSlotsForField(fieldId: String): Result<List<TimeSlot>>
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
                type = field.type,
                rentalSlotIds = field.rentalSlotIds,
                location = field.location,
                organizationId = field.organizationId,
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

    override suspend fun getFields(ids: List<String>): Result<List<Field>> =
        multiResponse(
            getRemoteData = {
                val fieldIds = ids.distinct().filter(String::isNotBlank)
                if (fieldIds.isEmpty()) return@multiResponse emptyList()
                val encodedIds = fieldIds.joinToString(",") { it.trim() }.encodeURLQueryComponent()
                api.get<FieldsResponseDto>("api/fields?ids=$encodedIds").fields
            },
            saveData = { fields -> databaseService.getFieldDao.upsertFields(fields) },
            getLocalData = { databaseService.getFieldDao.getFieldsByIds(ids) },
            deleteData = { staleIds -> databaseService.getFieldDao.deleteFieldsById(staleIds) },
        )

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
            fields
        } else {
            databaseService.getFieldDao.getAllFields()
        }
    }

    override suspend fun getTimeSlots(ids: List<String>): Result<List<TimeSlot>> = runCatching {
        val slotIds = ids.distinct().filter(String::isNotBlank)
        if (slotIds.isEmpty()) return@runCatching emptyList()

        val encodedIds = slotIds.joinToString(",") { it.trim() }.encodeURLQueryComponent()
        api.get<TimeSlotsResponseDto>("api/time-slots?ids=$encodedIds").timeSlots
    }

    override suspend fun getTimeSlotsForField(fieldId: String): Result<List<TimeSlot>> = runCatching {
        val normalizedFieldId = fieldId.trim()
        if (normalizedFieldId.isEmpty()) return@runCatching emptyList()
        val encodedFieldId = normalizedFieldId.encodeURLQueryComponent()
        api.get<TimeSlotsResponseDto>("api/time-slots?fieldId=$encodedFieldId").timeSlots
    }

    override suspend fun createTimeSlot(slot: TimeSlot): Result<TimeSlot> = runCatching {
        val normalizedDays = slot.normalizedDaysOfWeek()
        api.post<CreateTimeSlotRequestDto, TimeSlot>(
            path = "api/time-slots",
            body = CreateTimeSlotRequestDto(
                id = slot.id,
                dayOfWeek = normalizedDays.firstOrNull() ?: slot.dayOfWeek,
                daysOfWeek = normalizedDays.takeIf { it.isNotEmpty() },
                startTimeMinutes = slot.startTimeMinutes,
                endTimeMinutes = slot.endTimeMinutes,
                startDate = slot.startDate.toString(),
                repeating = slot.repeating,
                endDate = slot.endDate?.toString(),
                scheduledFieldId = slot.scheduledFieldId,
                price = slot.price,
                requiredTemplateIds = slot.requiredTemplateIds,
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
                    startTimeMinutes = payload.startTimeMinutes,
                    endTimeMinutes = payload.endTimeMinutes,
                    startDate = payload.startDate,
                    repeating = payload.repeating,
                    endDate = payload.endDate,
                    scheduledFieldId = payload.scheduledFieldId,
                    price = payload.price,
                    requiredTemplateIds = payload.requiredTemplateIds,
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
        startTimeMinutes = startTimeMinutes,
        endTimeMinutes = endTimeMinutes,
        startDate = startDate.toString(),
        repeating = repeating,
        endDate = endDate?.toString(),
        scheduledFieldId = scheduledFieldId,
        price = price,
        requiredTemplateIds = requiredTemplateIds,
    )
}

@Serializable
private data class CreateTimeSlotRequestDto(
    val id: String,
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int>? = null,
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val repeating: Boolean = false,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val price: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
)

@Serializable
private data class UpdateTimeSlotRequestDto(
    val slot: UpdateTimeSlotPayload,
)

@Serializable
private data class UpdateTimeSlotPayload(
    val dayOfWeek: Int? = null,
    val daysOfWeek: List<Int>? = null,
    val startTimeMinutes: Int? = null,
    val endTimeMinutes: Int? = null,
    val startDate: String,
    val repeating: Boolean = false,
    val endDate: String? = null,
    val scheduledFieldId: String? = null,
    val price: Int? = null,
    val requiredTemplateIds: List<String> = emptyList(),
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
    val type: String? = null,
    val rentalSlotIds: List<String> = emptyList(),
    val location: String? = null,
    val organizationId: String? = null,
)
