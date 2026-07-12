package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.IFieldRepository
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

internal data class EventScopedValue<T>(
    val eventId: String,
    val value: T,
)

internal data class EventTimeSlotLoadTarget(
    val eventId: String,
    val slotIds: List<String>,
    val bootstrapSlots: List<TimeSlot>?,
    val bootstrapped: Boolean,
)

internal data class EventLeagueScoringLoadTarget(
    val eventId: String,
    val scoringConfigId: String,
    val bootstrapConfig: LeagueScoringConfig?,
    val bootstrapped: Boolean,
)

internal fun resolveEventTimeSlotLoadTarget(
    eventId: String,
    slotIds: List<String>,
    bootstrap: EventScopedValue<List<TimeSlot>>?,
    bootstrappedEventIds: Set<String>,
): EventTimeSlotLoadTarget {
    val scopedSlots = bootstrap
        ?.takeIf { scoped -> scoped.eventId == eventId }
        ?.value
        .orEmpty()
    val slotsById = scopedSlots.associateBy { slot -> slot.id.trim() }
    val orderedBootstrapSlots = slotIds.mapNotNull(slotsById::get)
    return EventTimeSlotLoadTarget(
        eventId = eventId,
        slotIds = slotIds,
        bootstrapSlots = orderedBootstrapSlots.takeIf { slots -> slots.size == slotIds.size },
        bootstrapped = bootstrappedEventIds.contains(eventId),
    )
}

internal fun resolveEventLeagueScoringLoadTarget(
    eventId: String,
    scoringConfigId: String,
    bootstrap: EventScopedValue<LeagueScoringConfig?>?,
    bootstrappedEventIds: Set<String>,
): EventLeagueScoringLoadTarget =
    EventLeagueScoringLoadTarget(
        eventId = eventId,
        scoringConfigId = scoringConfigId,
        bootstrapConfig = bootstrap?.takeIf { scoped -> scoped.eventId == eventId }?.value,
        bootstrapped = bootstrappedEventIds.contains(eventId),
    )

@OptIn(ExperimentalCoroutinesApi::class)
internal class EventBootstrapResourcesCoordinator(
    selectedEvent: StateFlow<Event>,
    eventRelations: StateFlow<EventWithRelations>,
    private val fieldRepository: IFieldRepository,
    private val eventRepository: IEventRepository,
    scope: CoroutineScope,
) {
    private val _bootstrappedEventIds = MutableStateFlow<Set<String>>(emptySet())
    val bootstrappedEventIds = _bootstrappedEventIds.asStateFlow()

    private val _bootstrapTimeSlots = MutableStateFlow<EventScopedValue<List<TimeSlot>>?>(null)
    private val _bootstrapLeagueScoringConfig = MutableStateFlow<EventScopedValue<LeagueScoringConfig?>?>(null)

    val eventTimeSlots: StateFlow<List<TimeSlot>> = selectedEvent
        .map { selected ->
            selected.id.trim() to selected.timeSlotIds
                .map { slotId -> slotId.trim() }
                .filter(String::isNotBlank)
                .distinct()
        }
        .distinctUntilChanged()
        .combine(_bootstrapTimeSlots) { (eventId, slotIds), bootstrap ->
            resolveEventTimeSlotLoadTarget(
                eventId = eventId,
                slotIds = slotIds,
                bootstrap = bootstrap,
                bootstrappedEventIds = _bootstrappedEventIds.value,
            )
        }
        .distinctUntilChanged()
        .flatMapLatest { target ->
            val eventId = target.eventId
            val slotIds = target.slotIds
            if (slotIds.isEmpty()) {
                flowOf(emptyList())
            } else if (target.bootstrapSlots != null) {
                flowOf(target.bootstrapSlots)
            } else {
                flow {
                    val slots = fieldRepository.getTimeSlots(slotIds)
                        .onFailure { error ->
                            Napier.w("Failed to refresh time slots for event $eventId: ${error.message}")
                        }
                        .getOrElse { emptyList() }
                    emit(slots)
                }
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, emptyList())

    val eventLeagueScoringConfig: StateFlow<LeagueScoringConfig?> = eventRelations
        .map { relations ->
            relations.event.id to relations.event.leagueScoringConfigId
                .orEmpty()
                .trim()
        }
        .distinctUntilChanged()
        .combine(_bootstrapLeagueScoringConfig) { (eventId, scoringConfigId), bootstrap ->
            resolveEventLeagueScoringLoadTarget(
                eventId = eventId,
                scoringConfigId = scoringConfigId,
                bootstrap = bootstrap,
                bootstrappedEventIds = _bootstrappedEventIds.value,
            )
        }
        .distinctUntilChanged()
        .flatMapLatest { target ->
            val eventId = target.eventId
            val scoringConfigId = target.scoringConfigId
            if (scoringConfigId.isBlank()) {
                flowOf<LeagueScoringConfig?>(null)
            } else if (target.bootstrapped) {
                flowOf(target.bootstrapConfig)
            } else {
                flowOf(
                    eventRepository.getLeagueScoringConfig(eventId)
                        .onFailure { error ->
                            Napier.w(
                                "Failed to load league scoring config for event $eventId: ${error.message}"
                            )
                        }
                        .getOrNull()
                )
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, null)

    fun applyEventDetailSyncResult(result: EventDetailSyncResult) {
        val normalizedEventId = result.event.id.trim()
        if (normalizedEventId.isBlank()) return
        _bootstrappedEventIds.value = _bootstrappedEventIds.value + normalizedEventId
        _bootstrapTimeSlots.value = EventScopedValue(normalizedEventId, result.timeSlots)
        _bootstrapLeagueScoringConfig.value = EventScopedValue(normalizedEventId, result.leagueScoringConfig)
    }
}
