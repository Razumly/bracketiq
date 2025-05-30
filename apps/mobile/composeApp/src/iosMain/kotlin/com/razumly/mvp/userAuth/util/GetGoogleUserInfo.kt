package com.razumly.mvp.userAuth.util

import io.github.aakira.napier.Napier
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json


suspend fun getGoogleUserInfo(accessToken: String): GoogleUserInfo {
    val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
    }

    try {
        val response = client.get("https://www.googleapis.com/oauth2/v2/userinfo") {
            headers {
                append(HttpHeaders.Authorization, "Bearer $accessToken")
            }
        }
        Napier.d("Google user info: ${response.status}")

        if (response.status.isSuccess()) {
            return response.body<GoogleUserInfo>()
        } else {
            throw Exception("Failed to get Google user info: ${response.status}")
        }
    } finally {
        client.close()
    }
}


@Serializable
data class GoogleUserInfo(
    val email: String,
    val givenName: String = "",
    val familyName: String = "",
)
