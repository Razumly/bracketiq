package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * Encodes a PATCH object with the app-wide compact JSON configuration while
 * preserving explicitly requested nullable clears.
 *
 * `jsonMVP` intentionally omits ordinary nulls. That is appropriate for most
 * request DTOs, but PATCH endpoints use key presence to distinguish an
 * unchanged value from an intentional clear. Callers must therefore provide
 * only fields whose null value was deliberately selected for this request.
 */
fun <T> encodeExplicitNullPatchObject(
    serializer: SerializationStrategy<T>,
    value: T,
    explicitNullFields: Set<String> = emptySet(),
): JsonObject {
    val encoded = jsonMVP.encodeToJsonElement(serializer, value).jsonObject
    if (explicitNullFields.isEmpty()) return encoded

    return JsonObject(encoded.toMutableMap().apply {
        explicitNullFields.forEach { field -> this[field] = JsonNull }
    })
}

/**
 * Finds nullable fields that changed from a serialized non-null value to an
 * omitted value. The caller supplies a route-specific allowlist so omitted
 * compatibility or relationship fields can never become accidental clears.
 */
fun explicitNullFieldsForPatch(
    previous: JsonObject,
    updated: JsonObject,
    clearableFields: Set<String>,
): Set<String> = clearableFields.filterTo(linkedSetOf()) { field ->
    previous[field] != null && previous[field] != JsonNull && updated[field] == null
}
