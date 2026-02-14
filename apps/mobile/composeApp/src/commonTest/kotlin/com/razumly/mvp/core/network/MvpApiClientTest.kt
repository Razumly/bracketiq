package com.razumly.mvp.core.network

import com.razumly.mvp.core.util.jsonMVP
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

private class InMemoryAuthTokenStore(
    private var token: String = "",
) : AuthTokenStore {
    override suspend fun get(): String = token
    override suspend fun set(token: String) { this.token = token }
    override suspend fun clear() { token = "" }
}

@Serializable
private data class OkResponse(val ok: Boolean)

class MvpApiClientTest {
    @Test
    fun get_attaches_bearer_token_when_present() = runTest {
        val tokenStore = InMemoryAuthTokenStore("abc")

        val engine = MockEngine { request ->
            assertEquals("Bearer abc", request.headers[HttpHeaders.Authorization])
            respond(
                content = """{"ok":true}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val res = api.get<OkResponse>("/api/ping")
        assertEquals(true, res.ok)
    }

    @Test
    fun get_does_not_attach_authorization_header_when_no_token() = runTest {
        val tokenStore = InMemoryAuthTokenStore("")

        val engine = MockEngine { request ->
            assertEquals(null, request.headers[HttpHeaders.Authorization])
            respond(
                content = """{"ok":true}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val res = api.get<OkResponse>("/api/ping")
        assertEquals(true, res.ok)
    }

    @Test
    fun postNoResponse_with_body_attaches_bearer_token_when_present() = runTest {
        val tokenStore = InMemoryAuthTokenStore("abc")

        val engine = MockEngine { request ->
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/ping", request.url.encodedPath)
            assertEquals("Bearer abc", request.headers[HttpHeaders.Authorization])
            respond(
                content = """{"ok":true}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        api.postNoResponse("/api/ping", OkResponse(ok = true))
    }

    @Test
    fun non_2xx_throws_ApiException_when_validator_installed() = runTest {
        val tokenStore = InMemoryAuthTokenStore("abc")

        val engine = MockEngine {
            respond(
                content = """{"error":"nope"}""",
                status = HttpStatusCode.Unauthorized,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }

        val http = HttpClient(engine) {
            install(ContentNegotiation) { json(jsonMVP) }
            HttpResponseValidator {
                validateResponse { response ->
                    if (!response.status.isSuccess()) {
                        throw ApiException(
                            statusCode = response.status.value,
                            url = response.call.request.url.toString(),
                            responseBody = response.bodyAsText()
                        )
                    }
                }
            }
        }

        val api = MvpApiClient(http, "http://example.test", tokenStore)
        val ex = assertFailsWith<ApiException> { api.get<OkResponse>("/api/ping") }
        assertEquals(401, ex.statusCode)
    }
}
