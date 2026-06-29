package com.razumly.mvp.core.analytics

import com.razumly.mvp.core.util.Platform

typealias AnalyticsProperties = Map<String, String>

object AnalyticsTracker {
    fun capture(event: AnalyticsEvent, properties: AnalyticsProperties = emptyMap()) {
        PlatformAnalytics.capture(event.eventName, baseProperties() + sanitize(properties))
    }

    fun identify(userId: String, properties: AnalyticsProperties = emptyMap()) {
        val normalizedUserId = userId.trim()
        if (normalizedUserId.isBlank()) return

        PlatformAnalytics.identify(normalizedUserId, baseProperties() + sanitize(properties))
    }

    fun reset() {
        PlatformAnalytics.reset()
    }

    private fun baseProperties(): AnalyticsProperties = buildMap {
        put("platform", Platform.name.lowercase())
        if (Platform.appVersionName.isNotBlank()) {
            put("app_version", Platform.appVersionName)
        }
        Platform.appBuildNumber?.let { buildNumber ->
            put("app_build_number", buildNumber.toString())
        }
        put("build_type", if (Platform.isNonReleaseBuild) "non_release" else "release")
    }

    private fun sanitize(properties: AnalyticsProperties): AnalyticsProperties =
        properties
            .mapKeys { entry -> entry.key.trim() }
            .mapValues { entry -> entry.value.trim() }
            .filterKeys(String::isNotBlank)
            .filterValues(String::isNotBlank)
}

internal expect object PlatformAnalytics {
    fun capture(eventName: String, properties: AnalyticsProperties)
    fun identify(userId: String, properties: AnalyticsProperties)
    fun reset()
}
