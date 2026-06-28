package com.razumly.mvp.core.data.dataTypes

data class MVPPlace(
    val name: String,
    val id: String,
    val coordinates: List<Double> = listOf(0.0, 0.0),
    val address: String? = null,
    val summary: String? = null,
    val imageRef: String? = null,
    val imageUrl: String? = null,
    val markerKind: String = MARKER_KIND_PLACE,
) {
    val latitude: Double get() = coordinates.getOrNull(1) ?: 0.0
    val longitude: Double get() = coordinates.getOrNull(0) ?: 0.0

    companion object {
        const val MARKER_KIND_PLACE = "place"
        const val MARKER_KIND_ORGANIZATION = "organization"
        const val MARKER_KIND_RENTAL = "rental"
    }
}
