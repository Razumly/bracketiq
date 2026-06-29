package com.razumly.mvp

import android.app.Application
import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.configuration.NotificationPlatformConfiguration
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig
import com.razumly.mvp.core.auth.MatchOperationNetworkSync
import com.razumly.mvp.core.auth.configureWatchSyncContext
import com.razumly.mvp.core.data.repositories.configureAppUpdateUrlOpener
import com.razumly.mvp.core.network.configureSecureAuthTokenStore
import com.razumly.mvp.core.util.configurePlatform
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
        configurePlatform(
            isDebugBuild = BuildConfig.DEBUG,
            buildType = BuildConfig.BUILD_TYPE,
            appVersionName = BuildConfig.VERSION_NAME,
            appBuildNumber = BuildConfig.VERSION_CODE,
        )
        configureSecureAuthTokenStore(applicationContext)
        configureWatchSyncContext(applicationContext)
        configureAppUpdateUrlOpener(applicationContext)
        initializePostHog()
        initializeFirebase()
        NotifierManager.initialize(
            configuration = NotificationPlatformConfiguration.Android(
                notificationIconResId = R.drawable.ic_notification_logo,
                showPushNotification = false,
            )
        )
        NotifierManager.setLogger { message ->
            Napier.d(message, tag = "Notifier Manager")
        }
        KoinInitializer(applicationContext).init()
        MatchOperationNetworkSync.start(applicationContext)
    }

    private fun initializePostHog() {
        val token = BuildConfig.POSTHOG_PROJECT_TOKEN.trimConfigValue()
        if (token.isBlank()) {
            Napier.d(tag = "PostHog", message = "PostHog project token missing; analytics disabled.")
            return
        }

        val host = BuildConfig.POSTHOG_HOST.trimConfigValue().ifBlank { "https://us.i.posthog.com" }
        runCatching {
            PostHogAndroid.setup(
                context = this,
                config = PostHogAndroidConfig(
                    apiKey = token,
                    host = host,
                ),
            )
        }.onSuccess {
            Napier.i(tag = "PostHog", message = "PostHog initialized for Android.")
        }.onFailure { throwable ->
            Napier.w(tag = "PostHog", throwable = throwable, message = "PostHog initialization failed.")
        }
    }

    private fun String.trimConfigValue(): String = trim().trim('"', '\'')

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
