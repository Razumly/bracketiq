package com.razumly.mvp.eventSearch.util

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
data class EventFilter(
    val eventType: EventType? = null,
    val price: Pair<Double, Double>? = null,
    val date: Pair<Instant, Instant?> = Pair(Clock.System.now(), null),
) {
    fun filter(event: Event, includePastEvents: Boolean = false): Boolean {
        if (eventType != null && event.eventType != eventType) return false
        if (price != null && (event.price < price.first || event.price > price.second)) return false
        val usesWeeklyEndFiltering = event.eventType == EventType.WEEKLY_EVENT
        val effectiveWeeklyEnd = if (usesWeeklyEndFiltering && event.noFixedEndDateTime && event.end <= event.start) {
            Instant.DISTANT_FUTURE
        } else {
            event.end
        }
        if (!includePastEvents) {
            if (usesWeeklyEndFiltering) {
                if (effectiveWeeklyEnd < date.first) return false
            } else if (event.start < date.first) {
                return false
            }
        }
        if (date.second != null) {
            if (usesWeeklyEndFiltering) {
                if (effectiveWeeklyEnd > date.second!!) return false
            } else if (event.start > date.second!!) {
                return false
            }
        }
        return true
    }
}
