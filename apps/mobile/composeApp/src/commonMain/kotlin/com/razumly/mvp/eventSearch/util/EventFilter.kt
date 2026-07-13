package com.razumly.mvp.eventSearch.util

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.eventTagIdentity
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
data class EventFilter(
    val price: Pair<Double, Double>? = null,
    val date: Pair<Instant, Instant?> = Pair(Clock.System.now(), null),
    val sportIds: Set<String> = emptySet(),
    val tagSlugs: Set<String> = emptySet(),
) {
    fun filter(event: Event, includePastEvents: Boolean = false): Boolean {
        if (sportIds.isNotEmpty()) {
            val eventSportId = event.sportId?.trim()?.takeIf(String::isNotBlank) ?: return false
            if (eventSportId !in sportIds) return false
        }
        if (tagSlugs.isNotEmpty()) {
            val eventTagSlugs = event.tags.map { tag -> tag.eventTagIdentity() }.toSet()
            if (eventTagSlugs.none { tagSlug -> tagSlug in tagSlugs }) return false
        }
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
                if (event.start > date.second!!) return false
            } else if (event.start > date.second!!) {
                return false
            }
        }
        return true
    }
}
