package com.razumly.mvp.core.network

import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

private val ERROR_MESSAGE_KEYS = listOf(
    "message",
    "error",
    "detail",
    "description",
    "reason",
)

private val HTTP_ERROR_ENVELOPE_REGEX = Regex(
    pattern = "(?s)^HTTP\\s+\\d{3}\\s+for\\s+.+?:\\s*(\\{.*|\\[.*)$",
)

private val JSON_BODY_AFTER_PREFIX_REGEX = Regex(
    pattern = "(?s)^.+:\\s*(\\{.*|\\[.*)$",
)

fun extractApiErrorMessage(rawError: String?): String? {
    val normalized = rawError
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.replace(Regex("\\s+"), " ")
        ?: return null

    val envelopeBody = HTTP_ERROR_ENVELOPE_REGEX.find(normalized)?.groupValues?.getOrNull(1)?.trim()
    if (!envelopeBody.isNullOrEmpty()) {
        return extractApiErrorMessage(envelopeBody) ?: sanitizePlainMessage(envelopeBody)
    }

    if (!normalized.startsWith("{") && !normalized.startsWith("[")) {
        val prefixedJsonBody = JSON_BODY_AFTER_PREFIX_REGEX
            .find(normalized)
            ?.groupValues
            ?.getOrNull(1)
            ?.trim()
        if (!prefixedJsonBody.isNullOrEmpty()) {
            return extractApiErrorMessage(prefixedJsonBody) ?: sanitizePlainMessage(prefixedJsonBody)
        }
    }

    if (normalized.startsWith("{") || normalized.startsWith("[")) {
        runCatching { jsonMVP.parseToJsonElement(normalized) }
            .getOrNull()
            ?.let(::extractFromJsonElement)
            ?.let(::sanitizePlainMessage)
            ?.let { return it }
    }

    return sanitizePlainMessage(normalized)
}

fun Throwable.userMessage(defaultMessage: String = "Something went wrong."): String {
    val fallback = sanitizePlainMessage(defaultMessage) ?: "Something went wrong."

    generateSequence(this) { it.cause }
        .forEach { throwable ->
            if (throwable is ApiException) {
                extractApiErrorMessage(throwable.responseBody)?.let { return it }
            }
            extractApiErrorMessage(throwable.message)?.let { return it }
        }

    return fallback
}

private fun extractFromJsonElement(element: JsonElement): String? = when (element) {
    is JsonPrimitive -> {
        if (element.isString) {
            sanitizePlainMessage(element.contentOrNull)
        } else {
            null
        }
    }
    is JsonObject -> extractFromJsonObject(element)
    is JsonArray -> element.asSequence().mapNotNull(::extractFromJsonElement).firstOrNull()
}

private fun extractFromJsonObject(jsonObject: JsonObject): String? {
    ERROR_MESSAGE_KEYS.forEach { key ->
        jsonObject[key]?.let { value ->
            extractFromJsonElement(value)?.let { return it }
        }
    }

    jsonObject["errors"]?.let { errors ->
        extractFromJsonElement(errors)?.let { return it }
    }

    jsonObject.values
        .asSequence()
        .filter { value -> value is JsonObject || value is JsonArray }
        .mapNotNull(::extractFromJsonElement)
        .firstOrNull()
        ?.let { return it }

    return jsonObject.values
        .asSequence()
        .mapNotNull(::extractFromJsonElement)
        .firstOrNull()
}

private fun sanitizePlainMessage(rawMessage: String?): String? {
    val trimmed = rawMessage?.trim()?.takeIf(String::isNotBlank) ?: return null
    return trimmed.trim('"').takeIf(String::isNotBlank)
}
