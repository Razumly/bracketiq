package com.razumly.mvp.core.util

import com.google.android.gms.maps.model.LatLng

fun dev.icerock.moko.geo.LatLng.toGoogle() = LatLng(this.latitude, this.longitude)
