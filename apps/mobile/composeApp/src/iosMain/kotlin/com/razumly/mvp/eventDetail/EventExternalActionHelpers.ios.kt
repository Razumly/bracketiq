package com.razumly.mvp.eventDetail

import io.ktor.http.encodeURLQueryComponent

internal actual fun eventDirectionsUrls(destinationQuery: String): EventDirectionsUrls {
    val encodedDestination = destinationQuery.encodeURLQueryComponent()
    return EventDirectionsUrls(
        primaryUrl = "geo-navigation:///directions?destination=$encodedDestination",
        fallbackUrls = listOf("https://maps.apple.com/?daddr=$encodedDestination"),
    )
}
