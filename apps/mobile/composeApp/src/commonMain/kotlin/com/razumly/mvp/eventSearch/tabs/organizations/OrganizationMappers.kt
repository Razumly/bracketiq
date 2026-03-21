package com.razumly.mvp.eventSearch.tabs.organizations

import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Organization

internal fun Organization.toMvpPlaceOrNull(): MVPPlace? {
    val coords = coordinates ?: return null
    if (coords.size < 2) return null
    val longitude = coords[0]
    val latitude = coords[1]
    if (latitude.isNaN() || longitude.isNaN()) return null
    return MVPPlace(
        name = name,
        id = id,
        coordinates = listOf(longitude, latitude),
    )
}
