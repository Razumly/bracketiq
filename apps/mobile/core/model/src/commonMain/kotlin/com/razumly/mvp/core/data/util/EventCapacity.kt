package com.razumly.mvp.core.data.util

import com.razumly.mvp.core.data.dataTypes.Event

fun Event.resolveParticipantCapacity(): Int {
    if (divisions.isEmpty()) {
        return maxParticipants.coerceAtLeast(0)
    }

    return divisions
        .normalizeDivisionIdentifiers()
        .sumOf { divisionId ->
            divisionDetails
                .firstOrNull { detail -> detail.id.normalizeDivisionIdentifier() == divisionId }
                ?.maxParticipants
                ?.coerceAtLeast(0)
                ?: 0
    }
}
