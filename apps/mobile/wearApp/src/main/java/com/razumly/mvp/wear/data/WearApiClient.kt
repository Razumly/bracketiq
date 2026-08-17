package com.razumly.mvp.wear.data

import android.os.Build
import com.razumly.mvp.wear.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.ResponseException
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.logging.DEFAULT
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.net.URI

class WearApiException(message: String, cause: Throwable? = null) : Exception(message, cause)

class WearApiClient(
    private val tokenStore: WearAuthTokenStore,
    private val json: Json = createWearJson(),
) {
    private val baseUrl: String = resolveApiBaseUrl(
        BuildConfig.MVP_API_BASE_URL,
        BuildConfig.MVP_API_BASE_URL_REMOTE,
    )

    @PublishedApi
    internal val http = HttpClient(OkHttp) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(json)
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 20_000
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 20_000
        }
        if (BuildConfig.DEBUG) {
            install(Logging) {
                logger = Logger.DEFAULT
                level = LogLevel.INFO
            }
        }
        HttpResponseValidator {
            handleResponseExceptionWithRequest { cause, _ ->
                throw WearApiException(cause.toUserMessage(), cause)
            }
        }
    }

    fun urlFor(path: String): String {
        val normalizedBase = baseUrl.trimEnd('/')
        val normalizedPath = path.trimStart('/')
        return "$normalizedBase/$normalizedPath"
    }

    suspend inline fun <reified Res> get(path: String): Res =
        http.get(urlFor(path)) {
            bearerHeader()
        }.body()

    suspend inline fun <reified Req : Any, reified Res> post(path: String, body: Req): Res =
        http.post(urlFor(path)) {
            contentType(ContentType.Application.Json)
            bearerHeader()
            setBody(body)
        }.body()

    suspend inline fun <reified Res> patchJson(path: String, body: JsonObject): Res =
        http.patch(urlFor(path)) {
            contentType(ContentType.Application.Json)
            bearerHeader()
            setBody(body)
        }.body()

    @PublishedApi
    internal fun io.ktor.client.request.HttpRequestBuilder.bearerHeader() {
        val token = tokenStore.token()
        if (token.isNotBlank()) {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
    }
}

internal fun createWearJson(): Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
    coerceInputValues = true
}

suspend fun Throwable.toUserMessage(): String {
    if (this is WearApiException) return message ?: "Request failed"
    if (this is ResponseException) {
        val body = runCatching { response.bodyAsText().trim() }.getOrNull().orEmpty()
        return when {
            body.startsWith("{") -> body
            body.isNotBlank() -> body
            else -> "Request failed with HTTP ${response.status.value}"
        }
    }
    return message?.takeIf(String::isNotBlank) ?: "Request failed"
}

private fun isEmulator(): Boolean {
    val fingerprint = Build.FINGERPRINT?.lowercase().orEmpty()
    val model = Build.MODEL.orEmpty()
    val brand = Build.BRAND.orEmpty()
    val device = Build.DEVICE.orEmpty()
    val manufacturer = Build.MANUFACTURER.orEmpty()
    val product = Build.PRODUCT.orEmpty()
    return fingerprint.startsWith("generic") ||
        fingerprint.startsWith("unknown") ||
        model.contains("google_sdk", ignoreCase = true) ||
        model.contains("emulator", ignoreCase = true) ||
        model.contains("sdk_gphone", ignoreCase = true) ||
        brand.startsWith("generic") ||
        device.startsWith("generic") ||
        manufacturer.contains("genymotion", ignoreCase = true) ||
        product.contains("sdk", ignoreCase = true)
}

private fun resolveApiBaseUrl(baseUrl: String, remoteBaseUrl: String): String {
    val local = baseUrl.trim().trimEnd('/')
    val remote = remoteBaseUrl.trim().trimEnd('/')
    if (isEmulator()) return local
    if (remote.isNotBlank()) return remote

    val host = runCatching { URI(local).host }.getOrNull()
    return if (host == "10.0.2.2" || host == "127.0.0.1" || host == "localhost") {
        "https://bracket-iq.com"
    } else {
        local
    }
}
