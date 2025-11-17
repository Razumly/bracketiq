package com.razumly.mvp.eventSearch.util

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import kotlin.time.Clock
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
data class EventFilter(
    val eventType: EventType? = null,
    val field: FieldType? = null,
    val price: Pair<Double, Double>? = null,
    val date: Pair<Instant, Instant?> = Pair(Clock.System.now(), null),
) {
    fun filter(event: Event): Boolean {
        if (eventType != null && event.eventType != eventType) return false
        if (price != null && (event.price < price.first || event.price > price.second)) return false
        if (event.start < date.first) return false
        if (date.second != null && event.start > date.second!!) return false
        if (field != null && event.fieldType != field) return false
        return true
    }
}
