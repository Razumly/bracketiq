package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.Event

fun Event.resolveParticipantCapacity(): Int {
    val fallbackCapacity = maxParticipants.coerceAtLeast(0)
    if (singleDivision) {
        return fallbackCapacity
    }

    val splitDivisionCapacity = divisionDetails.sumOf { detail ->
        detail.maxParticipants?.coerceAtLeast(0) ?: 0
    }

    return if (splitDivisionCapacity > 0) {
        splitDivisionCapacity
    } else {
        fallbackCapacity
    }
}
