package com.razumly.mvp.core.data.dataTypes

data class MVPPlace(
    val name: String,
    val id: String,
    val coordinates: List<Double> = listOf(0.0, 0.0),
) {
    val latitude: Double get() = coordinates.getOrNull(1) ?: 0.0
    val longitude: Double get() = coordinates.getOrNull(0) ?: 0.0
}
