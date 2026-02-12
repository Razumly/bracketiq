package com.razumly.mvp.core.network

import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.statement.bodyAsText
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.http.ContentType
import io.ktor.serialization.kotlinx.json.json

actual fun createMvpHttpClient(): HttpClient {
    return HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(jsonMVP)
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
        }

    }
}
