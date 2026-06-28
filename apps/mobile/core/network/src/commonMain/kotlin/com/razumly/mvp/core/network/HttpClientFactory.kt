package com.razumly.mvp.core.network

import io.ktor.client.HttpClient

expect fun createMvpHttpClient(): HttpClient
