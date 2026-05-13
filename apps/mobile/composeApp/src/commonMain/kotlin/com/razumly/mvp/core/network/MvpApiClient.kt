package com.razumly.mvp.core.network

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType

class MvpApiClient(
    @PublishedApi
    internal val http: HttpClient,
    @PublishedApi
    internal val baseUrl: String,
    @PublishedApi
    internal val tokenStore: AuthTokenStore,
) {
    @PublishedApi
    internal fun urlFor(path: String): String {
        val b = baseUrl.trimEnd('/')
        val p = path.trimStart('/')
        return "$b/$p"
    }

    fun webSocketUrlFor(path: String): String {
        val httpUrl = urlFor(path)
        return when {
            httpUrl.startsWith("https://") -> "wss://${httpUrl.removePrefix("https://")}"
            httpUrl.startsWith("http://") -> "ws://${httpUrl.removePrefix("http://")}"
            else -> httpUrl
        }
    }

    suspend fun webSocket(path: String, block: suspend DefaultClientWebSocketSession.() -> Unit) {
        val token = tokenStore.get()
        http.webSocket(
            request = {
                url(webSocketUrlFor(path))
                if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
            },
        ) {
            block()
        }
    }

    suspend inline fun <reified Res> get(path: String): Res {
        val token = tokenStore.get()
        return http.get(urlFor(path)) {
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
        }.body()
    }

    suspend fun getBytes(path: String): ByteArray {
        val token = tokenStore.get()
        return http.get(urlFor(path)) {
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
        }.bodyAsBytes()
    }

    suspend inline fun <reified Req : Any, reified Res> post(path: String, body: Req): Res {
        val token = tokenStore.get()
        return http.post(urlFor(path)) {
            contentType(ContentType.Application.Json)
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
            setBody(body)
        }.body()
    }

    suspend inline fun <reified Req : Any> postNoResponse(path: String, body: Req) {
        val token = tokenStore.get()
        http.post(urlFor(path)) {
            contentType(ContentType.Application.Json)
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
            setBody(body)
        }.bodyAsText()
    }

    suspend inline fun <reified Req : Any, reified Res> put(path: String, body: Req): Res {
        val token = tokenStore.get()
        return http.put(urlFor(path)) {
            contentType(ContentType.Application.Json)
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
            setBody(body)
        }.body()
    }

    suspend inline fun <reified Req : Any, reified Res> patch(path: String, body: Req): Res {
        val token = tokenStore.get()
        return http.patch(urlFor(path)) {
            contentType(ContentType.Application.Json)
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
            setBody(body)
        }.body()
    }

    suspend inline fun <reified Req : Any, reified Res> delete(path: String, body: Req): Res {
        val token = tokenStore.get()
        return http.delete(urlFor(path)) {
            contentType(ContentType.Application.Json)
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
            setBody(body)
        }.body()
    }

    suspend fun postNoResponse(path: String) {
        val token = tokenStore.get()
        http.post(urlFor(path)) {
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
        }.bodyAsText()
    }

    suspend fun deleteNoResponse(path: String) {
        val token = tokenStore.get()
        http.delete(urlFor(path)) {
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
        }.bodyAsText()
    }

    suspend inline fun <reified Req : Any> deleteNoResponse(path: String, body: Req) {
        val token = tokenStore.get()
        http.delete(urlFor(path)) {
            contentType(ContentType.Application.Json)
            if (token.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $token")
            setBody(body)
        }.bodyAsText()
    }
}
