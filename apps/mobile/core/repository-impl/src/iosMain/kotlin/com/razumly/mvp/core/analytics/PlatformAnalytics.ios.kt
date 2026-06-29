package com.razumly.mvp.core.analytics

import platform.Foundation.NSNotificationCenter

private const val ANALYTICS_CAPTURE_NOTIFICATION = "BracketIQAnalyticsCapture"
private const val ANALYTICS_IDENTIFY_NOTIFICATION = "BracketIQAnalyticsIdentify"
private const val ANALYTICS_RESET_NOTIFICATION = "BracketIQAnalyticsReset"

internal actual object PlatformAnalytics {
    actual fun capture(eventName: String, properties: AnalyticsProperties) {
        NSNotificationCenter.defaultCenter.postNotificationName(
            aName = ANALYTICS_CAPTURE_NOTIFICATION,
            `object` = null,
            userInfo = mapOf(
                "event" to eventName,
                "properties" to properties,
            ),
        )
    }

    actual fun identify(userId: String, properties: AnalyticsProperties) {
        NSNotificationCenter.defaultCenter.postNotificationName(
            aName = ANALYTICS_IDENTIFY_NOTIFICATION,
            `object` = null,
            userInfo = mapOf(
                "userId" to userId,
                "properties" to properties,
            ),
        )
    }

    actual fun reset() {
        NSNotificationCenter.defaultCenter.postNotificationName(
            aName = ANALYTICS_RESET_NOTIFICATION,
            `object` = null,
        )
    }
}
