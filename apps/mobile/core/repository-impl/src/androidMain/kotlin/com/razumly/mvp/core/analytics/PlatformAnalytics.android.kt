package com.razumly.mvp.core.analytics

import com.posthog.PostHog
import io.github.aakira.napier.Napier

internal actual object PlatformAnalytics {
    actual fun capture(eventName: String, properties: AnalyticsProperties) {
        runCatching {
            PostHog.capture(event = eventName, properties = properties)
        }.onFailure { throwable ->
            Napier.w(tag = "PostHog", throwable = throwable, message = "Failed to capture analytics event.")
        }
    }

    actual fun identify(userId: String, properties: AnalyticsProperties) {
        runCatching {
            PostHog.identify(distinctId = userId, userProperties = properties)
        }.onFailure { throwable ->
            Napier.w(tag = "PostHog", throwable = throwable, message = "Failed to identify analytics user.")
        }
    }

    actual fun reset() {
        runCatching {
            PostHog.reset()
        }.onFailure { throwable ->
            Napier.w(tag = "PostHog", throwable = throwable, message = "Failed to reset analytics user.")
        }
    }
}
