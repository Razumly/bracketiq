package com.razumly.mvp.core.data.dataTypes

data class MVPPlace(
    val name: String,
    val id: String,
    val lat: Double = 0.0,
    val long: Double = 0.0,
)