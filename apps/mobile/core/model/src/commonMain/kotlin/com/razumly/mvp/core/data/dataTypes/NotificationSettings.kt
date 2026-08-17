package com.razumly.mvp.core.data.dataTypes

const val NOTIFICATION_CHANNEL_EMAIL = "email"
const val NOTIFICATION_CHANNEL_PUSH = "push"

val notificationChannels = listOf(
    NOTIFICATION_CHANNEL_EMAIL,
    NOTIFICATION_CHANNEL_PUSH,
)

data class NotificationSettingOption(
    val id: String,
    val label: String,
    val description: String,
    val channels: Map<String, Boolean>,
)

val notificationSettingOptions = listOf(
    NotificationSettingOption(
        id = "invitations",
        label = "Invitations",
        description = "Event, team, staff, and organization invitations.",
        channels = mapOf(NOTIFICATION_CHANNEL_EMAIL to true, NOTIFICATION_CHANNEL_PUSH to true),
    ),
    NotificationSettingOption(
        id = "eventAnnouncements",
        label = "Event announcements",
        description = "Messages sent by an event host or manager.",
        channels = mapOf(NOTIFICATION_CHANNEL_EMAIL to true, NOTIFICATION_CHANNEL_PUSH to true),
    ),
    NotificationSettingOption(
        id = "matchScheduleUpdates",
        label = "Match and schedule updates",
        description = "Match times, assigned teams, and generated schedule changes.",
        channels = mapOf(NOTIFICATION_CHANNEL_EMAIL to false, NOTIFICATION_CHANNEL_PUSH to true),
    ),
    NotificationSettingOption(
        id = "chatMessages",
        label = "Chat messages",
        description = "New messages in chat groups you have not muted.",
        channels = mapOf(NOTIFICATION_CHANNEL_EMAIL to false, NOTIFICATION_CHANNEL_PUSH to true),
    ),
    NotificationSettingOption(
        id = "newEventsFromConnections",
        label = "New events from connections",
        description = "Events created by friends or people you follow.",
        channels = mapOf(NOTIFICATION_CHANNEL_EMAIL to true, NOTIFICATION_CHANNEL_PUSH to true),
    ),
    NotificationSettingOption(
        id = "hostActionRequired",
        label = "Host action required",
        description = "Operational event alerts that need host review.",
        channels = mapOf(NOTIFICATION_CHANNEL_EMAIL to true, NOTIFICATION_CHANNEL_PUSH to true),
    ),
)

typealias NotificationSettings = Map<String, Map<String, Boolean>>

fun isNotificationChannelSupported(type: String, channel: String): Boolean {
    val option = notificationSettingOptions.firstOrNull { it.id == type } ?: return false
    return option.channels[channel] == true
}

fun defaultNotificationSettings(): NotificationSettings =
    notificationSettingOptions.associate { option ->
        option.id to notificationChannels.associateWith { channel ->
            option.channels[channel] == true
        }
    }

fun normalizeNotificationSettings(settings: NotificationSettings?): NotificationSettings {
    val rawSettings = settings.orEmpty()
    return notificationSettingOptions.associate { option ->
        val rawChannels = rawSettings[option.id].orEmpty()
        option.id to notificationChannels.associateWith { channel ->
            isNotificationChannelSupported(option.id, channel) &&
                (rawChannels[channel] ?: (option.channels[channel] == true))
        }
    }
}

fun NotificationSettings.withNotificationSetting(
    type: String,
    channel: String,
    enabled: Boolean,
): NotificationSettings {
    if (!isNotificationChannelSupported(type, channel)) {
        return normalizeNotificationSettings(this)
    }

    val normalized = normalizeNotificationSettings(this).toMutableMap()
    val channelSettings = normalized[type].orEmpty().toMutableMap()
    channelSettings[channel] = enabled
    normalized[type] = channelSettings
    return normalizeNotificationSettings(normalized)
}
