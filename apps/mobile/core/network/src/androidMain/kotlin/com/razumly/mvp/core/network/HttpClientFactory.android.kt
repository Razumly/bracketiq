package com.razumly.mvp.core.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp

actual fun createMvpHttpClient(): HttpClient {
    return HttpClient(OkHttp) {
        configureMvpHttpClient()
    }
}
