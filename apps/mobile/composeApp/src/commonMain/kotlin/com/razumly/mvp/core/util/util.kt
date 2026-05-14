package com.razumly.mvp.core.util

import com.razumly.mvp.core.data.dataTypes.Bounds
import dev.icerock.moko.geo.LatLng
import dev.icerock.moko.geo.LocationTracker
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json
import kotlin.math.PI
import kotlin.math.absoluteValue
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt

fun Int.ceilDiv(other: Int): Int {
    return this.floorDiv(other) + this.rem(other).sign.absoluteValue
}

val emailAddressRegex = Regex(
    "[a-zA-Z0-9+._%\\-]{1,256}" +
            "@" +
            "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}" +
            "(" +
            "\\." +
            "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25}" +
            ")+"
)
fun getBounds(radius: Double, latitude: Double, longitude: Double): Bounds {
    val earthCircumference = 24902.0
    val deltaLatitude = 360.0 * radius / earthCircumference
    val deltaLongitude =
        deltaLatitude / cos((latitude.times(PI)) / 180.0)

    return Bounds(
        north = latitude + deltaLatitude,
        south = latitude - deltaLatitude,
        west = longitude - deltaLongitude,
        east = longitude + deltaLongitude,
        center = LatLng(latitude, longitude),
        radiusMiles = radius
    )
}


fun calcDistance(start: LatLng, end: LatLng): Double {
    val earthRadiusMiles = 3958.8
    val startLat = start.latitude * PI / 180.0
    val endLat = end.latitude * PI / 180.0
    val deltaLat = (end.latitude - start.latitude) * PI / 180.0
    val deltaLong = (end.longitude - start.longitude) * PI / 180.0
    val a = sin(deltaLat / 2) * sin(deltaLat / 2) +
            cos(startLat) * cos(endLat) * sin(deltaLong / 2) * sin(deltaLong / 2)
    val normalizedA = a.coerceIn(0.0, 1.0)
    val c = 2 * atan2(sqrt(normalizedA), sqrt(1 - normalizedA))
    return earthRadiusMiles * c
}

@Suppress("unused")
suspend fun LocationTracker.getCurrentLocation(): LatLng {
    try {
        val location = getLocationsFlow().first()
        return location
    } catch (e: Exception) {
        Napier.e("Failed to get current location: ${e.message}")
        return LatLng(0.0, 0.0)
    }
}

val jsonMVP =  Json {
    encodeDefaults = true
    isLenient = true
    allowSpecialFloatingPointValues = true
    allowStructuredMapKeys = true
    prettyPrint = false
    useArrayPolymorphism = false
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
}

@Suppress("unused", "EXPECT_ACTUAL_CLASSIFIERS_ARE_IN_BETA_WARNING")
expect object Platform {
    val name: String
    val isIOS: Boolean
    val isDebugBuild: Boolean
    val isNonReleaseBuild: Boolean
}
