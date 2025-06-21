package com.razumly.mvp

import android.app.Application
import android.content.Context
import com.google.firebase.FirebaseApp
import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration
import com.razumly.mvp.di.KoinInitializer
import com.stripe.android.paymentsheet.PaymentSheet
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

    companion object {
        private var instance: MvpApp? = null

        fun applicationContext() : Context {
            return instance!!.applicationContext
        }
    }
}