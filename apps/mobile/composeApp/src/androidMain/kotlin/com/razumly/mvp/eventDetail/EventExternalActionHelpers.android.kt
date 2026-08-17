package com.razumly.mvp.eventDetail

import io.ktor.http.encodeURLQueryComponent

internal actual fun eventDirectionsUrls(destinationQuery: String): EventDirectionsUrls =
    EventDirectionsUrls(
        primaryUrl = "geo:0,0?q=${destinationQuery.encodeURLQueryComponent()}",
    )
