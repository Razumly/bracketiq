package com.razumly.mvp.core.network

import kotlin.test.Test
import kotlin.test.assertEquals

class ApiBaseUrlAndroidTest {
    @Test
    fun givenReleaseBuildOnPhysicalDevice_whenRemoteIsNgrok_thenUsesProduction() {
        val result = resolveAndroidApiBaseUrl(
            baseUrl = "http://10.0.2.2:3000",
            remoteBaseUrl = "https://example.ngrok-free.dev",
            runningOnEmulator = false,
            isDebugBuild = false,
        )

        assertEquals("https://bracket-iq.com", result)
    }

    @Test
    fun givenReleaseBuildOnEmulator_whenLocalEndpointExists_thenUsesProduction() {
        val result = resolveAndroidApiBaseUrl(
            baseUrl = "http://10.0.2.2:3000",
            remoteBaseUrl = "https://example.ngrok-free.dev",
            runningOnEmulator = true,
            isDebugBuild = false,
        )

        assertEquals("https://bracket-iq.com", result)
    }

    @Test
    fun givenDebugBuildOnPhysicalDevice_whenRemoteIsNgrok_thenUsesRemote() {
        val result = resolveAndroidApiBaseUrl(
            baseUrl = "http://10.0.2.2:3000",
            remoteBaseUrl = "https://example.ngrok-free.dev",
            runningOnEmulator = false,
            isDebugBuild = true,
        )

        assertEquals("https://example.ngrok-free.dev", result)
    }

    @Test
    fun givenReleaseBuild_whenRedirectValuesAreNgrok_thenUsesProduction() {
        val result = resolveAndroidStripeRedirectBaseUrl(
            resolvedApiBaseUrl = "https://example.ngrok-free.dev",
            remoteBaseUrl = "https://example.ngrok-free.dev",
            webBaseUrl = "https://example.ngrok-free.dev",
            runningOnEmulator = false,
            isDebugBuild = false,
        )

        assertEquals("https://bracket-iq.com", result)
    }
}
