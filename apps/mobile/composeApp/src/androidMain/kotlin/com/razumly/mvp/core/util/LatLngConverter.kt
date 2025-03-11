package com.razumly.mvp.core.util

import com.google.android.gms.maps.model.LatLng

fun LatLng.toMoko() = dev.icerock.moko.geo.LatLng(this.latitude, this.longitude)


fun dev.icerock.moko.geo.LatLng.toGoogle() = LatLng(this.latitude, this.longitude)
