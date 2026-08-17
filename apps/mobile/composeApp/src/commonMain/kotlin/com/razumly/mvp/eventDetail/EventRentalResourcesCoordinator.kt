package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.normalizedScheduledFieldIds
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.util.resolvedTimeZone
import com.razumly.mvp.core.util.toTimeZoneOrUtc
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal data class RentalResourceDraftSyncResult(
    val event: Event,
    val fields: List<Field>,
    val timeSlots: List<TimeSlot>,
)

internal class EventRentalResourcesCoordinator {
    private val _availableResources = MutableStateFlow<List<RentalResourceOption>>(emptyList())
    val availableResources = _availableResources.asStateFlow()

    private val _selectedResourceIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedResourceIds = _selectedResourceIds.asStateFlow()

    fun setSelected(optionId: String, selected: Boolean): Boolean {
        val normalizedOptionId = optionId.trim()
        if (normalizedOptionId.isEmpty()) return false
        _availableResources.value.firstOrNull { option -> option.id == normalizedOptionId } ?: return false
        val nextSelected = if (selected) {
            _selectedResourceIds.value + normalizedOptionId
        } else {
            _selectedResourceIds.value - normalizedOptionId
        }
        if (nextSelected == _selectedResourceIds.value) return false
        _selectedResourceIds.value = nextSelected
        return true
    }

    fun setAttachedResourceSelection(
        slots: List<TimeSlot>,
        eventId: String,
    ): Boolean {
        val nextSelected = resolveAttachedResourceIds(
            options = _availableResources.value,
            slots = slots,
            eventId = eventId,
        )
        if (nextSelected == _selectedResourceIds.value) return false
        _selectedResourceIds.value = nextSelected
        return true
    }

    fun applyLoadedResources(
        options: List<RentalResourceOption>,
        slots: List<TimeSlot>,
        eventId: String,
    ): Boolean {
        _availableResources.value = options
        val availableIds = options.map { option -> option.id }.toSet()
        val attachedIds = resolveAttachedResourceIds(options, slots, eventId)
        val normalizedSelected = (_selectedResourceIds.value.filter(availableIds::contains) + attachedIds).toSet()
        if (normalizedSelected == _selectedResourceIds.value) return false
        _selectedResourceIds.value = normalizedSelected
        return true
    }

    fun selectedOptions(): List<RentalResourceOption> {
        val selectedIds = _selectedResourceIds.value
        if (selectedIds.isEmpty()) return emptyList()
        return _availableResources.value.filter { option -> selectedIds.contains(option.id) }
    }

    fun selectedFields(
        options: List<RentalResourceOption> = selectedOptions(),
    ): List<Field> =
        options
            .map { option -> option.field }
            .filter { field -> field.id.isNotBlank() }
            .distinctBy { field -> field.id.trim() }
            .mapIndexed { index, field -> field.copy(fieldNumber = index + 1) }

    fun resolveAttachedResourceIds(
        options: List<RentalResourceOption>,
        slots: List<TimeSlot>,
        eventId: String,
    ): Set<String> {
        val rentalSlotItemIds = slots
            .filter { slot -> slot.isRentalBacked() }
            .mapNotNull { slot -> slot.rentalBookingItemId?.trim()?.takeIf(String::isNotBlank) }
            .toSet()
        val rentalSlotBookingIds = slots
            .filter { slot -> slot.isRentalBacked() }
            .mapNotNull { slot -> slot.rentalBookingId?.trim()?.takeIf(String::isNotBlank) }
            .toSet()
        return options
            .filter { option ->
                option.eventId == eventId ||
                    rentalSlotItemIds.contains(option.bookingItemId) ||
                    rentalSlotBookingIds.contains(option.bookingId)
            }
            .map { option -> option.id }
            .toSet()
    }

    fun normalizeSlotResourceSelection(
        slot: TimeSlot,
        validFieldIds: Set<String>,
    ): TimeSlot {
        val rentalOptionsByFieldId = _availableResources.value
            .mapNotNull { option ->
                option.field.id.trim().takeIf(String::isNotBlank)?.let { fieldId -> fieldId to option }
            }
            .toMap()

        if (!slot.isRentalBacked()) {
            if (rentalOptionsByFieldId.isEmpty()) return slot
            val retainedFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
                (validFieldIds.isEmpty() || fieldId in validFieldIds) && !rentalOptionsByFieldId.containsKey(fieldId)
            }
            return slot.copy(
                scheduledFieldId = retainedFieldIds.firstOrNull(),
                scheduledFieldIds = retainedFieldIds,
            )
        }

        val primaryRentalFieldId = _availableResources.value
            .firstOrNull { option -> slot.rentalBookingItemId == option.bookingItemId }
            ?.field
            ?.id
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: slot.scheduledFieldId?.trim()?.takeIf(String::isNotBlank)

        val retainedFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
            if (validFieldIds.isNotEmpty() && fieldId !in validFieldIds) {
                return@filter false
            }
            val rentalOption = rentalOptionsByFieldId[fieldId]
            rentalOption == null || rentalOption.matchesSlot(slot)
        }
        val normalizedFieldIds = (listOfNotNull(primaryRentalFieldId) + retainedFieldIds).distinct()
        return slot.copy(
            scheduledFieldId = normalizedFieldIds.firstOrNull(),
            scheduledFieldIds = normalizedFieldIds,
        )
    }

    fun buildEditDraft(
        event: Event,
        currentFields: List<Field>,
        currentSlots: List<TimeSlot>,
        defaultDivisionIds: List<String>,
    ): RentalResourceDraftSyncResult {
        val selectedOptions = selectedOptions()
        val rentalFields = selectedFields(selectedOptions)
        val selectedRentalFieldIds = rentalFields
            .map { field -> field.id.trim() }
            .filter(String::isNotBlank)
            .toSet()
        val knownRentalFieldIds = _availableResources.value
            .map { option -> option.field.id.trim() }
            .filter(String::isNotBlank)
            .toSet()
        val customFields = currentFields.filterNot { field -> knownRentalFieldIds.contains(field.id.trim()) }
        val nextFields = (rentalFields + customFields)
            .distinctBy { field -> field.id.trim() }
            .mapIndexed { index, field -> field.copy(fieldNumber = index + 1) }

        val rentalSlots = selectedOptions.map { option ->
            option.toRentalTimeSlot(
                event = event,
                defaultDivisionIds = defaultDivisionIds,
            )
        }
        val rentalSlotIds = rentalSlots.map { slot -> slot.id }.toSet()
        val validFieldIds = nextFields.map { field -> field.id }.toSet()
        val customSlots = currentSlots
            .filterNot { slot -> slot.isRentalBacked() || rentalSlotIds.contains(slot.id) }
            .map { slot ->
                val remainingFieldIds = slot.normalizedScheduledFieldIds().filter { fieldId ->
                    validFieldIds.contains(fieldId) && !selectedRentalFieldIds.contains(fieldId)
                }
                slot.copy(
                    scheduledFieldId = remainingFieldIds.firstOrNull(),
                    scheduledFieldIds = remainingFieldIds,
                )
            }
            .filter { slot -> slot.normalizedScheduledFieldIds().isNotEmpty() }

        val nextSlots = (rentalSlots + customSlots).sortedWith(
            compareBy<TimeSlot> { slot -> slot.startDate }
                .thenBy { slot -> slot.startTimeMinutes ?: Int.MAX_VALUE }
                .thenBy { slot -> slot.id }
        )
        return RentalResourceDraftSyncResult(
            fields = nextFields,
            timeSlots = nextSlots,
            event = event.copy(
                fieldIds = nextFields.map { field -> field.id },
                timeSlotIds = nextSlots.map { slot -> slot.id },
            ),
        )
    }

    private fun RentalResourceOption.matchesSlot(slot: TimeSlot): Boolean {
        if (slot.rentalBookingItemId == bookingItemId) {
            return true
        }
        return !slot.repeating &&
            slot.startDate == start &&
            slot.endDate == end
    }

    private fun RentalResourceOption.toRentalTimeSlot(
        event: Event,
        defaultDivisionIds: List<String>,
    ): TimeSlot {
        val eventTimeZone = timeZone.toTimeZoneOrUtc(event.resolvedTimeZone())
        val slotDay = start.toMondayFirstDay(eventTimeZone)
        val slotId = eventTimeSlotId
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: "rental-slot-${bookingItemId.trim().ifBlank { id }}".replace(Regex("[^A-Za-z0-9_-]"), "-")
        return TimeSlot(
            id = slotId,
            dayOfWeek = slotDay,
            daysOfWeek = listOf(slotDay),
            divisions = defaultDivisionIds,
            startTimeMinutes = start.toMinutesOfDay(eventTimeZone),
            endTimeMinutes = end.toMinutesOfDay(eventTimeZone),
            startDate = start,
            timeZone = timeZone,
            repeating = false,
            endDate = end,
            scheduledFieldId = field.id,
            scheduledFieldIds = listOf(field.id),
            price = null,
            requiredTemplateIds = requiredTemplateIds.normalizeDistinctIds(),
            hostRequiredTemplateIds = hostRequiredTemplateIds.normalizeDistinctIds(),
            sourceType = "RENTAL_BOOKING",
            rentalBookingId = bookingId,
            rentalBookingItemId = bookingItemId,
            rentalLocked = true,
        )
    }
}
