package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.util.AppSecrets
import platform.Foundation.NSBundle

internal actual fun billingAddressPlacesApiKey(): String = AppSecrets.googlePlacesApiKey

internal actual fun billingAddressPlacesRequestHeaders(): Map<String, String> =
    NSBundle.mainBundle.bundleIdentifier
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.let { bundleId -> mapOf("X-Ios-Bundle-Identifier" to bundleId) }
        ?: emptyMap()
