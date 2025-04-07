package com.razumly.mvp

import android.app.Application
import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration
import com.razumly.mvp.di.KoinInitializer

class MvpApp : Application() {
    override fun onCreate() {
        super.onCreate()

        NotifierManager.initialize(
            configuration = NotificationPlatformConfiguration.Android(
                notificationIconResId = R.drawable.logo_mvp,
                showPushNotification = true,
            )
        )
        KoinInitializer(applicationContext).init()
    }
}