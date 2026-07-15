package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.daos.CatalogCacheDao
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.MvpApiSession
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.CancellationException

internal const val CATALOG_ANONYMOUS_VIEWER_KEY = "anonymous"

internal data class CatalogCacheScope(
    val viewerKey: String,
    val isAnonymous: Boolean,
    val api: MvpApiSession,
)

/**
 * Activates a cache scope tied to the exact bearer identity without persisting the bearer token.
 * Token rotation intentionally starts a fresh cache; serving less offline data is preferable to
 * crossing an authentication boundary.
 */
internal suspend fun MvpApiClient.activateCatalogCache(dao: CatalogCacheDao): CatalogCacheScope {
    val session = openSession()
    val token = session.token
    val viewerKey = if (token.isBlank()) {
        CATALOG_ANONYMOUS_VIEWER_KEY
    } else {
        "authenticated:${token.catalogTokenFingerprint()}"
    }
    dao.activateViewer(viewerKey)
    return CatalogCacheScope(viewerKey = viewerKey, isAnonymous = token.isBlank(), api = session)
}

/** Only transport failures, 408, 429, and 5xx responses may use an exact cached snapshot. */
internal fun Throwable.isCatalogFallbackEligible(): Boolean {
    // Cancellation must win even when an HTTP engine wraps it in an IOException. Falling back in
    // that case converts structured-concurrency cancellation into a successful stale response.
    if (hasCancellationCause()) return false
    if (this is ApiException) return statusCode == 408 || statusCode == 429 || statusCode in 500..599
    if (this is IOException) return true
    val nested = cause?.takeUnless { cause -> cause === this } ?: return false
    return nested.isCatalogFallbackEligible()
}

private fun Throwable.hasCancellationCause(): Boolean {
    if (this is CancellationException) return true
    val nested = cause?.takeUnless { cause -> cause === this } ?: return false
    return nested.hasCancellationCause()
}

internal fun catalogCacheKey(
    scope: CatalogCacheScope,
    resourceType: String,
    projectionKey: String,
    vararg queryParts: String,
): String = buildList {
    add(scope.viewerKey)
    add(resourceType)
    add(projectionKey)
    addAll(queryParts)
}.joinToString(separator = "\u001f") { part -> "${part.length}:$part" }

private fun String.catalogTokenFingerprint(): String {
    // Two independent 64-bit FNV-style accumulators make accidental scope collisions negligible
    // while keeping the raw credential out of Room and logs on every supported KMP target.
    var first = -3750763034362895579L
    var second = -7046029254386353131L
    forEachIndexed { index, character ->
        first = (first xor character.code.toLong()) * 1099511628211L
        second = (second xor (character.code.toLong() + index + 1L)) * -7046029254386353131L
    }
    return first.toULong().toString(16).padStart(16, '0') +
        second.toULong().toString(16).padStart(16, '0')
}
