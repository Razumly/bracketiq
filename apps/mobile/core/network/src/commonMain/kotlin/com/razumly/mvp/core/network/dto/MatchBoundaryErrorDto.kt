package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.Serializable

/** The site owns this error from a rejected manual Match save. */
@Serializable
data class MatchBoundaryErrorDto(
    val code: String,
    val error: String,
    val eventId: String,
    val eventStart: String,
    val eventEnd: String?,
    val matchIds: List<String>,
)

internal fun decodeMatchBoundaryError(body: String?): MatchBoundaryErrorDto? = body?.let {
    runCatching { jsonMVP.decodeFromString<MatchBoundaryErrorDto>(it) }.getOrNull()
        ?.takeIf { error -> error.code == "MATCH_OUTSIDE_EVENT_BOUNDS" }
}
