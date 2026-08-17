package com.razumly.mvp

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration
import platform.Foundation.NSNotificationCenter

fun initializeIosNotificationManager() {
    NotifierManager.initialize(
        NotificationPlatformConfiguration.Ios(
            showPushNotification = false,
            askNotificationPermissionOnStart = false,
            notificationSoundName = null,
        ),
    )
}

actual fun registerForRemoteNotificationsAfterPermission() {
    NSNotificationCenter.defaultCenter.postNotificationName(
        "MVPRegisterForRemoteNotificationsAfterPermission",
        null,
    )
}
