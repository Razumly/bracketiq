package com.razumly.mvp

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration

fun initializeIosNotificationManager() {
    NotifierManager.initialize(
        NotificationPlatformConfiguration.Ios(
            showPushNotification = false,
            askNotificationPermissionOnStart = false,
            notificationSoundName = null,
        ),
    )
}
