package com.razumly.mvp.eventMap

import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.net.PlacesClient
import com.razumly.mvp.core.data.dataTypes.MVPPlace
import kotlinx.coroutines.coroutineScope

suspend fun Place.toMVPPlace(placesClient: PlacesClient): MVPPlace = coroutineScope {
    MVPPlace(
        name = this@toMVPPlace.displayName ?: "",
        id = this@toMVPPlace.id ?: "",
        lat = this@toMVPPlace.location?.latitude ?: 0.0,
        long = this@toMVPPlace.location?.longitude ?: 0.0,
    )
}