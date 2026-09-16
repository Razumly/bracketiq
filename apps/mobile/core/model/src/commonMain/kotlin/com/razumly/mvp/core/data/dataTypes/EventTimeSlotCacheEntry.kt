package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.Index
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

/**
 * The accepted canonical Time Slot projection for one Event editor save.
 *
 * Event ownership keeps Resource and Division scope separate from the shared catalog cache.
 */
@Entity(
    tableName = "event_time_slot_cache",
    primaryKeys = ["eventId", "slotId"],
    indices = [Index("eventId")],
)
@OptIn(ExperimentalTime::class)
data class EventTimeSlotCacheEntry(
    val eventId: String,
    val slotId: String,
    val position: Int,
    val dayOfWeek: Int?,
    val daysOfWeek: List<Int>?,
    val divisions: List<String>?,
    val startTimeMinutes: Int?,
    val endTimeMinutes: Int?,
    val startDate: Instant,
    val timeZone: String,
    val repeating: Boolean,
    val endDate: Instant?,
    val scheduledFieldId: String?,
    val scheduledFieldIds: List<String>?,
    val price: Int?,
    val requiredTemplateIds: List<String>,
    val hostRequiredTemplateIds: List<String>,
    val sourceType: String?,
    val rentalBookingId: String?,
    val rentalBookingItemId: String?,
    val rentalLocked: Boolean?,
)

@OptIn(ExperimentalTime::class)
fun TimeSlot.toEventTimeSlotCacheEntry(
    eventId: String,
    position: Int,
): EventTimeSlotCacheEntry = EventTimeSlotCacheEntry(
    eventId = eventId,
    slotId = id,
    position = position,
    dayOfWeek = dayOfWeek,
    daysOfWeek = daysOfWeek,
    divisions = divisions,
    startTimeMinutes = startTimeMinutes,
    endTimeMinutes = endTimeMinutes,
    startDate = startDate,
    timeZone = timeZone,
    repeating = repeating,
    endDate = endDate,
    scheduledFieldId = scheduledFieldId,
    scheduledFieldIds = scheduledFieldIds,
    price = price,
    requiredTemplateIds = requiredTemplateIds,
    hostRequiredTemplateIds = hostRequiredTemplateIds,
    sourceType = sourceType,
    rentalBookingId = rentalBookingId,
    rentalBookingItemId = rentalBookingItemId,
    rentalLocked = rentalLocked,
)

@OptIn(ExperimentalTime::class)
fun EventTimeSlotCacheEntry.toTimeSlot(): TimeSlot = TimeSlot(
    id = slotId,
    dayOfWeek = dayOfWeek,
    daysOfWeek = daysOfWeek,
    divisions = divisions,
    startTimeMinutes = startTimeMinutes,
    endTimeMinutes = endTimeMinutes,
    startDate = startDate,
    timeZone = timeZone,
    repeating = repeating,
    endDate = endDate,
    scheduledFieldId = scheduledFieldId,
    scheduledFieldIds = scheduledFieldIds,
    price = price,
    requiredTemplateIds = requiredTemplateIds,
    hostRequiredTemplateIds = hostRequiredTemplateIds,
    sourceType = sourceType,
    rentalBookingId = rentalBookingId,
    rentalBookingItemId = rentalBookingItemId,
    rentalLocked = rentalLocked,
)
