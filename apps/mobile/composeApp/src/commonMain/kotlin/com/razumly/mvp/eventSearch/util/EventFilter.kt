package com.razumly.mvp.eventSearch.util

import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

data class EventFilter (
    val eventType: EventType? = null,
    val field: FieldType? = null,
    val price: Pair<Double, Double>? = null,
    val date: Pair<Instant, Instant?>? = Pair(Clock.System.now(), null),
) {
    fun filter(event: EventAbs): Boolean {
        if (eventType != null) {
            when (event) {
                is Tournament -> {
                    if (eventType != EventType.TOURNAMENT) return false
                }
                else -> {
                    if (eventType != EventType.EVENT) return false
                }
            }
        }
        if (price != null && (event.price < price.first || event.price > price.second)) return false
        if (date != null && event.start < date.first) return false
        if (date?.second != null && event.start > date.second!!) return false
        if (field != null && event.fieldType != field) return false
        return true
    }
}