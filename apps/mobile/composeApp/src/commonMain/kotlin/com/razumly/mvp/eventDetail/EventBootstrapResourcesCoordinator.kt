package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.repositories.EventDetailSyncResult
import com.razumly.mvp.core.data.repositories.IEventRepository
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
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

internal data class EventScopedValue<T>(
    val eventId: String,
    val value: T,
)

internal data class EventLeagueScoringLoadTarget(
    val eventId: String,
    val scoringConfigId: String,
    val bootstrapConfig: LeagueScoringConfig?,
    val bootstrapped: Boolean,
)

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
    eventRelations: StateFlow<EventWithRelations>,
    private val eventRepository: IEventRepository,
    scope: CoroutineScope,
) {
    private val _bootstrappedEventIds = MutableStateFlow<Set<String>>(emptySet())
    val bootstrappedEventIds = _bootstrappedEventIds.asStateFlow()

    private val _bootstrapLeagueScoringConfig = MutableStateFlow<EventScopedValue<LeagueScoringConfig?>?>(null)

    val eventTimeSlots: StateFlow<List<TimeSlot>> = eventRelations
        .map { relations -> relations.timeSlots }
        .distinctUntilChanged()
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
            if (target.scoringConfigId.isBlank()) {
                flowOf<LeagueScoringConfig?>(null)
            } else if (target.bootstrapped) {
                flowOf(target.bootstrapConfig)
            } else {
                flowOf(
                    eventRepository.getLeagueScoringConfig(target.eventId)
                        .onFailure { error ->
                            Napier.w(
                                "Failed to load league scoring config for event ${target.eventId}: ${error.message}"
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
        _bootstrapLeagueScoringConfig.value = EventScopedValue(normalizedEventId, result.leagueScoringConfig)
    }
}
