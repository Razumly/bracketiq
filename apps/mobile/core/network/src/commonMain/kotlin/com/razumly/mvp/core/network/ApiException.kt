package com.razumly.mvp.core.network

import com.razumly.mvp.core.network.dto.MatchBoundaryErrorDto
import com.razumly.mvp.core.network.dto.decodeMatchBoundaryError

class ApiException(
    val statusCode: Int,
    val url: String,
    val responseBody: String?,
) : Exception("HTTP $statusCode for $url") {
    val matchBoundaryError: MatchBoundaryErrorDto? = decodeMatchBoundaryError(responseBody)
}
