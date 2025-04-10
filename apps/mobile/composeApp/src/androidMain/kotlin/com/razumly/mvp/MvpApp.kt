package com.razumly.mvp

import android.app.Application
import com.google.firebase.FirebaseApp
import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration
import com.razumly.mvp.di.KoinInitializer
import io.github.aakira.napier.Napier

class MvpApp : Application() {
    override fun onCreate() {
        super.onCreate()

        NotifierManager.initialize(
            configuration = NotificationPlatformConfiguration.Android(
                notificationIconResId = R.drawable.logo_mvp,
                showPushNotification = true,
            )
        )
        NotifierManager.setLogger({ message ->
            Napier.d(message, tag = "Notifier Manager")
        })
        KoinInitializer(applicationContext).init()
    }
}