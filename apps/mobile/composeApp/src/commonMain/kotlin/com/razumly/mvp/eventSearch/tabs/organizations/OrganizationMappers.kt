package com.razumly.mvp.eventSearch.tabs.organizations

import com.razumly.mvp.core.data.dataTypes.MVPPlace
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.resolvedLogoRef
import com.razumly.mvp.core.network.apiBaseUrl
import com.razumly.mvp.core.presentation.util.getImageUrl
import com.razumly.mvp.core.presentation.util.getInitialsAvatarUrl

private fun resolveDisplayImageUrl(value: String?): String? {
    val normalized = value?.trim()?.takeIf { it.isNotBlank() } ?: return null
    return when {
        normalized.startsWith("http://", ignoreCase = true) ||
            normalized.startsWith("https://", ignoreCase = true) -> normalized
        normalized.startsWith("/") -> "${apiBaseUrl.trimEnd('/')}$normalized"
        else -> null
    }
}

internal fun Organization.toMvpPlaceOrNull(
    markerKind: String = MVPPlace.MARKER_KIND_ORGANIZATION,
): MVPPlace? {
    val coords = coordinates ?: return null
    if (coords.size < 2) return null
    val longitude = coords[0]
    val latitude = coords[1]
    if (latitude.isNaN() || longitude.isNaN()) return null
    val normalizedLogoId = logoId?.trim()?.takeIf { it.isNotBlank() }
    val resolvedImageUrl = resolveDisplayImageUrl(resolvedLogoRef())
        ?: normalizedLogoId?.let { getImageUrl(fileId = it, width = 96, height = 96) }
        ?: getInitialsAvatarUrl(name = name, size = 96)
    return MVPPlace(
        name = name,
        id = id,
        coordinates = listOf(longitude, latitude),
        address = address ?: location,
        summary = description?.trim()?.takeIf { it.isNotBlank() },
        imageRef = normalizedLogoId,
        imageUrl = resolvedImageUrl,
        markerKind = markerKind,
    )
}
