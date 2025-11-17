package com.razumly.mvp.core.data.dataTypes

import dev.icerock.moko.geo.LatLng

data class Bounds(
    val north: Double,
    val east: Double,
    val south: Double,
    val west: Double,
    val center: LatLng,
    val radiusMiles: Double
)
