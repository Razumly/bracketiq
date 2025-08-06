package com.razumly.mvp

import android.app.Application
import android.content.Context
import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration
import com.razumly.mvp.di.KoinInitializer
import io.github.aakira.napier.Napier

class MvpApp : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        NotifierManager.initialize(
            configuration = NotificationPlatformConfiguration.Android(
                notificationIconResId = R.drawable.ic_launcher_foreground,
                showPushNotification = true,
            )
        )
        NotifierManager.setLogger { message ->
            Napier.d(message, tag = "Notifier Manager")
        }
        KoinInitializer(applicationContext).init()
    }

    companion object {
        private var instance: MvpApp? = null

        fun applicationContext() : Context {
            return instance!!.applicationContext
        }
    }
}