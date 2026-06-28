package com.razumly.mvp.core.data.repositories

import platform.Foundation.NSUserDefaults

private const val IOS_FCM_TOKEN_USER_DEFAULTS_KEY = "mvp_ios_fcm_token"

internal actual suspend fun platformPushTokenOrNull(): String? {
    val token = NSUserDefaults.standardUserDefaults.stringForKey(IOS_FCM_TOKEN_USER_DEFAULTS_KEY)
        ?.trim()
    return token?.takeIf(String::isNotBlank)
}
