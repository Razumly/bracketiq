package com.razumly.mvp.core.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin

actual fun createMvpHttpClient(): HttpClient {
    return HttpClient(Darwin) {
        configureMvpHttpClient()
    }
}
