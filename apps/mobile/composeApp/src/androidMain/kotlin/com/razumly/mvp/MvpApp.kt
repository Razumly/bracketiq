package com.razumly.mvp

import android.app.Application
import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration
import com.razumly.mvp.di.KoinInitializer
import io.github.aakira.napier.DebugAntilog
import io.github.aakira.napier.Napier

class MvpApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Napier.base(DebugAntilog())
            Napier.d("Napier DebugAntilog initialized for Android debug builds", tag = "Logging")
        }
        instance = this
        initializeFirebase()
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

    private fun initializeFirebase() {
        val options = FirebaseOptions.fromResource(this)
        if (options == null) {
            Napier.e(
                tag = "Firebase",
                message = "Firebase options missing from Android resources. " +
                    "Verify composeApp/google-services.json and processDebugGoogleServices output."
            )
            return
        }

        val apiKey = options.apiKey?.trim().orEmpty()
        val appId = options.applicationId?.trim().orEmpty()
        val projectId = options.projectId?.trim().orEmpty()
        if (apiKey.isBlank() || appId.isBlank() || projectId.isBlank()) {
            Napier.e(
                tag = "Firebase",
                message = "Firebase options are incomplete. " +
                    "apiKeyPresent=${apiKey.isNotBlank()}, appIdPresent=${appId.isNotBlank()}, " +
                    "projectIdPresent=${projectId.isNotBlank()}. " +
                    "Update composeApp/google-services.json for package com.razumly.mvp."
            )
            return
        }

        val hasDefaultApp = FirebaseApp.getApps(this).any { it.name == FirebaseApp.DEFAULT_APP_NAME }
        if (hasDefaultApp) {
            Napier.d(tag = "Firebase", message = "Firebase already initialized by FirebaseInitProvider.")
            return
        }

        runCatching {
            FirebaseApp.initializeApp(this, options)
        }.onSuccess { app ->
            Napier.i(
                tag = "Firebase",
                message = "Initialized Firebase app '${app?.name ?: "null"}' for project '$projectId'."
            )
        }.onFailure { throwable ->
            Napier.e(
                tag = "Firebase",
                throwable = throwable,
                message = "Failed to initialize Firebase. Verify API key, project ID, and application ID."
            )
        }
    }

    companion object {
        private var instance: MvpApp? = null

        fun applicationContext() : Context {
            return instance!!.applicationContext
        }
    }
}
