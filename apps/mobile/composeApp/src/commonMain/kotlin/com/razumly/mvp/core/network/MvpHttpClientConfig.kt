package com.razumly.mvp.core.network

import com.razumly.mvp.core.util.Platform
import com.razumly.mvp.core.util.jsonMVP
import io.github.aakira.napier.Napier
import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CancellationException

private fun summarizeResponseBody(body: String?): String? {
    val normalized = body
        ?.lineSequence()
        ?.map(String::trim)
        ?.filter(String::isNotEmpty)
        ?.joinToString(" ")
        ?.takeIf(String::isNotBlank)
        ?: return null
    return normalized.take(1000)
}

internal fun HttpClientConfig<*>.configureMvpHttpClient() {
    install(HttpTimeout) {
        // Next.js dev server can take noticeable time to compile routes on first hit.
        connectTimeoutMillis = 15_000
        requestTimeoutMillis = 90_000
        socketTimeoutMillis = 90_000
    }

    install(ContentNegotiation) {
        json(jsonMVP)
    }

    if (Platform.isDebugBuild) {
        install(Logging) {
            level = LogLevel.INFO
            logger = object : Logger {
                override fun log(message: String) {
                    Napier.d("HTTP: $message")
                }
            }
            sanitizeHeader { header -> header == HttpHeaders.Authorization }
        }
    }

    defaultRequest {
        contentType(ContentType.Application.Json)
    }

    HttpResponseValidator {
        validateResponse { response ->
            if (!response.status.isSuccess()) {
                val body = runCatching { response.bodyAsText() }.getOrNull()
                throw ApiException(
                    statusCode = response.status.value,
                    url = response.call.request.url.toString(),
                    responseBody = body
                )
            }
        }
        handleResponseExceptionWithRequest { cause, request ->
            when (cause) {
                is ApiException -> {
                    val responseSummary = summarizeResponseBody(cause.responseBody)
                    val message = buildString {
                        append("HTTP request failed: ${request.method.value} ${request.url} -> HTTP ${cause.statusCode}")
                        if (!responseSummary.isNullOrBlank()) {
                            append(" | body=")
                            append(responseSummary)
                        }
                    }
                    if (cause.statusCode == HttpStatusCode.NotFound.value) {
                        Napier.i(message)
                    } else {
                        Napier.e(message, cause)
                    }
                }
                is CancellationException -> Napier.d(
                    "HTTP request cancelled: ${request.method.value} ${request.url} -> ${cause.message}"
                )
                else -> Napier.e(
                    "HTTP request failed: ${request.method.value} ${request.url} -> ${cause::class.simpleName}: ${cause.message}",
                    cause
                )
            }
        }
    }
}
