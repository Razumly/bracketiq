package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NotificationSettingsTest {
    @Test
    fun normalizeNotificationSettings_usesDeclaredDefaultsWhenSettingsAreMissing() {
        val normalized = normalizeNotificationSettings(null)

        assertFalse(normalized.getValue("matchScheduleUpdates").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertFalse(normalized.getValue("chatMessages").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertTrue(normalized.getValue("invitations").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertTrue(normalized.getValue("invitations").getValue(NOTIFICATION_CHANNEL_PUSH))
    }

    @Test
    fun normalizeNotificationSettings_usesDeclaredDefaultsForMissingChannelsInPartialSettings() {
        val normalized = normalizeNotificationSettings(
            mapOf(
                "matchScheduleUpdates" to mapOf(NOTIFICATION_CHANNEL_PUSH to false),
                "chatMessages" to mapOf(NOTIFICATION_CHANNEL_EMAIL to true),
            ),
        )

        assertFalse(normalized.getValue("matchScheduleUpdates").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertFalse(normalized.getValue("matchScheduleUpdates").getValue(NOTIFICATION_CHANNEL_PUSH))
        // Email is unsupported for chat messages, so even legacy/invalid
        // explicit input must not opt the user into that channel.
        assertFalse(normalized.getValue("chatMessages").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertTrue(normalized.getValue("chatMessages").getValue(NOTIFICATION_CHANNEL_PUSH))
    }
}
