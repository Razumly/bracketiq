package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.network.ApiException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal const val PROTECTED_MATCH_HISTORY_DELETE_CONFIRMATION = "DELETE_PROTECTED_MATCH_HISTORY"

internal fun protectedMatchDeletionWarning(exception: Exception, deletes: List<String>): String? {
    val failure = exception as? ApiException ?: return null
    if (failure.statusCode != 409) return null
    val body = runCatching { Json.parseToJsonElement(failure.responseBody.orEmpty()) as? JsonObject }
        .getOrNull() ?: return null
    fun text(key: String): String? = (body[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
    if (text("code") != "PROTECTED_MATCH_HISTORY") return null
    if (text("confirmation") != PROTECTED_MATCH_HISTORY_DELETE_CONFIRMATION) return null
    val ids = body["matchIds"] as? JsonArray ?: return null
    if (ids.isEmpty() || ids.any { id ->
            val value = (id as? JsonPrimitive)?.takeIf { it.isString }?.content
            value == null || value !in deletes
        }) return null
    return text("error")?.takeIf { it.isNotBlank() }
}
