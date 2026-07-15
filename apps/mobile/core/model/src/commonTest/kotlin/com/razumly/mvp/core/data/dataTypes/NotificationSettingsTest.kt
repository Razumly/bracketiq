package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NotificationSettingsTest {
    @Test
    fun normalizeNotificationSettings_usesEachOptionDeclaredDefaultWhenSettingsAreMissing() {
        val settings = normalizeNotificationSettings(null)

        assertTrue(settings.getValue("invitations").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertFalse(settings.getValue("matchScheduleUpdates").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertFalse(settings.getValue("chatMessages").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertTrue(settings.getValue("matchScheduleUpdates").getValue(NOTIFICATION_CHANNEL_PUSH))
    }

    @Test
    fun normalizeNotificationSettings_preservesExplicitValuesAndFillsPartialSettingsFromDefaults() {
        val settings = normalizeNotificationSettings(
            mapOf(
                "matchScheduleUpdates" to mapOf(NOTIFICATION_CHANNEL_PUSH to false),
                "invitations" to mapOf(NOTIFICATION_CHANNEL_EMAIL to false),
            ),
        )

        assertFalse(settings.getValue("matchScheduleUpdates").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertFalse(settings.getValue("matchScheduleUpdates").getValue(NOTIFICATION_CHANNEL_PUSH))
        assertFalse(settings.getValue("invitations").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertTrue(settings.getValue("invitations").getValue(NOTIFICATION_CHANNEL_PUSH))
        assertFalse(settings.getValue("chatMessages").getValue(NOTIFICATION_CHANNEL_EMAIL))
        assertTrue(settings.getValue("chatMessages").getValue(NOTIFICATION_CHANNEL_PUSH))
    }

    @Test
    fun defaultNotificationSettings_matchesNormalizedMissingSettings() {
        assertEquals(defaultNotificationSettings(), normalizeNotificationSettings(emptyMap()))
    }
}
